import { Vec3 } from 'vec3';
import { Camera } from "./camera.js";
import fs from 'fs';
import { JsonSanitizer } from '../../utils/JsonSanitizer.js'; // Task 26: Data Integrity

export class VisionInterpreter {
    constructor(agent, allow_vision) {
        this.agent = agent;
        this.allow_vision = allow_vision;
        this.fp = './bots/' + agent.name + '/screenshots/';
        if (allow_vision) {
            this.camera = new Camera(agent.bot, this.fp);
        }
    }

    async lookAtPlayer(player_name, direction) {
        if (!this.allow_vision || !this.agent.prompter.vision_model.sendVisionRequest) {
            return "Vision is disabled. Use other methods to describe the environment.";
        }
        let result = "";
        const bot = this.agent.bot;
        const player = bot.players[player_name]?.entity;
        if (!player) {
            return `Could not find player ${player_name}`;
        }

        let filename;
        if (direction === 'with') {
            await bot.look(player.yaw, player.pitch);
            result = `Looking in the same direction as ${player_name}\n`;
            filename = await this.camera.capture();
        } else {
            await bot.lookAt(new Vec3(player.position.x, player.position.y + player.height, player.position.z));
            result = `Looking at player ${player_name}\n`;
            filename = await this.camera.capture();

        }

        return result + `Image analysis: "${await this.analyzeImage(filename)}"`;
    }

    async lookAtPosition(x, y, z) {
        if (!this.allow_vision || !this.agent.prompter.vision_model.sendVisionRequest) {
            return "Vision is disabled. Use other methods to describe the environment.";
        }
        let result = "";
        const bot = this.agent.bot;
        await bot.lookAt(new Vec3(x, y + 2, z));
        result = `Looking at coordinate ${x}, ${y}, ${z}\n`;

        let filename = await this.camera.capture();

        return result + `Image analysis: "${await this.analyzeImage(filename)}"`;
    }

    getCenterBlockInfo() {
        const bot = this.agent.bot;
        const maxDistance = 128; // Maximum distance to check for blocks
        const targetBlock = bot.blockAtCursor(maxDistance);

        if (targetBlock) {
            return `Block at center view: ${targetBlock.name} at (${targetBlock.position.x}, ${targetBlock.position.y}, ${targetBlock.position.z})`;
        } else {
            return "No block in center view";
        }
    }

    async analyzeImage(filename) {
        try {
            const imageBuffer = fs.readFileSync(`${this.fp}/${filename}.jpg`);
            const messages = this.agent.history.getHistory();
            const blockInfo = this.getCenterBlockInfo();

            // Inject instructions for JSON output
            const structuralInstruction = {
                role: 'system',
                content: `IMPORTANT: Analyze the image and return a JSON object with this structure:
{
  "description": "Detailed text description of what you see...",
  "objects": [
    { "type": "entity|block|structure", "name": "chest", "position": { "x": 0, "y": 0, "z": 0 }, "confidence": 0.9 }
  ]
}
For "position", estimate relative coordinates based on valid block info provided: ${blockInfo}. 
If specific coordinates unknown, use relative distance estimation.
Ensure valid JSON. Do not include markdown formatting like \`\`\`json.`
            };

            // Temporary inject system instruction
            const visionMessages = [...messages, structuralInstruction];

            // We need to bypass prompter.promptVision slightly or rely on it to forward messages
            // Assuming promptVision forwards messages to model. 
            // However, prompter.promptVision uses 'this.profile.image_analysis' string.
            // We'll append the instruction to the last message content if possible, or rely on model capability.

            // BETTER APPROACH: Use prompter methods but parse result.
            // Since we can't easily change prompter internals without breaking other things,
            // we will prepend the instruction to the PROMPT string if we could, but agent.prompter.promptVision uses specific profile.

            // Let's rely on the LLM being smart enough if we add a user message with instructions?
            // "Please describe what you see and list objects in JSON format."

            // To be safe, we will override the prompt inside promptVision if we could, 
            // but here we are outside.
            // Let's try adding a fake 'user' message with the instruction.
            messages.push({
                role: 'user',
                content: `Analyze this image. Return a JSON object with fields: "description" (string) and "objects" (array of {name, type}).`
            });

            let rawResult = await this.agent.prompter.promptVision(messages, imageBuffer);

            // Clean up result (remove markdown blocks if any)
            // Task 26: Use JsonSanitizer
            let parsed = JsonSanitizer.parse(rawResult);

            if (parsed) {
                if (parsed.description) description = parsed.description;

                if (parsed.objects && Array.isArray(parsed.objects) && this.agent.spatial) {
                    // Enrich positions based on bot's current pos if needed
                    const botPos = this.agent.bot.entity.position;
                    parsed.objects.forEach(obj => {
                        if (!obj.position) {
                            // Rough estimate if missing
                            obj.position = { x: botPos.x, y: botPos.y, z: botPos.z };
                        }
                    });

                    await this.agent.spatial.update(parsed.objects);
                }
            } else {
                console.warn('[Vision] Failed to parse JSON from vision response. Using raw text.');
                description = rawResult; // Fallback to raw text if parse fails completely
            }

            return description + `\n${blockInfo}`;

        } catch (error) {
            console.warn('Error reading image:', error);
            return `Error reading image: ${error.message}`;
        }
    }
} 