/**
 * SkillLibrary - File-Based Edition (Task 9 & 11)
 * 
 * Manages persisted skills as individual .js files in src/skills/library/
 * Each skill file contains executable code + JSDoc metadata
 * Task 11: Auto-triggers optimization after 10 successful uses
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LIBRARY_DIR = path.resolve(__dirname, 'library');

export class SkillLibrary {
    constructor(skillOptimizer = null) {
        this.skills = {}; // Cached in-memory for fast access
        this.skillOptimizer = skillOptimizer; // Task 11: Optimizer reference
        this.optimizingSkills = new Set(); // Task 11: Lock flags to prevent concurrent optimization
        this.ensureLibraryDir();
        // Note: loadSkills() is async - must call init() after construction
    }

    /**
     * Initialize skill library (async)
     * MUST be called after constructor
     * @returns {Promise<SkillLibrary>} this instance for chaining
     */
    async init() {
        await this.loadSkills();
        return this;
    }

    /**
     * Task 11: Set optimizer reference (for circular dependency resolution)
     * @param {SkillOptimizer} optimizer
     */
    setOptimizer(optimizer) {
        this.skillOptimizer = optimizer;
        console.log('[SkillLibrary] ✓ SkillOptimizer linked');
    }

    /**
     * Ensure library directory exists
     */
    ensureLibraryDir() {
        if (!fs.existsSync(LIBRARY_DIR)) {
            fs.mkdirSync(LIBRARY_DIR, { recursive: true });
            console.log(`[SkillLibrary] Created library directory: ${LIBRARY_DIR}`);
        }
    }

    /**
     * Load all skills from library/ directory
     * Task 9: Dynamic import of .js files
     */
    async loadSkills() {
        try {
            const files = fs.readdirSync(LIBRARY_DIR).filter(f => f.endsWith('.js'));

            for (const file of files) {
                const skillName = path.basename(file, '.js');
                const skillPath = path.join(LIBRARY_DIR, file);

                try {
                    // Read file content for metadata extraction
                    const content = fs.readFileSync(skillPath, 'utf8');
                    const metadata = this.extractMetadata(content);

                    this.skills[skillName] = {
                        ...metadata,
                        filePath: skillPath,
                        code: content // Store full code for execution
                    };
                } catch (err) {
                    console.warn(`[SkillLibrary] Failed to load skill '${skillName}':`, err.message);
                }
            }

            console.log(`[SkillLibrary] Loaded ${Object.keys(this.skills).length} skills from library/`);
        } catch (error) {
            console.error('[SkillLibrary] Failed to load skills:', error);
            this.skills = {};
        }
    }

    /**
     * Extract metadata from JSDoc comments
     * @param {string} content - Skill file content
     * @returns {Object} Metadata
     */
    extractMetadata(content) {
        const metadata = {
            description: '',
            tags: [],
            success_count: 0,
            created_at: Date.now(),
            last_optimized: null,
            version: 1
        };

        // Extract @description
        const descMatch = content.match(/@description\s+(.+)/);
        if (descMatch) metadata.description = descMatch[1].trim();

        // Extract @tags
        const tagsMatch = content.match(/@tags\s+(.+)/);
        if (tagsMatch) {
            metadata.tags = tagsMatch[1].split(',').map(t => t.trim());
        }

        // Extract @metadata (JSON block)
        const metaMatch = content.match(/@metadata\s+({[\s\S]*?})/);
        if (metaMatch) {
            try {
                const metaData = JSON.parse(metaMatch[1]);
                Object.assign(metadata, metaData);
            } catch (err) {
                console.warn('[SkillLibrary] Failed to parse metadata JSON:', err.message);
            }
        }

        return metadata;
    }

    /**
     * Add a new skill or update existing
     * Task 9: Generate .js file with JSDoc annotations
     * 
     * @param {string} name - Skill name (e.g., 'craft_pickaxe')
     * @param {string} code - Executable JavaScript code
     * @param {string} description - What the skill does
     * @param {string[]} tags - Keywords for search
     */
    addSkill(name, code, description, tags = []) {
        const skillPath = path.join(LIBRARY_DIR, `${name}.js`);
        const existingSkill = this.skills[name];

        // Preserve metadata if updating
        const metadata = existingSkill ? {
            success_count: existingSkill.success_count || 0,
            created_at: existingSkill.created_at || Date.now(),
            last_optimized: existingSkill.last_optimized || null,
            version: (existingSkill.version || 0) + 1
        } : {
            success_count: 0,
            created_at: Date.now(),
            last_optimized: null,
            version: 1
        };

        // Generate JSDoc-annotated file
        const fileContent = this.generateSkillFile(name, code, description, tags, metadata);

        try {
            fs.writeFileSync(skillPath, fileContent, 'utf8');

            // Update in-memory cache
            this.skills[name] = {
                description,
                tags,
                ...metadata,
                filePath: skillPath,
                code: fileContent
            };

            console.log(`[SkillLibrary] Skill '${name}' saved to ${skillPath} (v${metadata.version})`);
        } catch (error) {
            console.error(`[SkillLibrary] Failed to save skill '${name}':`, error);
        }
    }

    /**
     * Generate skill file with JSDoc format
     */
    generateSkillFile(name, code, description, tags, metadata) {
        return `/**
 * Skill: ${name}
 * 
 * @description ${description}
 * @tags ${tags.join(', ')}
 * @metadata ${JSON.stringify(metadata, null, 2)}
 */

${code}
`;
    }

    /**
     * Get skill by name
     * @param {string} name
     * @returns {Object|null} Skill object with code and metadata
     */
    getSkill(name) {
        return this.skills[name] || null;
    }

    /**
     * Mark skill as successfully executed
     * Task 11: Auto-triggers optimization after N uses
     * 
     * @param {string} name - Skill name
     */
    async markSuccess(name) {
        const skill = this.skills[name];
        if (!skill) return;

        skill.success_count = (skill.success_count || 0) + 1;

        // Update metadata in file
        const updatedContent = this.updateMetadataInFile(skill.code, {
            success_count: skill.success_count,
            last_used: Date.now()
        });

        try {
            fs.writeFileSync(skill.filePath, updatedContent, 'utf8');
            this.skills[name].code = updatedContent;
            console.log(`[SkillLibrary] Skill '${name}' success count: ${skill.success_count}`);

            // Task 11: Auto-trigger optimization after 10 successful uses
            if (skill.success_count >= 10 && this.skillOptimizer) {
                // Task 36: Ensure non-blocking execution using setImmediate
                setImmediate(() => {
                    this.autoOptimizeSkill(name).catch(err => {
                        console.error(`[SkillLibrary] Auto-optimization error:`, err.message);
                    });
                });
            }
        } catch (err) {
            console.warn(`[SkillLibrary] Failed to update skill '${name}' metadata:`, err.message);
        }
    }

    /**
     * Task 11: Auto-trigger optimization for frequently used skills
     * Runs in background, does not block skill execution
     * 
     * @param {string} skillName - Skill to optimize
     */
    async autoOptimizeSkill(skillName) {
        // Check if already optimizing
        if (this.optimizingSkills.has(skillName)) {
            console.log(`[SkillLibrary] Skill '${skillName}' is already being optimized.`);
            return;
        }

        const skill = this.skills[skillName];
        if (!skill) return;

        // Check if recently optimized (< 7 days)
        const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
        if (skill.last_optimized && (Date.now() - skill.last_optimized) < COOLDOWN_MS) {
            console.log(`[SkillLibrary] Skill '${skillName}' was optimized recently. Skipping.`);
            return;
        }

        // Set lock
        this.optimizingSkills.add(skillName);
        console.log(`[SkillLibrary] 🎯 Auto-triggering optimization for '${skillName}' (used ${skill.success_count}x)`);

        try {
            const result = await this.skillOptimizer.optimize(skillName);

            if (result.success) {
                console.log(`[SkillLibrary] ✅ Auto-optimization succeeded (v${result.version}, ${result.attempts} attempts)`);
            } else {
                console.warn(`[SkillLibrary] ⚠️ Auto-optimization failed: ${result.error}`);
            }
        } catch (err) {
            console.error(`[SkillLibrary] Auto-optimization error:`, err.message);
        } finally {
            // Release lock
            this.optimizingSkills.delete(skillName);
        }
    }

    /**
     * Update metadata block in skill file
     */
    updateMetadataInFile(content, updates) {
        const metaMatch = content.match(/(@metadata\s+)({[\s\S]*?})/);
        if (!metaMatch) return content;

        try {
            const existingMeta = JSON.parse(metaMatch[2]);
            const updatedMeta = { ...existingMeta, ...updates };
            return content.replace(metaMatch[0], `@metadata ${JSON.stringify(updatedMeta, null, 2)}`);
        } catch (err) {
            console.warn('[SkillLibrary] Failed to update metadata:', err.message);
            return content;
        }
    }

    /**
     * Search for skills by query
     * @param {string} query - Search terms
     * @returns {Object|null} Best matching skill
     */
    search(query) {
        const queryTerms = query.toLowerCase().split(/\s+/);
        let bestMatch = null;
        let maxScore = 0;

        for (const [name, skill] of Object.entries(this.skills)) {
            let score = 0;
            const textToSearch = (name + ' ' + skill.description + ' ' + (skill.tags || []).join(' ')).toLowerCase();

            for (const term of queryTerms) {
                if (textToSearch.includes(term)) score++;
            }

            if (score > 0 && score > maxScore) {
                maxScore = score;
                bestMatch = { name, ...skill };
            }
        }

        if (bestMatch && maxScore > 0) {
            console.log(`[SkillLibrary] Found match for '${query}': ${bestMatch.name}`);
            return bestMatch;
        }

        return null;
    }

    /**
     * Get summary of all skills (for DualBrain context injection)
     * @returns {string} Skill catalog summary
     */
    getSummary() {
        const skillNames = Object.keys(this.skills);
        if (skillNames.length === 0) {
            return 'No skills available yet.';
        }

        const summaries = skillNames.map(name => {
            const skill = this.skills[name];
            return `- ${name}: ${skill.description} (used ${skill.success_count || 0}x)`;
        });

        return `Available skills (${skillNames.length}):\n${summaries.join('\n')}`;
    }

    /**
     * Migrate from old JSON format to file-based
     * Task 9: Migration helper
     */
    migrateFromJSON(jsonPath = 'src/skills/skills.json') {
        try {
            if (!fs.existsSync(jsonPath)) {
                console.log('[SkillLibrary] No JSON file to migrate.');
                return;
            }

            const oldSkills = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            let migrated = 0;

            for (const [name, skill] of Object.entries(oldSkills)) {
                this.addSkill(name, skill.code, skill.description, skill.tags || []);
                migrated++;
            }

            console.log(`[SkillLibrary] Migrated ${migrated} skills from JSON to file-based.`);

            // Rename old file
            fs.renameSync(jsonPath, jsonPath + '.backup');
            console.log(`[SkillLibrary] Old JSON backed up to ${jsonPath}.backup`);
        } catch (err) {
            console.error('[SkillLibrary] Migration failed:', err);
        }
    }
}
