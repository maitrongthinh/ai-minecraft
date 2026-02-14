const STOPPED = 0
const ACTIVE = 1
const PAUSED = 2
export class SelfPrompter {
    constructor(agent) {
        this.agent = agent;
        this.state = STOPPED;
        this.loop_active = false;
        this.interrupt = false;
        this.prompt = '';
        this.idle_time = 0;
        this.cooldown = 3500;
        this.last_response = '';
        this.stuck_count = 0;
        this.provider_failure_count = 0;
    }

    start(prompt) {
        console.log('Self-prompting started.');
        if (!prompt) {
            if (!this.prompt)
                return 'No prompt specified. Ignoring request.';
            prompt = this.prompt;
        }
        this.state = ACTIVE;
        this.prompt = prompt;
        this.provider_failure_count = 0;
        this.startLoop();
    }

    isActive() {
        return this.state === ACTIVE;
    }

    isStopped() {
        return this.state === STOPPED;
    }

    isPaused() {
        return this.state === PAUSED;
    }

    async handleLoad(prompt, state) {
        if (state == undefined)
            state = STOPPED;
        this.state = state;
        this.prompt = prompt;
        if (state !== STOPPED && !prompt)
            throw new Error('No prompt loaded when self-prompting is active');
        if (state === ACTIVE) {
            await this.start(prompt);
        }
    }

    setPromptPaused(prompt) {
        this.prompt = prompt;
        this.state = PAUSED;
    }

    async startLoop() {
        if (this.loop_active) {
            console.warn('Self-prompt loop is already active. Ignoring request.');
            return;
        }
        console.log('starting self-prompt loop')
        this.loop_active = true;
        let no_response_count = 0;
        const MAX_NO_RESPONSE = 3;
        while (!this.interrupt && this.agent.running) {
            let msg = `You are self-prompting with the goal: '${this.prompt}'.
Return VALID JSON only with keys: thought, chat, task.
task must be actionable code whenever possible; do not leave task null unless absolutely blocked.
Do not ask clarifying questions during self-prompting. Execute the next concrete survival step now.`;
            if (this.stuck_count >= 2) {
                msg += '\nYou are repeating yourself. Switch strategy and execute a different concrete action immediately.';
            }

            let response = await this.agent.handleMessage('system', msg, -1);
            if (!response) {
                no_response_count++;
                if (no_response_count >= MAX_NO_RESPONSE) {
                    let out = `Agent produced no useful response in the last ${MAX_NO_RESPONSE} auto-prompts. Stopping auto-prompting.`;
                    this.agent.openChat(out);
                    console.warn(out);
                    this.state = STOPPED;
                    break;
                }
            }
            else {
                no_response_count = 0;

                const isProviderFailure = typeof response === 'string' && (
                    response.includes('[BRAIN_DISCONNECTED]') ||
                    response.includes('Provider API disconnected') ||
                    response.includes('error while thinking')
                );
                const brainDegraded = this.agent.brain &&
                    typeof this.agent.brain.isProviderDegraded === 'function' &&
                    this.agent.brain.isProviderDegraded();

                if (isProviderFailure || brainDegraded) {
                    this.provider_failure_count++;
                } else {
                    this.provider_failure_count = 0;
                }

                // Stop quickly when provider is degraded to avoid hot-looping API errors.
                if (this.provider_failure_count >= 2) {
                    console.warn('[SelfPrompter] Provider appears degraded. Pausing self-prompting.');
                    this.state = PAUSED;
                    break;
                }

                // STUCK DETECTION: If responding same thing multiple times in a row -> Stop
                // response is now a string or processResult.result
                if (response === this.last_response) {
                    this.stuck_count++;
                } else {
                    this.stuck_count = 0;
                }
                this.last_response = response;

                if (this.stuck_count >= 3) {
                    console.warn('[SelfPrompter] Loop pattern detected. Forcing strategy switch.');
                    this.stuck_count = 0;
                    this.last_response = '';
                    await this.agent.handleMessage(
                        'system',
                        "UNSTUCK MODE: Do not ask clarification. Execute one concrete survival action immediately using available skills.",
                        -1
                    );
                    await new Promise(r => setTimeout(r, this.cooldown));
                    continue;
                }

                const dynamicCooldown = this.cooldown + (this.provider_failure_count * 1500);
                await new Promise(r => setTimeout(r, dynamicCooldown));
            }
        }
        console.log('self prompt loop stopped')
        this.loop_active = false;
        this.interrupt = false;
        this.provider_failure_count = 0;
    }

    update(delta) {
        // automatically restarts loop
        if (this.state === ACTIVE && !this.loop_active && !this.interrupt) {
            if (this.agent.isIdle())
                this.idle_time += delta;
            else
                this.idle_time = 0;

            if (this.idle_time >= this.cooldown) {
                console.log('Restarting self-prompting...');
                this.startLoop();
                this.idle_time = 0;
            }
        }
        else {
            this.idle_time = 0;
        }
    }

    async stopLoop() {
        // you can call this without await if you don't need to wait for it to finish
        if (this.interrupt)
            return;
        console.log('stopping self-prompt loop')
        this.interrupt = true;
        while (this.loop_active) {
            await new Promise(r => setTimeout(r, 500));
        }
        this.interrupt = false;
    }

    async stop(stop_action = true) {
        this.interrupt = true;
        if (stop_action) {
            if (this.agent.actions && typeof this.agent.actions.stop === 'function') {
                await this.agent.actions.stop();
            }
        }
        await this.stopLoop();
        this.state = STOPPED;
        console.log('[SelfPrompter] Stopped.');
    }

    async pause() {
        this.interrupt = true;
        await this.agent.actions.stop();
        this.stopLoop();
        this.state = PAUSED;
    }

    shouldInterrupt(is_self_prompt) { // to be called from handleMessage
        return is_self_prompt && (this.state === ACTIVE || this.state === PAUSED) && this.interrupt;
    }

    handleUserPromptedCmd(is_self_prompt, is_action) {
        // if a user messages and the bot responds with an action, stop the self-prompt loop
        if (!is_self_prompt && is_action) {
            this.stopLoop();
            // this stops it from responding from the handlemessage loop and the self-prompt loop at the same time
        }
    }
}
