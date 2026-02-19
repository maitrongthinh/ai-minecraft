import { readFileSync, existsSync } from 'fs';

// Simple .env and keys.json parser
export const loadEnv = () => {
    try {
        // 1. Load .env (Lower priority)
        if (existsSync('./.env')) {
            const envConfig = readFileSync('./.env', 'utf8');
            envConfig.split('\n').forEach(line => {
                const [key, ...values] = line.split('=');
                if (key && values.length > 0) {
                    const val = values.join('=').trim();
                    if (val && !process.env[key.trim()]) {
                        process.env[key.trim()] = val;
                    }
                }
            });
            console.log('[System] Loaded environment variables from .env');
        }

        // 2. Load keys.json (Higher priority - overrides)
        // 2. Load keys.json (DEPRECATED: Security Risk - Removed)
        // keys.json should NOT be loaded into process.env automatically.
        // Use .env for secrets or a secure vault.
        /*
        if (existsSync('./keys.json')) {
            console.warn('[System] ⚠️ Loading keys.json is deprecated for security reasons. Please use .env');
        }
        */
    } catch (err) {
        console.warn('[System] Error loading configurations:', err.message);
    }
};

// Initial load on import
loadEnv();

const activeKeys = new Set();
// Map standard keys to Minecraft controls if needed, or use as is
// For now, we trust the KeyCode passed from the client matches what we expect

export function getKey(name) {
    if (name.startsWith('env:')) {
        let key = process.env[name.substring(4)];
        if (!key) {
            throw new Error(`API key "${name}" not found in environment variables!`);
        }
        return key;
    }
    // MindOS Phase 4: Fallback to process.env for standard keys
    if (process.env[name]) return process.env[name];

    // Check keyboard state ONLY for known control keys or single characters
    // To prevent returning 'false' for API key names
    const isControlKey = name.length === 1 || ['shift', 'ctrl', 'alt', 'meta', 'enter', 'tab', 'escape'].includes(name.toLowerCase());
    if (isControlKey) {
        return activeKeys.has(name);
    }

    return undefined;
}

export function setKeyState(name, isPressed) {
    if (isPressed) {
        activeKeys.add(name);
    } else {
        activeKeys.delete(name);
    }
}

export function resetAllKeys() {
    activeKeys.clear();
}

export function hasKey(name) {
    if (name.startsWith('env:')) return !!process.env[name.substring(4)];
    if (process.env[name]) return true;
    return activeKeys.has(name);
}
