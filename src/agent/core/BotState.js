/**
 * Bot Lifecycle States
 * used to manage the startup and shutdown sequence deterministically.
 */
export const BOT_STATE = {
    BOOTING: 'booting',   // Initial power-on, connecting to MC
    LOADING: 'loading',   // Connected, loading heavy AI subsystems
    READY: 'ready',       // Fully operational, accepting commands
    ERROR: 'error',       // Critical failure state
    SHUTDOWN: 'shutdown'  // Graceful shutdown
};
