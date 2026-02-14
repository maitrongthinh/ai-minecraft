import { StrategyLoader } from './StrategyLoader.js';

/**
 * NetherStrategy: Orchestrates the Nether expedition.
 * 
 * Unlike simple JSON strategies, this class contains specific logic for:
 * - Portal construction validation
 * - Dimension transition handling
 * - Fortress search algorithms (using mineflayer-pathfinder)
 * - Blaze combat lifecycle
 */
export class NetherStrategy extends StrategyLoader {
    constructor(agent) {
        // We still load the 'nether_expedition' JSON for the text-based plan,
        // but we override execution methods to inject specific logic.
        super(agent, 'nether_expedition');
    }

    async executeStep(step) {
        // Intercept specific high-level steps to inject custom logic
        if (step.type === 'skill' && step.name === 'build_nether_portal') {
            return await this.buildPortal();
        }
        if (step.type === 'skill' && step.name === 'enter_nether') {
            return await this.enterNether();
        }
        if (step.type === 'skill' && step.name === 'locate_structure' && step.params?.structure === 'fortress') {
            return await this.findFortress();
        }

        // Fallback to standard execution
        return super.executeStep(step);
    }

    async buildPortal() {
        console.log('[NetherStrategy] Initiating Portal Construction sequence...');
        // 1. Check for Obsidian (10+) or lava bucket method
        // 2. Clear area
        // 3. Place blocks (using ActionAPI place_structure or manual)
        // 4. Light portal (Flint & Steel)

        // Setup checks
        const obsidianCount = this.agent.bot.inventory.count(this.agent.mcData.itemsByName.obsidian.id);
        if (obsidianCount < 10) {
            console.log('[NetherStrategy] Not enough obsidian. Attempting Lava Casting...');
            return await this._buildPortalWithLava();
        }

        // Use the ActionAPI to build simple frame
        // This assumes 'build_portal_frame' is a known schematic or logic
        // For now, we'll try a simple placement logic if schematic missing
        const result = await this.agent.actionAPI.placeStructure('nether_portal_frame');
        if (!result.success) return result;

        // Light it
        return await this.agent.actionAPI.interactBlock({ name: 'obsidian', action: 'use_item', item: 'flint_and_steel' });
    }

    async enterNether() {
        console.log('[NetherStrategy] Entering Nether...');
        if (this.agent.bot.game.dimension === 'the_nether') return { success: true };

        const portalBlock = this.agent.bot.findBlock({ matching: this.agent.mcData.blocksByName.nether_portal.id, maxDistance: 32 });
        if (!portalBlock) {
            return { success: false, error: 'no_portal_found' };
        }

        await this.agent.bot.lookAt(portalBlock.position);
        this.agent.bot.setControlState('forward', true);

        // Wait for dimension change
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.agent.bot.setControlState('forward', false);
                resolve({ success: false, error: 'timeout_entering_nether' });
            }, 10000);

            this.agent.bot.once('spawn', () => {
                clearTimeout(timeout);
                this.agent.bot.setControlState('forward', false);
                if (this.agent.bot.game.dimension === 'the_nether') {
                    resolve({ success: true });
                } else {
                    resolve({ success: false, error: 'spawned_but_wrong_dimension' });
                }
            });
        });
    }

    async findFortress() {
        console.log('[NetherStrategy] Searching for Nether Fortress...');
        // Use extended search radius
        const fortress = this.agent.bot.findBlock({
            matching: (block) => block.name === 'nether_bricks',
            maxDistance: 128
        });

        if (fortress) {
            this.agent.brain.memory.fortress_location = fortress.position;
            console.log(`[NetherStrategy] Fortress found at ${fortress.position}`);
            return { success: true, position: fortress.position };
        }

        // TODO: Implement spiral search or exploration pattern
        return { success: false, error: 'fortress_not_in_scannable_range' };
    }
    async _buildPortalWithLava() {
        // Lava Casting Logic (Dream-style)
        const bot = this.agent.bot;
        const api = this.agent.actionAPI; // Correct access

        console.log('[NetherStrategy] 🌋 Checking resources for Lava Casting...');

        // Check resources (Need 10 Lava, 1 Water OR source access)
        // Simplified: Requiring buckets for now.
        const lavaCount = bot.inventory.items().filter(i => i.name === 'lava_bucket').length;
        const waterCount = bot.inventory.items().filter(i => i.name === 'water_bucket').length;

        if (lavaCount < 10 && waterCount < 1) {
            console.log(`[NetherStrategy] Resources missing: Lava ${lavaCount}/10, Water ${waterCount}/1`);
            // Fallback: Use Skill if available
            if (this.agent.skillLibrary && this.agent.skillLibrary.getSkill('build_nether_portal')) {
                return await this.agent.skillLibrary.execute('build_nether_portal');
            }
            return { success: false, error: 'insufficient_resources_for_casting' };
        }

        console.warn('[NetherStrategy] Lava casting logic is complex specific physics. Delegating to SkillLibrary/Script.');

        // Dynamic fallback to a skill if present
        if (this.agent.skillLibrary && this.agent.skillLibrary.getSkill('build_nether_portal')) {
            return await this.agent.skillLibrary.execute('build_nether_portal');
        }

        // Final Fallback: Ask user/chat for help?
        this.agent.speak("I need to build a portal but lack obsidian. Can someone give me 10 obsidian or teach me how to lava cast?");
        return { success: false, error: 'casting_skill_missing' };
    }
}
