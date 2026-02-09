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
import { globalBus, SIGNAL } from '../agent/core/SignalBus.js'; // Phase 4.5: MindOS Integration
import { AsyncLock } from '../utils/AsyncLock.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LIBRARY_DIR = path.resolve(__dirname, 'library');
const GENERATED_DIR = path.resolve(__dirname, 'generated'); // Phase 2: AI-generated skills

export class SkillLibrary {
    constructor(skillOptimizer = null) {
        this.skills = {}; // Cached in-memory for fast access
        this.skillOptimizer = skillOptimizer; // Task 11: Optimizer reference
        this.optimizingSkills = new Set(); // Task 11: Lock flags to prevent concurrent optimization
        this.fileLock = new AsyncLock(); // Phase 1: File I/O Mutex

        // Phase 2: Evolution Engine support
        this.blacklist = new Map(); // skillName -> failCount (blacklist after 3 failures)
        this.generatedDir = GENERATED_DIR;

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
     * Ensure library directories exist
     */
    ensureLibraryDir() {
        if (!fs.existsSync(LIBRARY_DIR)) {
            fs.mkdirSync(LIBRARY_DIR, { recursive: true });
            console.log(`[SkillLibrary] Created library directory: ${LIBRARY_DIR}`);
        }
        // Phase 2: Ensure generated skills directory exists
        if (!fs.existsSync(GENERATED_DIR)) {
            fs.mkdirSync(GENERATED_DIR, { recursive: true });
            console.log(`[SkillLibrary] Created generated directory: ${GENERATED_DIR}`);
        }
    }

    /**
     * Load all skills from library/ directory
     * Task 9: Dynamic import of .js files
     */
    async loadSkills() {
        try {
            if (!fs.existsSync(LIBRARY_DIR)) return;
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
    async addSkill(name, code, description, tags = []) {
        const skillPath = path.join(LIBRARY_DIR, `${name}.js`);

        await this.fileLock.acquire(async () => {
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
                await fs.promises.writeFile(skillPath, fileContent, 'utf8');

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
        });
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

        // Atomic update via Mutex
        await this.fileLock.acquire(async () => {
            // Read fresh state just in case (though in-memory is source of truth here for simplistic counter)
            skill.success_count = (skill.success_count || 0) + 1;

            // Update metadata in file
            const updatedContent = this.updateMetadataInFile(skill.code, {
                success_count: skill.success_count,
                last_used: Date.now()
            });

            try {
                await fs.promises.writeFile(skill.filePath, updatedContent, 'utf8');
                this.skills[name].code = updatedContent;
                console.log(`[SkillLibrary] Skill '${name}' success count: ${skill.success_count}`);
            } catch (err) {
                console.warn(`[SkillLibrary] Failed to update skill '${name}' metadata:`, err.message);
            }
        });

        // Task 11: Auto-trigger optimization after 10 successful uses
        // OUTSIDE lock to avoid blocking
        if (skill.success_count >= 10 && this.skillOptimizer) {
            setImmediate(() => {
                this.autoOptimizeSkill(name).catch(err => {
                    console.error(`[SkillLibrary] Auto-optimization error:`, err.message);
                });
            });
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
     * Lock-protected to ensure consistent view of in-memory state.
     * @returns {Promise<string>} Skill catalog summary
     */
    async getSummary() {
        return await this.fileLock.acquire(async () => {
            const skillNames = Object.keys(this.skills);
            if (skillNames.length === 0) {
                return 'No skills available yet.';
            }

            const summaries = skillNames.map(name => {
                const skill = this.skills[name];
                return `- ${name}: ${skill.description} (used ${skill.success_count || 0}x)`;
            });

            return `Available skills (${skillNames.length}):\n${summaries.join('\n')}`;
        });
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

    // ═══════════════════════════════════════════════════════════════
    // Phase 2: Evolution Engine Support
    // ═══════════════════════════════════════════════════════════════

    /**
     * Hot-swap: Load new skill without restart
     * Used by EvolutionEngine to deploy AI-generated skills
     * 
     * @param {string} name - Skill name
     * @param {string} code - Skill code
     * @param {string} description - What the skill does
     * @returns {boolean} Success
     */
    async hotSwap(name, code, description) {
        try {
            const skillPath = path.join(this.generatedDir, `${name}.js`);

            // Generate JSDoc-annotated file
            const fileContent = this.generateSkillFile(name, code, description, ['generated', 'evolution'], {
                success_count: 0,
                created_at: Date.now(),
                last_optimized: null,
                version: 1,
                generated: true
            });

            // Write file
            fs.writeFileSync(skillPath, fileContent, 'utf8');

            // Update in-memory cache immediately
            this.skills[name] = {
                description,
                tags: ['generated', 'evolution'],
                filePath: skillPath,
                code: fileContent,
                success_count: 0,
                created_at: Date.now(),
                generated: true
            };

            console.log(`[SkillLibrary] 🔥 Hot-swapped: ${name}`);
            return true;
        } catch (err) {
            console.error(`[SkillLibrary] Hot-swap failed for '${name}':`, err.message);
            return false;
        }
    }

    /**
     * Mark a skill as failed
     * Handles intelligent classification: fatal errors (code bugs) cause immediate blacklist,
     * while transient errors (environment) increment a counter.
     * 
     * @param {string} name - Skill name
     * @param {Error} error - The error that occurred
     * @returns {boolean} True if skill was blacklisted
     */
    markFailure(name, error = null) {
        if (globalBus) globalBus.emitSignal(SIGNAL.SKILL_FAILED, { name, error: error?.message });

        // Phase 5: Intelligent Classification
        const errorMsg = error?.message || '';
        const isFatal = error instanceof ReferenceError ||
            error instanceof SyntaxError ||
            error instanceof TypeError ||
            errorMsg.includes('not defined') ||
            errorMsg.includes('unexpected token');

        if (isFatal) {
            console.warn(`[SkillLibrary] ⛔ FATAL ERROR in skill '${name}': Blacklisting immediately. Error: ${errorMsg}`);
            this.blacklist.set(name, 999); // Immediate blacklist
            delete this.skills[name];
            return true;
        }

        const maxRetries = settings.tactical?.max_retries || 3;
        const count = (this.blacklist.get(name) || 0) + 1;
        this.blacklist.set(name, count);

        console.log(`[SkillLibrary] ⚠️ Skill '${name}' failure count: ${count}/${maxRetries}`);

        if (count >= maxRetries) {
            // Remove from active skills
            delete this.skills[name];
            console.warn(`[SkillLibrary] ⛔ Blacklisted: ${name} (too many failures)`);
            return true; // Blacklisted
        }
        return false;
    }

    /**
     * Check if a skill is blacklisted
     * 
     * @param {string} name - Skill name
     * @returns {boolean}
     */
    isBlacklisted(name) {
        return (this.blacklist.get(name) || 0) >= 3;
    }

    /**
     * Clear blacklist for a skill (for recovery/testing)
     * 
     * @param {string} name - Skill name
     */
    clearBlacklist(name) {
        this.blacklist.delete(name);
        console.log(`[SkillLibrary] ✅ Cleared blacklist for: ${name}`);
    }

    /**
     * Get list of all generated skills
     * @returns {string[]} Names of generated skills
     */
    getGeneratedSkills() {
        return Object.entries(this.skills)
            .filter(([_, skill]) => skill.generated)
            .map(([name]) => name);
    }
}
