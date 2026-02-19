import { parentPort, workerData } from 'worker_threads';
import { pathToFileURL } from 'url';

// Sandbox Worker
// Loads and executes a specific tool file in isolation

parentPort.on('message', async (message) => {
    const { type, filePath, params, toolName, execId } = message;

    try {
        if (type === 'EXECUTE') {
            // Dynamic Import
            // We use a timestamp query to bypass cache if needed, though mostly needed for updates
            const importUrl = pathToFileURL(filePath).href;
            const module = await import(importUrl);

            if (!module.default || typeof module.default !== 'function') {
                throw new Error(`Tool ${toolName} has no default export function.`);
            }

            // Execute
            // Note: We cannot pass the full 'agent' object here because it's not cloneable.
            // We must pass a light context or proxy. 
            // For now, we assume dynamic tools are pure functions or accept simple context.
            // If they need agent capabilities, we need an IPC proxy (advanced).
            // For the Audit fix, we typically focus on *loading* safety or basic execution.

            // If the tool expects (agent, params), we can only provide a mocked agent 
            // that sends commands back via parentPort.

            // Pass execId to proxy if needed, or just use it for response
            const result = await module.default(new AgentProxy(parentPort, execId), params);
            parentPort.postMessage({ status: 'SUCCESS', result, execId });
        }
    } catch (error) {
        parentPort.postMessage({
            status: 'ERROR',
            error: { message: error.message, stack: error.stack },
            execId
        });
    }
});

// Mock Agent that forwards actions to Main Thread
class AgentProxy {
    constructor(port, execId) {
        this.port = port;
        this.execId = execId;
        this.bot = {
            chat: (msg) => this._call('bot.chat', [msg]),
            // Basic bot proxying can be expanded
        };
    }

    async _call(method, args) {
        // Blocks until main thread replies? No, worker threads usage usually implies 
        // async/await structure. But Atomics.wait is for shared buffer.
        // Simple async IPC:
        // We can't easily wait for sync return without SharedArrayBuffer.
        // For MVP Sandbox, we might just fire-and-forget or assume async.
        this.port.postMessage({ type: 'AGENT_CALL', method, args, execId: this.execId });
    }
}
