
import { readdirSync, readFileSync } from 'fs';
import path from 'path';

export class BlueprintManager {
    constructor() {
        this.blueprints = {};
        this.blueprintDir = 'src/blueprints';
        this.init();
    }

    init() {
        try {
            const files = readdirSync(this.blueprintDir);
            for (let file of files) {
                if (file.endsWith('.json')) {
                    const name = file.slice(0, -5);
                    const content = JSON.parse(readFileSync(path.join(this.blueprintDir, file), 'utf8'));
                    // Pre-process (fill empty spaces)
                    this.processBlueprint(content);
                    this.blueprints[name] = content;
                    console.log(`[BlueprintManager] Loaded blueprint: ${name}`);
                }
            }
        } catch (e) {
            console.error('[BlueprintManager] Error reading blueprints:', e);
        }
    }

    processBlueprint(blueprint) {
        if (!blueprint.blocks) return;

        let sizez = blueprint.blocks[0].length;
        let sizex = blueprint.blocks[0][0].length;
        let max_size = Math.max(sizex, sizez);

        for (let y = 0; y < blueprint.blocks.length; y++) {
            for (let z = 0; z < max_size; z++) {
                if (z >= blueprint.blocks[y].length)
                    blueprint.blocks[y].push([]);
                for (let x = 0; x < max_size; x++) {
                    if (x >= blueprint.blocks[y][z].length)
                        blueprint.blocks[y][z].push('');
                }
            }
        }
    }

    getBlueprint(name) {
        return this.blueprints[name] || null;
    }

    listBlueprints() {
        return Object.keys(this.blueprints);
    }
}
