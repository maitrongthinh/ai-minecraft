import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CogneeServiceManager {
    constructor() {
        this.pythonProcess = null;
        this.servicePath = path.join(__dirname, '../../services/memory_service.py');
    }

    async start() {
        if (this.pythonProcess) return;

        console.log('[CogneeServiceManager] 🚀 Starting Cognee Python Service...');

        // Check if service exists
        if (!fs.existsSync(this.servicePath)) {
            console.error(`[CogneeServiceManager] ✗ Service file not found at ${this.servicePath}`);
            return;
        }

        try {
            // Spawn uvicorn/python process
            this.pythonProcess = spawn('python', [this.servicePath], {
                stdio: 'inherit',
                shell: true
            });

            this.pythonProcess.on('error', (err) => {
                console.error('[CogneeServiceManager] ✗ Failed to start Python process:', err.message);
            });

            this.pythonProcess.on('close', (code) => {
                console.log(`[CogneeServiceManager] ⚰️ Python process exited with code ${code}`);
                this.pythonProcess = null;
            });

            // Wait a few seconds for initialization
            await new Promise(resolve => setTimeout(resolve, 5000));
            console.log('[CogneeServiceManager] ✓ Cognee Service should be running on port 8001');

        } catch (err) {
            console.error('[CogneeServiceManager] ✗ Error during spawn:', err.message);
        }
    }

    stop() {
        if (this.pythonProcess) {
            console.log('[CogneeServiceManager] 🛑 Stopping Cognee Service...');
            this.pythonProcess.kill();
            this.pythonProcess = null;
        }
    }
}

export const cogneeManager = new CogneeServiceManager();
