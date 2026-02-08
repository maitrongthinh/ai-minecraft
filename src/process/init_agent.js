import { Agent } from '../agent/agent.js';
import { serverProxy } from '../agent/mindserver_proxy.js';
import yargs from 'yargs';
import settings from '../../settings.js';
import { readFileSync } from 'fs';

const args = process.argv.slice(2);
if (args.length < 1) {
    console.log('Usage: node init_agent.js -n <agent_name> -p <port> -l <load_memory> -m <init_message> -c <count_id>');
    process.exit(1);
}

const argv = yargs(args)
    .option('name', {
        alias: 'n',
        type: 'string',
        description: 'name of agent'
    })
    .option('load_memory', {
        alias: 'l',
        type: 'boolean',
        description: 'load agent memory from file on startup'
    })
    .option('init_message', {
        alias: 'm',
        type: 'string',
        description: 'automatically prompt the agent on startup'
    })
    .option('count_id', {
        alias: 'c',
        type: 'number',
        default: 0,
        description: 'identifying count for multi-agent scenarios',
    })
    .option('port', {
        alias: 'p',
        type: 'number',
        description: 'port of mindserver'
    })
    .option('profile', {
        alias: 'P',
        type: 'string',
        description: 'path to profile json file'
    })
    .argv;

(async () => {
    try {
        if (argv.profile) {
            console.log(`[Init] Loading profile from: ${argv.profile}`);
            try {
                const profileContent = readFileSync(argv.profile, 'utf8');
                settings.profile = JSON.parse(profileContent);
                console.log(`[Init] Profile loaded. Name: ${settings.profile.name}`);

                // Resolve model alias from settings
                if (settings.profile.model === 'high_iq' && settings.models && settings.models.high_iq) {
                    console.log('[Init] Resolving "high_iq" model alias from settings.');
                    settings.profile.model = settings.models.high_iq;
                }
            } catch (err) {
                console.error(`[Init] Failed to load profile: ${err.message}`);
            }
        } else {
            console.warn('[Init] No profile path provided via --profile / -P');
        }

        console.log('Connecting to MindServer');
        await serverProxy.connect(argv.name, argv.port);
        console.log('Starting agent');
        const agent = new Agent();
        serverProxy.setAgent(agent);

        // Lifecycle: Graceful Shutdown
        const cleanup = async () => {
            console.log('\n[Process] 🛑 Received termination signal. Cleaning up...');
            await agent.clean();
            process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);

        // Safety: Force exit if cleanup hangs
        process.on('uncaughtException', async (err) => {
            console.error('[Process] 💀 Uncaught Exception:', err);
            await agent.clean();
            process.exit(1);
        });

        await agent.start(argv.load_memory, argv.init_message, argv.count_id);
    } catch (error) {
        console.error('Failed to start agent process:');
        console.error(error.message);
        console.error(error.stack);
        process.exit(1);
    }
})();
