// extremely lightweight obj that can be imported/modified by any file
let settings = {
    models: {
        high_iq: { provider: 'openai', model: 'gpt-4o' },
        fast: { provider: 'google', model: 'gemini-flash' }
    }
};
export default settings;
export function setSettings(new_settings) {
    Object.keys(settings).forEach(key => delete settings[key]);
    Object.assign(settings, new_settings);
}
