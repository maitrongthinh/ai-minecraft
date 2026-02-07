import { readFileSync, existsSync } from 'fs';

// Simple .env parser to avoid checking in keys.json
try {
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
} catch (err) {
    console.warn('[System] Failed to load .env file:', err.message);
}

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
    // If asking for keyboard state
    return activeKeys.has(name);
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
    return activeKeys.has(name);
}
