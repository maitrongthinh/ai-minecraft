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

export function getKey(name) {
    let key = process.env[name];
    if (!key) {
        throw new Error(`API key "${name}" not found in environment variables!`);
    }
    return key;
}

export function hasKey(name) {
    return !!process.env[name];
}
