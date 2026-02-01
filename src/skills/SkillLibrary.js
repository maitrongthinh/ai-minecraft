
import fs from 'fs';
import path from 'path';

const SKILLS_FILE = path.resolve('src/skills/skills.json');

/**
 * SkillLibrary
 * Manages persisted skills (functions) that the bot has successfully executed.
 */
export class SkillLibrary {
    constructor() {
        this.skills = {};
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(SKILLS_FILE)) {
                this.skills = JSON.parse(fs.readFileSync(SKILLS_FILE, 'utf8'));
                console.log(`[SkillLibrary] Loaded ${Object.keys(this.skills).length} skills.`);
            } else {
                console.log('[SkillLibrary] No skills found. Initializing empty library.');
                this.save();
            }
        } catch (error) {
            console.error('[SkillLibrary] Failed to load skills:', error);
            // Fallback to empty to prevent crash
            this.skills = {};
        }
    }

    save() {
        try {
            // Ensure directory exists
            const dir = path.dirname(SKILLS_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(SKILLS_FILE, JSON.stringify(this.skills, null, 2));
        } catch (error) {
            console.error('[SkillLibrary] Failed to save skills:', error);
        }
    }

    /**
     * Saves a new skill or updates an existing one.
     * @param {string} name - The name of the skill (e.g., 'craft_pickaxe')
     * @param {string} code - The executable code
     * @param {string} description - Description of what it does
     * @param {string[]} tags - Keywords for search
     */
    addSkill(name, code, description, tags = []) {
        this.skills[name] = {
            code,
            description,
            tags,
            success_count: 0, // Track usage
            created_at: Date.now()
        };
        this.save();
        console.log(`[SkillLibrary] Skill '${name}' saved.`);
    }

    getSkill(name) {
        return this.skills[name];
    }

    markSuccess(name) {
        if (this.skills[name]) {
            this.skills[name].success_count = (this.skills[name].success_count || 0) + 1;
            this.save();
        }
    }

    /**
     * Primitive semantic search: checks description and tags for keywords.
     * @param {string} query 
     * @returns {Object|null} The best matching skill or null
     */
    search(query) {
        const queryTerms = query.toLowerCase().split(/\s+/);
        let bestMatch = null;
        let maxScore = 0;

        for (const [name, skill] of Object.entries(this.skills)) {
            let score = 0;
            const textToSearch = (name + ' ' + skill.description + ' ' + skill.tags.join(' ')).toLowerCase();

            for (const term of queryTerms) {
                if (textToSearch.includes(term)) score++;
            }

            // Heuristic string matching score
            if (score > 0 && score > maxScore) {
                maxScore = score;
                bestMatch = { name, ...skill };
            }
        }

        // Threshold: Must match at least 1 significant term or be very confident
        if (bestMatch && maxScore > 0) {
            console.log(`[SkillLibrary] Found match for '${query}': ${bestMatch.name}`);
            return bestMatch;
        }

        return null;
    }
}
