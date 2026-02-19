import Groq from 'groq-sdk'
import { getKey } from '../utils/keys.js';

// THIS API IS NOT TO BE CONFUSED WITH GROK!
// Go to grok.js for that. :)

// Umbrella class for everything under the sun... That GroqCloud provides, that is.
export class GroqCloudAPI {
    static prefix = 'groq';

    constructor(model_name, url, params) {

        // Strip 'groq/' prefix if present
        this.model_name = model_name?.replace(/^groq\//, '') || 'llama-3.3-70b-versatile';
        this.url = url;
        this.params = params || {};

        // Remove any mention of "tools" from params:
        if (this.params.tools) delete this.params.tools;
        if (this.params.api) delete this.params.api;
        if (this.params.model) delete this.params.model;
        if (this.params.url) delete this.params.url;
        if (this.params.params) delete this.params.params;
        // This is just a bit of future-proofing in case we drag Mindcraft in that direction.

        // I'm going to do a sneaky ReplicateAPI theft for a lot of this, aren't I?
        if (this.url)
            console.warn("Groq Cloud has no implementation for custom URLs. Ignoring provided URL.");

        const resolvedKey =
            this.params?.apiKey ||
            (this.params?.apiKeyEnv ? getKey(this.params.apiKeyEnv) : undefined) ||
            getKey('GROQCLOUD_API_KEY') ||
            getKey('GROQ_API_KEY');

        this.missingApiKey = !resolvedKey;
        if (!resolvedKey) {
            console.warn('[GroqCloudAPI] Missing Groq API key. Set GROQCLOUD_API_KEY or GROQ_API_KEY.');
        }

        this.groq = new Groq({ apiKey: resolvedKey || 'gsk-dummy-if-no-key' });


    }

    async sendRequest(turns, systemMessage, stop_seq = null) {
        if (this.missingApiKey) {
            return 'My brain disconnected, try again.';
        }

        // Create working copy and sanitize
        let messages = [...turns].filter(m => ['system', 'user', 'assistant'].includes(m.role));

        if (systemMessage && (!messages.length || messages[0].role !== 'system')) {
            messages.unshift({ "role": "system", "content": systemMessage });
        }

        let res = null;

        try {
            console.log("Awaiting Groq response...");

            // Handle deprecated max_tokens parameter
            if (this.params.max_tokens) {
                console.warn("GROQCLOUD WARNING: A profile is using `max_tokens`. This is deprecated. Please move to `max_completion_tokens`.");
                this.params.max_completion_tokens = this.params.max_tokens;
                delete this.params.max_tokens;
            }

            if (!this.params.max_completion_tokens) {
                this.params.max_completion_tokens = 4000;
            }

            const valid_params = [
                'temperature',
                'max_completion_tokens',
                'top_p',
                'frequency_penalty',
                'presence_penalty',
                'response_format',
                'seed'
            ];

            let api_params = {};
            for (const key of valid_params) {
                if (this.params[key] !== undefined) {
                    api_params[key] = this.params[key];
                }
            }

            let completion = await this.groq.chat.completions.create({
                "messages": messages,
                "model": this.model_name || "llama-3.3-70b-versatile",
                "stream": false,
                "stop": stop_seq,
                ...api_params
            });

            res = completion.choices[0].message.content;

            res = res.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        }
        catch (err) {
            if (err.message.includes("content must be a string")) {
                res = "Vision is only supported by certain models.";
            } else {
                res = "My brain disconnected, try again.";
            }
            console.log(err);
        }
        return res;
    }

    async sendVisionRequest(messages, systemMessage, imageBuffer) {
        const imageMessages = messages.filter(message => message.role !== 'system');
        imageMessages.push({
            role: "user",
            content: [
                { type: "text", text: systemMessage },
                {
                    type: "image_url",
                    image_url: {
                        url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
                    }
                }
            ]
        });

        return this.sendRequest(imageMessages);
    }

    async embed(_) {
        throw new Error('Embeddings are not supported by Groq.');
    }
}
