import OpenAIApi from 'openai';
import { getKey, hasKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';

export class GPT {
    static prefix = 'openai';
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;
        this.url = url; // store so that we know whether a custom URL has been set

        let config = {};
        if (url)
            config.baseURL = url;

        if (hasKey('OPENAI_ORG_ID'))
            config.organization = getKey('OPENAI_ORG_ID');

        config.apiKey = params?.apiKey || (params?.apiKeyEnv ? getKey(params.apiKeyEnv) : getKey('OPENAI_API_KEY'));

        this.openai = new OpenAIApi(config);
    }

    async sendRequest(turns, systemMessage, stop_seq = '***') {
        let model = this.model_name || "gpt-4o-mini";
        let res = null;

        try {
            console.log('Awaiting openai api response from model', model);

            // 1. FORMAT & DEDUPLICATE (Unified logic for all providers)
            let rawMessages = [{ role: 'system', content: systemMessage }].concat(turns);
            let messages = [];

            for (let turn of rawMessages) {
                let msg = { ...turn }; // Clone to avoid side effects

                // Content safety & stringification
                if (typeof msg.content !== 'string') {
                    if (msg.content && typeof msg.content === 'object' && msg.content.chat) {
                        msg.content = msg.content.chat;
                    } else {
                        msg.content = JSON.stringify(msg.content);
                    }
                }
                msg.content = msg.content.trim();
                if (!msg.content) continue;

                // Role mapping for providers
                if (msg.role !== 'system') {
                    if (msg.role === this.agent?.name || msg.role === 'assistant' || msg.role === 'Andy') {
                        msg.role = 'assistant';
                    } else {
                        msg.role = 'user';
                    }
                }

                // Deduplicate consecutive same roles or identical content
                if (messages.length > 0) {
                    let lastMsg = messages[messages.length - 1];
                    if (lastMsg.role === msg.role) {
                        // Skip if identical content
                        if (lastMsg.content === msg.content || lastMsg.content.includes(msg.content)) continue;
                        // For system, merge if different. For others, append.
                        if (msg.role === 'system') {
                            lastMsg.content += '\n\n' + msg.content;
                        } else {
                            lastMsg.content += '\n' + msg.content;
                        }
                        continue;
                    }
                }
                messages.push(msg);
            }

            // Provider-specific start requirement (Always start with user/system for logic)
            if (messages.length > 0 && messages[0].role !== 'system' && messages[0].role !== 'user') {
                messages.unshift({ role: 'user', content: '_' });
            }

            // 2. STOP SEQUENCE PROTECTION (Only append to the final turn)
            if (messages.length > 0) {
                const last = messages[messages.length - 1];
                if (!last.content.endsWith(stop_seq)) {
                    last.content += stop_seq;
                }
            }

            // 3. CONTEXT PROTECTION (Max 12 messages for provider stability)
            if (messages.length > 12) {
                messages = [messages[0], ...messages.slice(-11)];
            }

            const passthroughKeys = [
                'temperature',
                'top_p',
                'max_tokens',
                'max_completion_tokens',
                'frequency_penalty',
                'presence_penalty',
                'n',
                'stream',
                'response_format',
                'tool_choice',
                'tools',
                'parallel_tool_calls',
                'reasoning_effort',
                'seed',
                'logit_bias'
            ];

            const modelOptions = {};
            for (const key of passthroughKeys) {
                if (this.params?.[key] !== undefined) {
                    modelOptions[key] = this.params[key];
                }
            }

            const pack = {
                model: model,
                messages,
                stop: stop_seq,
                api_key: this.openai.apiKey,
                uses: this.params?.uses ?? 1000,
                ...modelOptions
            };

            delete pack.apiKey;
            if (model.includes('o1') || model.includes('o3') || model.includes('5')) {
                delete pack.stop;
            }

            console.log('[GPT] Sending Request to:', this.url || 'OpenAI');
            console.log('[GPT] Payload Excerpt:', JSON.stringify(pack.messages.slice(-2), null, 2));
            const maxAttempts = this.params?.requestRetries ?? 3;
            const baseDelay = this.params?.retryDelayMs ?? 800;
            let completion = null;

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    completion = await this.openai.chat.completions.create(pack);
                    if (!completion?.choices || completion.choices.length === 0) {
                        throw new Error('OpenAI API returned no choices.');
                    }
                    break;
                } catch (attemptError) {
                    const status = attemptError?.status ?? attemptError?.response?.status;
                    const isTransient = !status || status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
                    if (!isTransient || attempt >= maxAttempts) {
                        throw attemptError;
                    }
                    const waitMs = Math.min(baseDelay * Math.pow(2, attempt - 1), 8000);
                    console.warn(`[GPT] Attempt ${attempt}/${maxAttempts} failed (${status || 'network'}). Retrying in ${waitMs}ms...`);
                    await new Promise(resolve => setTimeout(resolve, waitMs));
                }
            }
            res = completion.choices[0].message.content;

        } catch (err) {
            console.error(`[GPT] API Error (${err.status || 'unknown'}):`, err.message);
            if (err.response) {
                try {
                    const body = typeof err.response.text === 'function' ? await err.response.text() : err.response;
                    console.error('[GPT] Error Response Body:', body.substring(0, 500));
                } catch (e) {
                    // Silence error body reading failures
                }
            }
            // Use a unique marker for disconnection to prevent history pollution in MemorySystem
            res = '[BRAIN_DISCONNECTED]';
        }
        return res;
    }

    async sendVisionRequest(messages, systemMessage, imageBuffer) {
        const imageMessages = [...messages];
        imageMessages.push({
            role: "user",
            content: [
                { type: "input_text", text: systemMessage },
                {
                    type: "input_image",
                    image_url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
                }
            ]
        });

        return this.sendRequest(imageMessages, systemMessage);
    }

    async embed(text) {
        if (text.length > 8191)
            text = text.slice(0, 8191);
        const embedding = await this.openai.embeddings.create({
            model: this.model_name || "text-embedding-3-small",
            input: text,
            encoding_format: "float",
        });
        return embedding.data[0].embedding;
    }

}

const sendAudioRequest = async (text, model, voice, url) => {
    const payload = {
        model: model,
        voice: voice,
        input: text
    }

    let config = {};

    if (url)
        config.baseURL = url;

    if (hasKey('OPENAI_ORG_ID'))
        config.organization = getKey('OPENAI_ORG_ID');

    config.apiKey = getKey('OPENAI_API_KEY');

    const openai = new OpenAIApi(config);

    const mp3 = await openai.audio.speech.create(payload);
    const buffer = Buffer.from(await mp3.arrayBuffer());
    const base64 = buffer.toString("base64");
    return base64;
}

export const TTSConfig = {
    sendAudioRequest: sendAudioRequest,
    baseUrl: 'https://api.openai.com/v1',
}
