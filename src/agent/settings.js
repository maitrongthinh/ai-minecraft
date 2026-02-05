// extremely lightweight obj that can be imported/modified by any file
let settings = {
    models: {
        high_iq: { provider: 'openai', model: 'gpt-4o' },
        fast: { provider: 'google', model: 'gemini-flash' }
        high_iq: { provider: 'openai', model: 'gpt-4o' },
        fast: { provider: 'google', model: 'gemini-flash' }
    },
    max_messages: 20, // Task 28: History Summarization Threshold
    spawn_timeout: 45, // default
    allow_vision: true,
    allow_insecure_coding: true,
    max_commands: 3

};
export default settings;
export function setSettings(new_settings) {
    Object.keys(settings).forEach(key => delete settings[key]);
    Object.assign(settings, new_settings);
}
