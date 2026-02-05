import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const BOT_SCRIPT = 'main.js'; // Adjust if your entry point is different
const LOCK_FILE = path.resolve('./health.lock');
const TIMEOUT = 30000; // 30 seconds

let botProcess = null;

function startBot() {
    console.log('[Watchdog] Starting bot process...');

    // Spawn node process
    botProcess = spawn('node', [BOT_SCRIPT], {
        stdio: 'inherit',
        shell: true
    });

    botProcess.on('exit', (code) => {
        console.warn(`[Watchdog] Bot exited with code ${code}. Restarting in 5s...`);
        botProcess = null;
        setTimeout(startBot, 5000);
    });
}

function checkHealth() {
    if (!botProcess) return;

    try {
        if (fs.existsSync(LOCK_FILE)) {
            const data = fs.readFileSync(LOCK_FILE, 'utf8');
            const json = JSON.parse(data);
            const now = Date.now();

            if (now - json.timestamp > TIMEOUT) {
                console.error(`[Watchdog] HEALTH CHECK FAILED! Last heartbeat was ${(now - json.timestamp) / 1000}s ago. RESTARTING...`);
                killAndRestart();
            } else {
                // console.log('[Watchdog] Health check passed.');
            }
        } else {
            // No lock file yet? Maybe starting up.
            // Check if process has been running for a while without lock file
            // For now, ignore.
        }
    } catch (e) {
        console.error('[Watchdog] Health verification error:', e);
    }
}

function killAndRestart() {
    if (botProcess) {
        console.log('[Watchdog] Killing process tree...');

        // Task 33: Zombie Process Killer (Windows specific robust kill)
        if (process.platform === 'win32') {
            try {
                // /F = Force, /T = Tree (kills children), /PID = Process ID
                spawn('taskkill', ['/F', '/T', '/PID', botProcess.pid]);

                // Cleanup "mindcraft.py" if it is running as a zombie
                // Only do this if we suspect it's hanging. 
                // Using a separate spawn to try to kill common zombie python script name.
                spawn('taskkill', ['/F', '/IM', 'mindcraft.py']);
            } catch (e) {
                console.error('[Watchdog] Taskkill failed:', e);
                botProcess.kill(); // Fallback
            }
        } else {
            botProcess.kill('SIGKILL'); // Linux/Mac
        }
    }
}

// Start
startBot();

// Monitor loop
setInterval(checkHealth, 5000);

// Handle own exit
process.on('SIGINT', () => {
    console.log('[Watchdog] Stopping...');
    if (botProcess) botProcess.kill();
    process.exit();
});
