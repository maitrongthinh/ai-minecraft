import settings from '../settings.js';

function assertTrue(name, condition) {
    if (!condition) {
        throw new Error(`Settings assertion failed: ${name}`);
    }
}

assertTrue('root host is localhost', settings.host === 'localhost');
assertTrue('root port is 5000', settings.port === 5000);
assertTrue('mission ladder is vanilla', settings.mission?.ladder_type === 'vanilla');
assertTrue('mission server host is localhost', settings.mission?.server?.host === 'localhost');
assertTrue('mission server port is 5000', settings.mission?.server?.port === 5000);
assertTrue('mission execution mode is roadmap validation only', settings.mission?.execution_mode === 'roadmap_validation_only');
assertTrue('defense target policy is all hostile mobs nearby', settings.defense?.target_policy === 'all_hostile_mobs_nearby');
assertTrue('learning apply mode is hard override', settings.learning?.apply_mode === 'hard_immediate_override');
assertTrue('learning override scope is global', settings.learning?.override_scope === 'global');

console.log('Settings OK', {
    host: settings.host,
    port: settings.port,
    missionServer: settings.mission?.server
});
