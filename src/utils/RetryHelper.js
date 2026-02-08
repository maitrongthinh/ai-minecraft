/**
 * RetryHelper.js
 * 
 * Utility for executing async operations with exponential backoff.
 * 
 * Usage:
 * await RetryHelper.retry(async () => { ... }, { maxRetries: 3, baseDelay: 1000 });
 */

export class RetryHelper {
    /**
     * Retries an async operation with exponential backoff.
     * @param {Function} operation - The async function to execute.
     * @param {Object} options - Configuration options.
     * @param {number} options.maxRetries - Maximum number of retries (default: 3).
     * @param {number} options.baseDelay - Initial delay in ms (default: 1000).
     * @param {number} options.maxDelay - Maximum delay in ms (default: 10000).
     * @param {string} options.context - Context name for logging (default: 'Operation').
     * @returns {Promise<any>} - The result of the operation.
     */
    static async retry(operation, options = {}) {
        const maxRetries = options.maxRetries || 3;
        const baseDelay = options.baseDelay || 1000;
        const maxDelay = options.maxDelay || 30000;
        const context = options.context || 'Operation';

        let lastError;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (err) {
                lastError = err;
                if (attempt < maxRetries) {
                    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
                    console.warn(`[RetryHelper] ${context} failed (Attempt ${attempt + 1}/${maxRetries}). Retrying in ${delay}ms... Error: ${err.message}`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        console.error(`[RetryHelper] ${context} failed after ${maxRetries} retries.`);
        throw lastError;
    }
}
