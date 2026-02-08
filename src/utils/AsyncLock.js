/**
 * AsyncLock & AsyncMutex
 * 
 * Provides synchronization primitives for managing concurrent access to shared resources
 * (Files, Bot Control, etc.) in an async environment.
 */

export class AsyncLock {
    constructor() {
        this.promise = Promise.resolve();
    }

    /**
     * Acquisitions are queued and executed sequentially.
     * @param {Function} callback - Async function to execute under lock
     * @returns {Promise<any>} Result of the callback
     */
    async acquire(callback) {
        let release;
        const nextPromise = new Promise(resolve => {
            release = resolve;
        });

        // Chain the new promise to the existing one
        const previousPromise = this.promise;
        this.promise = this.promise.then(() => nextPromise);

        // Wait for the previous operation to finish
        try {
            await previousPromise;
        } catch (e) {
            // Even if previous failed, we proceed (lock released)
        }

        try {
            return await callback();
        } finally {
            release();
        }
    }
}

/**
 * Mutex with timeout and ownership tracking
 * Useful for "Control Fighting" resolution (e.g. Combat > System2)
 */
export class AsyncMutex {
    constructor() {
        this._queue = [];
        this._locked = false;
        this._owner = null;
    }

    isLocked() {
        return this._locked;
    }

    getOwner() {
        return this._owner;
    }

    /**
     * Attempt to acquire lock.
     * @param {string} owner - Name of the requester (e.g. 'combat', 'system2')
     * @param {number} timeout - Max wait time in ms
     * @returns {Promise<boolean>} True if acquired, False if timeout
     */
    async acquire(owner, timeout = 5000) {
        if (this._owner === owner) return true; // Reentrancy: Already owned

        if (!this._locked) {
            this._locked = true;
            this._owner = owner;
            return true;
        }

        // If already locked, wait in queue
        return new Promise((resolve) => {
            let timer = null;

            const tryAcquire = () => {
                if (timer) clearTimeout(timer);
                this._locked = true;
                this._owner = owner;
                resolve(true);
            };

            const failAcquire = () => {
                // Remove from queue
                this._queue = this._queue.filter(cb => cb !== tryAcquire);
                resolve(false);
            };

            if (timeout > 0) {
                timer = setTimeout(failAcquire, timeout);
            }

            this._queue.push(tryAcquire);
        });
    }

    release(owner) {
        if (this._owner !== owner && this._locked) {
            console.warn(`[AsyncMutex] Illegal release attempt: ${owner} tried to release lock held by ${this._owner}`);
            return false; // Only owner can release
        }

        this._locked = false;
        this._owner = null;

        if (this._queue.length > 0) {
            const next = this._queue.shift();
            if (next) next(); // Execution of next transfers lock implicitly in callback
        }
        return true;
    }

    /**
     * Force release (Safety hatch for broken states)
     */
    forceRelease() {
        this._locked = false;
        this._owner = null;
        if (this._queue.length > 0) {
            const next = this._queue.shift();
            if (next) next();
        }
    }
}
