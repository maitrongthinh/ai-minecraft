import { globalBus, SIGNAL } from './core/SignalBus.js';

export class ActionManager {
    constructor(agent) {
        this.agent = agent;
        this.executing = false;
        this.currentActionLabel = '';
        this.currentActionFn = null;
        this.timedout = false;
        this.resume_func = null;
        this.resume_name = '';
        this.last_action_time = 0;
        this.recent_action_counter = 0;
    }

    isBusy() {
        return this.executing;
    }

    async resumeAction(actionLabel = null, actionFn = null, timeout = 10) {
        return this._executeResume(actionLabel, actionFn, timeout);
    }

    async runAction(actionLabel, actionFn, { timeout, resume = false } = {}) {
        if (resume) {
            return this._executeResume(actionLabel, actionFn, timeout);
        } else {
            return this._executeAction(actionLabel, actionFn, timeout);
        }
    }

    /**
     * Predictive Safety: Wrap a bot action with a per-call timeout
     * @param {string} label - Action name
     * @param {Function} fn - Async bot action
     * @param {number} timeoutMillis - Max time to wait (ms)
     */
    async safeExec(label, fn, timeoutMillis = 10000, signal = null) {
        if (signal?.aborted) throw new Error(`ActionAborted: ${label} aborted before start`);

        let timer;
        let abortHandler;

        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => {
                reject(new Error(`ActionTimeout: ${label} timed out after ${timeoutMillis}ms`));
            }, timeoutMillis);
        });

        const abortPromise = new Promise((_, reject) => {
            if (signal) {
                abortHandler = () => reject(new Error(`ActionAborted: ${label} aborted by signal`));
                signal.addEventListener('abort', abortHandler);
            }
        });

        try {
            const raceCandidates = [fn(), timeoutPromise];
            if (signal) raceCandidates.push(abortPromise);

            const result = await Promise.race(raceCandidates);
            return result;
        } catch (err) {
            throw err;
        } finally {
            clearTimeout(timer);
            if (signal && abortHandler) {
                signal.removeEventListener('abort', abortHandler);
            }
        }
    }

    async stop() {
        // 1. Force Stop Mineflayer Actions (Reflex Layer)
        if (this.agent.bot) {
            try {
                this.agent.bot.pathfinder?.setGoal(null);
                this.agent.bot.pathfinder?.stop();
                this.agent.bot.pvp?.stop();
                this.agent.bot.stopDigging();
                this.agent.bot.clearControlStates();
            } catch (e) {
                // ignore errors during stop
            }
        }

        if (!this.executing) return;

        const timeout = setTimeout(() => {
            void this.agent.shutdown('Code execution refused stop after 10 seconds. Forcing shutdown.');
        }, 10000);
        while (this.executing) {
            this.agent.requestInterrupt();
            // console.log('waiting for code to finish executing...');
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        clearTimeout(timeout);
    }

    cancelResume() {
        this.resume_func = null;
        this.resume_name = null;
    }

    async _executeResume(actionLabel = null, actionFn = null, timeout = 10) {
        const new_resume = actionFn != null;
        if (new_resume) { // start new resume
            this.resume_func = actionFn;
            if (actionLabel == null) {
                throw new Error('actionLabel is required for new resume');
            }
            this.resume_name = actionLabel;
        }
        if (this.resume_func != null && (this.agent.isIdle() || new_resume) && (!this.agent.self_prompter.isActive() || new_resume)) {
            this.currentActionLabel = this.resume_name;
            let res = await this._executeAction(this.resume_name, this.resume_func, timeout);
            this.currentActionLabel = '';
            return res;
        } else {
            return { success: false, message: null, interrupted: false, timedout: false };
        }
    }

    async _executeAction(actionLabel, actionFn, timeout = 10) {
        let TIMEOUT;
        try {
            if (this.last_action_time > 0) {
                let time_diff = Date.now() - this.last_action_time;
                if (time_diff < 20) {
                    this.recent_action_counter++;
                }
                else {
                    this.recent_action_counter = 0;
                }
                if (this.recent_action_counter > 3) {
                    console.warn('Fast action loop detected, cancelling resume.');
                    this.cancelResume(); // likely cause of repetition
                }
                if (this.recent_action_counter > 5) {
                    console.error('Infinite action loop detected, shutting down.');
                    void this.agent.shutdown('Infinite action loop detected, shutting down.');
                    return { success: false, message: 'Infinite action loop detected, shutting down.', interrupted: false, timedout: false };
                }
            }
            this.last_action_time = Date.now();
            console.log('executing code...\n');

            // await current action to finish (executing=false), with 10 seconds timeout
            // also tell agent.bot to stop various actions
            if (this.executing) {
                console.log(`action "${actionLabel}" trying to interrupt current action "${this.currentActionLabel}"`);
            }
            await this.stop();

            // clear bot logs and reset interrupt code
            this.agent.clearBotLogs();

            this.executing = true;
            this.timedout = false;
            this.currentActionLabel = actionLabel;
            this.currentActionFn = actionFn;

            // Emit Start Signal
            globalBus.emitSignal(SIGNAL.ACTION_STARTED, {
                action: actionLabel,
                timestamp: Date.now()
            });

            // timeout in minutes
            if (timeout > 0) {
                TIMEOUT = this._startTimeout(timeout);
            }

            // start the action
            await actionFn();

            // mark action as finished + cleanup
            this.executing = false;
            this.currentActionLabel = '';
            this.currentActionFn = null;
            clearTimeout(TIMEOUT);

            // get bot activity summary
            let output = this.getBotOutputSummary();
            let interrupted = this.agent.bot.interrupt_code;
            let timedout = this.timedout;
            this.agent.clearBotLogs();

            // Emit Completion Signal
            globalBus.emitSignal(SIGNAL.ACTION_COMPLETED, {
                action: actionLabel,
                success: true,
                interrupted,
                timedout,
                output: output.substring(0, 100) // Truncate for event bus
            });

            // if not interrupted and not generating, emit idle event
            if (!interrupted) {
                this.agent.bot.emit('idle');
            }

            // return action status report
            return { success: true, message: output, interrupted, timedout };
        } catch (err) {
            const errText = err instanceof Error ? err.message : String(err);
            const errStack = err instanceof Error ? err.stack : '';
            this.executing = false;
            this.currentActionLabel = '';
            this.currentActionFn = null;
            clearTimeout(TIMEOUT);
            this.cancelResume();
            console.error("Code execution triggered catch:", err);
            // Log the full stack trace
            console.error(err.stack);

            // Emit Failure Signal
            globalBus.emitSignal(SIGNAL.ACTION_FAILED, {
                action: actionLabel,
                error: errText
            });

            await this.stop();
            let message = this.getBotOutputSummary() +
                '!!Code threw exception!!\n' +
                'Error: ' + errText + '\n' +
                'Stack trace:\n' + (errStack || 'N/A') + '\n';

            let interrupted = this.agent.bot.interrupt_code;
            this.agent.clearBotLogs();
            if (!interrupted) {
                this.agent.bot.emit('idle');
            }
            return { success: false, message, interrupted, timedout: false };
        }
    }

    getBotOutputSummary() {
        const { bot } = this.agent;
        if (!bot) return 'No bot instance.';
        if (bot.interrupt_code && !this.timedout) return '';

        // Ensure bot.output is a string or fallback
        let output = bot.output || '';
        const MAX_OUT = 1000; // Increased limit for better context

        if (output.length > MAX_OUT) {
            output = `Action output is very long (${output.length} chars) and has been shortened.\n
          First outputs:\n${output.substring(0, MAX_OUT / 2)}\n...skipping many lines.\nFinal outputs:\n ${output.substring(output.length - MAX_OUT / 2)}`;
        }
        else {
            output = output.length > 0 ? 'Action output:\n' + output : 'Action completed with no output.';
        }
        bot.output = '';
        return output;
    }

    _startTimeout(TIMEOUT_MINS = 10) {
        return setTimeout(async () => {
            console.warn(`Code execution timed out after ${TIMEOUT_MINS} minutes. Attempting force stop.`);
            this.timedout = true;
            this.agent.history.add('system', `Code execution timed out after ${TIMEOUT_MINS} minutes. Attempting force stop.`);
            await this.stop(); // last attempt to stop
        }, TIMEOUT_MINS * 60 * 1000);
    }

}
