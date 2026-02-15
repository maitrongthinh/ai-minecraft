/**
 * PathfindingWorker.js - Async Navigation Core
 * 
 * Offloads mineflayer-pathfinder A* calculations to a dedicated Worker Thread.
 * Prevents main event loop stutters in high-load scenarios.
 */

import { Worker, isMainThread, parentPort } from 'worker_threads';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PathfindingWorkerController {
    constructor(agent) {
        this.agent = agent;
        this.worker = null;
        this.pendingRequests = new Map();
        this.requestIdCounter = 0;

        if (isMainThread) {
            this._initWorker();
        }
    }

    _initWorker() {
        const workerPath = path.join(__dirname, 'PathfindingWorker.js');
        this.worker = new Worker(workerPath);

        this.worker.on('message', (msg) => {
            const { id, path, error } = msg;
            const resolver = this.pendingRequests.get(id);
            if (resolver) {
                if (error) resolver.reject(new Error(error));
                else resolver.resolve(path);
                this.pendingRequests.delete(id);
            }
        });

        this.worker.on('error', (err) => {
            console.error('[PathfindingWorker] Worker Error:', err);
            this._initWorker(); // Restart on crash
        });
    }

    async findPath(start, end, movements) {
        if (!isMainThread) return null;
        const id = this.requestIdCounter++;
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.worker.postMessage({
                id,
                start: { x: start.x, y: start.y, z: start.z },
                end: { x: end.x, y: end.y, z: end.z },
                movements: {
                    canDig: movements.canDig,
                    canPlaceOn: movements.canPlaceOn,
                    liquidCost: movements.liquidCost,
                }
            });
        });
    }

    terminate() {
        if (this.worker) this.worker.terminate();
    }
}

// Worker Thread entry point
if (!isMainThread) {
    /**
     * Simplified A* Pathfinding Algorithm
     * @param {Object} start - Start position {x, y, z}
     * @param {Object} end - End position {x, y, z}
     * @param {Object} worldData - Optional world collision data
     * @returns {Array} Array of waypoints
     */
    function findPathAStar(start, end, worldData = {}) {
        // Priority queue simulation using simple array sorting
        const openSet = [{ pos: start, g: 0, h: heuristic(start, end), f: heuristic(start, end), parent: null }];
        const closedSet = new Set();
        const visited = new Map();

        function heuristic(a, b) {
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const dz = a.z - b.z;
            return Math.sqrt(dx * dx + dy * dy + dz * dz);
        }

        function posKey(p) {
            return `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
        }

        // Possible movements (26 neighbors + vertical)
        const neighbors = [
            // Horizontal (4-way)
            { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
            { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
            // Diagonal horizontal (4-way)
            { x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: -1 },
            { x: -1, y: 0, z: 1 }, { x: -1, y: 0, z: -1 },
            // Vertical
            { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
            // Vertical + horizontal for climbing
            { x: 1, y: 1, z: 0 }, { x: -1, y: 1, z: 0 },
            { x: 0, y: 1, z: 1 }, { x: 0, y: 1, z: -1 },
        ];

        let iterations = 0;
        const maxIterations = 10000;

        while (openSet.length > 0 && iterations < maxIterations) {
            iterations++;

            // Find node with lowest f score
            let current = openSet[0];
            let currentIdx = 0;
            for (let i = 1; i < openSet.length; i++) {
                if (openSet[i].f < current.f) {
                    current = openSet[i];
                    currentIdx = i;
                }
            }

            const currentKey = posKey(current.pos);

            // Goal reached
            if (heuristic(current.pos, end) < 1.0) {
                const path = [];
                let node = current;
                while (node) {
                    path.unshift(node.pos);
                    node = node.parent;
                }
                return path;
            }

            openSet.splice(currentIdx, 1);
            closedSet.add(currentKey);

            // Check neighbors
            for (const move of neighbors) {
                const neighbor = {
                    x: current.pos.x + move.x,
                    y: current.pos.y + move.y,
                    z: current.pos.z + move.z
                };

                const neighborKey = posKey(neighbor);

                if (closedSet.has(neighborKey)) continue;

                const moveCost = move.y !== 0 ? 1.5 : (move.x !== 0 && move.z !== 0 ? 1.4 : 1);
                const g = current.g + moveCost;
                const h = heuristic(neighbor, end);
                const f = g + h;

                // Check if neighbor already in open set
                const existing = openSet.find(n => posKey(n.pos) === neighborKey);
                if (existing && g >= existing.g) continue;

                // Remove old entry if worse
                if (existing) {
                    const idx = openSet.indexOf(existing);
                    openSet.splice(idx, 1);
                }

                openSet.push({
                    pos: neighbor,
                    g: g,
                    h: h,
                    f: f,
                    parent: current
                });
            }
        }

        // No path found - return linear interpolation as fallback
        const points = [];
        let current = { ...start };
        const steps = 50;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            points.push({
                x: start.x + (end.x - start.x) * t,
                y: start.y + (end.y - start.y) * t,
                z: start.z + (end.z - start.z) * t
            });
        }
        return points;
    }

    parentPort.on('message', async (data) => {
        const { id, start, end, movements } = data;

        try {
            // Execute A* pathfinding
            const path = findPathAStar(start, end, {
                canDig: movements.canDig,
                canPlaceOn: movements.canPlaceOn,
                liquidCost: movements.liquidCost
            });

            parentPort.postMessage({ id, path });
        } catch (error) {
            parentPort.postMessage({ id, error: error.message });
        }
    });
}
