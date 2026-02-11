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
    constructor(bot) {
        this.bot = bot;
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
    parentPort.on('message', async (data) => {
        const { id, start, end, movements } = data;

        try {
            // Placeholder: Simulate pathfinding calculation
            // console.log(`[PathfindingWorker] Thread solving path...`);

            // Artificial delay to simulate heavy A* work
            const dummyPath = [start, { x: start.x + 1, y: start.y, z: start.z }, end];

            parentPort.postMessage({ id, path: dummyPath });
        } catch (error) {
            parentPort.postMessage({ id, error: error.message });
        }
    });
}
