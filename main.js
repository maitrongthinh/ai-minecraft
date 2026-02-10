import './src/utils/keys.js';
import * as Mindcraft from './src/mindcraft/mindcraft.js';
import settings from './settings.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

function parseArguments() {
    return yargs(hideBin(process.argv))
        .option('profiles', {
            type: 'array',
            describe: 'List of agent profile paths',
        })
        .option('task_path', {
            type: 'string',
            describe: 'Path to task file to execute'
        })
        .option('task_id', {
            type: 'string',
            describe: 'Task ID to execute'
        })
        .help()
        .alias('help', 'h')
        .parse();
}
const args = parseArguments();
if (args.profiles) {
    settings.profiles = args.profiles;
}
if (args.task_path) {
    let tasks = JSON.parse(readFileSync(args.task_path, 'utf8'));
    if (args.task_id) {
        settings.task = tasks[args.task_id];
        settings.task.task_id = args.task_id;
    }
    else {
        throw new Error('task_id is required when task_path is provided');
    }
}

// these environment variables override certain settings
if (process.env.MINECRAFT_PORT) {
    settings.port = process.env.MINECRAFT_PORT;
}
if (process.env.MINDSERVER_PORT) {
    settings.mindserver_port = process.env.MINDSERVER_PORT;
}
if (process.env.PROFILES && JSON.parse(process.env.PROFILES).length > 0) {
    settings.profiles = JSON.parse(process.env.PROFILES);
}
if (process.env.INSECURE_CODING) {
    settings.allow_insecure_coding = true;
}
if (process.env.BLOCKED_ACTIONS) {
    settings.blocked_actions = JSON.parse(process.env.BLOCKED_ACTIONS);
}
if (process.env.MAX_MESSAGES) {
    settings.max_messages = process.env.MAX_MESSAGES;
}
if (process.env.NUM_EXAMPLES) {
    settings.num_examples = process.env.NUM_EXAMPLES;
}
if (process.env.LOG_ALL) {
    settings.log_all_prompts = process.env.LOG_ALL;
}

// Phase 10: Port Doctor - Auto-cleanup orphaned processes on Windows
if (process.platform === 'win32') {
    const port = settings.mindserver_port || 8092;
    try {
        const netstatOutput = execSync(`netstat -ano | findstr :${port}`).toString();
        const lines = netstatOutput.trim().split('\n');
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            // Only kill if Listening and not self
            if (line.includes('LISTENING') && pid && pid !== '0' && pid !== process.pid.toString()) {
                console.log(`[PortDoctor] 🩺 Found orphaned process ${pid} on port ${port}. Terminating...`);
                try {
                    execSync(`taskkill /F /PID ${pid} /T`);
                } catch (killErr) {
                    // Ignore already dead processes
                }
            }
        }
    } catch (e) {
        // netstat returns exit code 1 if no matches found
    }
}

Mindcraft.init(true, settings.mindserver_port, settings.auto_open_ui);

for (let profile of settings.profiles) {
    const profile_json = JSON.parse(readFileSync(profile, 'utf8'));
    settings.profile = profile_json;
    settings.profile_path = profile;
    Mindcraft.createAgent(settings);
}