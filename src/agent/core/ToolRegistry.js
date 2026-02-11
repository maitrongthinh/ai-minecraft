import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { globalBus, SIGNAL } from './SignalBus.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ToolRegistry - MCP-Compatible Skill Discovery System
 * 
 * Central registry for all bot skills/tools. Provides:
 * - Auto-discovery of skills from /skills/library/
 * - MCP JSON Schema validation
 * - Skill filtering by tags (combat, building, survival)
 * - Usage statistics tracking
 * - Dynamic skill registration (for EvolutionEngine)
 */
export class ToolRegistry {
    constructor(agent) {
        this.agent = agent;
        this.skills = new Map(); // name -> skill metadata
        this.usageStats = new Map(); // name -> usage count
        this.tags = new Map(); // tag -> Set of skill names

        console.log('[ToolRegistry] Initialized');
    }

    /**
     * Auto-discover all skills from the skills library
     */
    async discoverSkills() {
        console.log('[ToolRegistry] Discovering skills...');

        try {
            const skillsPath = path.join(__dirname, '../../../src/skills/library');

            if (!fs.existsSync(skillsPath)) {
                console.warn('[ToolRegistry] Skills directory not found:', skillsPath);
                return;
            }

            const files = fs.readdirSync(skillsPath)
                .filter(f => f.endsWith('.js'));

            for (const file of files) {
                try {
                    await this._loadSkill(path.join(skillsPath, file));
                } catch (error) {
                    console.error(`[ToolRegistry] Error loading skill ${file}:`, error.message);
                }
            }

            console.log(`[ToolRegistry] Discovered ${this.skills.size} skills`);
            globalBus.emitSignal(SIGNAL.SYSTEM_READY, {
                component: 'ToolRegistry',
                skillCount: this.skills.size
            });

        } catch (error) {
            console.error('[ToolRegistry] Error discovering skills:', error);
        }
    }

    /**
     * Load a single skill file and register it
     * @private
     */
    async _loadSkill(skillPath) {
        const skillModule = await import(`file://${skillPath}`);

        // Extract metadata from skill
        const metadata = this._extractMetadata(skillModule, skillPath);
        if (!metadata) {
            return;
        }

        // Validate schema
        if (!this._validateSchema(metadata)) {
            console.warn(`[ToolRegistry] Invalid schema for skill: ${metadata.name}`);
            return;
        }

        // Register skill
        this.registerSkill(metadata.name, metadata);
    }

    /**
     * Extract metadata from skill function/object
     * @private
     */
    _extractMetadata(skillModule, skillPath) {
        const skill = skillModule.default;
        const metadataFromModule = skillModule.metadata || skill?.metadata;

        // Skip helper modules that do not export a callable default skill.
        if (typeof skill !== 'function') {
            return null;
        }

        // If skill has explicit metadata
        if (metadataFromModule) {
            return {
                ...metadataFromModule,
                execute: skill,
                path: skillPath
            };
        }

        // Otherwise, create basic metadata
        const name = path.basename(skillPath, '.js');

        return {
            name,
            description: skill.description || `Execute ${name} skill`,
            parameters: {
                type: 'object',
                properties: skill.parameters || {},
                required: skill.required || []
            },
            returns: {
                type: 'object',
                properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' }
                }
            },
            tags: skill.tags || ['general'],
            execute: skill,
            path: skillPath
        };
    }

    /**
     * Validate skill schema (MCP-compatible)
     * @private
     */
    _validateSchema(metadata) {
        if (!metadata.name || typeof metadata.name !== 'string') {
            return false;
        }

        if (!metadata.parameters || metadata.parameters.type !== 'object') {
            return false;
        }

        if (!metadata.parameters.properties || typeof metadata.parameters.properties !== 'object') {
            return false;
        }

        if (!metadata.execute || typeof metadata.execute !== 'function') {
            return false;
        }

        return true;
    }

    /**
     * Register a skill manually (used by EvolutionEngine)
     */
    registerSkill(name, metadata) {
        this.skills.set(name, metadata);
        this.usageStats.set(name, 0);

        // Index by tags
        const tags = metadata.tags || ['general'];
        for (const tag of tags) {
            if (!this.tags.has(tag)) {
                this.tags.set(tag, new Set());
            }
            this.tags.get(tag).add(name);
        }

        console.log(`[ToolRegistry] Registered skill: ${name} [${tags.join(', ')}]`);

        globalBus.emitSignal(SIGNAL.SKILL_REGISTERED, { name, tags });
    }

    /**
     * Register a dynamic skill with executor (Phase 6: EvolutionEngine integration)
     * @param {string} name - Skill name
     * @param {object} metadata - MCP-compatible metadata
     * @param {function} executor - Async function(agent, params) => result
     */
    async registerDynamicSkill(name, metadata, executor) {
        // Validate executor
        if (typeof executor !== 'function') {
            throw new Error(`Executor for skill '${name}' must be a function`);
        }

        // Build complete metadata
        const fullMetadata = {
            ...metadata,
            name,
            execute: executor,
            dynamic: true,
            registeredAt: Date.now()
        };

        // Use existing registerSkill
        this.registerSkill(name, fullMetadata);

        console.log(`[ToolRegistry] ⚡ Dynamic skill registered: ${name} (evolved: ${metadata.evolved || false})`);

        return true;
    }

    /**
     * Get all evolved/dynamic skills
     */
    getEvolvedSkills() {
        const evolved = [];
        for (const [name, metadata] of this.skills) {
            if (metadata.dynamic || metadata.evolved) {
                evolved.push({
                    name,
                    description: metadata.description,
                    evolvedFrom: metadata.evolvedFrom,
                    registeredAt: metadata.registeredAt
                });
            }
        }
        return evolved;
    }

    /**
     * Find a skill by name
     */
    findSkill(name) {
        return this.skills.get(name);
    }

    /**
     * Get all skills with a specific tag
     */
    getSkillsByTag(tag) {
        const skillNames = this.tags.get(tag);
        if (!skillNames) return [];

        return Array.from(skillNames).map(name => this.skills.get(name));
    }

    /**
     * Get all skills as MCP-formatted schemas
     */
    getAllSchemas() {
        const schemas = [];

        for (const [name, metadata] of this.skills) {
            schemas.push({
                name: metadata.name,
                description: metadata.description,
                parameters: metadata.parameters,
                returns: metadata.returns,
                tags: metadata.tags || []
            });
        }

        return schemas;
    }

    /**
     * Execute a skill by name
     */
    async executeSkill(name, params = {}) {
        const skill = this.skills.get(name);

        if (!skill) {
            console.error(`[ToolRegistry] Skill not found: ${name}`);
            return {
                success: false,
                error: `Skill '${name}' not found in registry`
            };
        }

        try {
            // Validate parameters against schema
            const validation = this._validateParams(params, skill.parameters);
            if (!validation.valid) {
                return {
                    success: false,
                    error: `Invalid parameters: ${validation.error}`
                };
            }

            // Track usage
            this.usageStats.set(name, this.usageStats.get(name) + 1);

            // Execute skill
            console.log(`[ToolRegistry] Executing skill: ${name}`);
            const result = await skill.execute(this.agent, params);

            globalBus.emitSignal(SIGNAL.SKILL_EXECUTED, {
                name,
                params,
                success: result.success
            });

            return result;

        } catch (error) {
            console.error(`[ToolRegistry] Error executing skill ${name}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Validate parameters against schema
     * @private
     */
    _validateParams(params, schema) {
        if (!schema || typeof schema !== 'object') {
            return { valid: false, error: 'Invalid schema' };
        }

        if (params == null || typeof params !== 'object' || Array.isArray(params)) {
            return { valid: false, error: 'Parameters must be an object' };
        }

        // Basic validation - check required fields
        const required = schema.required || [];

        for (const field of required) {
            if (!(field in params)) {
                return {
                    valid: false,
                    error: `Missing required parameter: ${field}`
                };
            }
        }

        // Hệ thống validation JSON Schema (Production Grade)
        const properties = schema.properties || {};
        const allowAdditional = schema.additionalProperties === true;

        for (const key of Object.keys(params)) {
            if (!(key in properties) && !allowAdditional) {
                return {
                    valid: false,
                    error: `Thông số không xác định: ${key}`
                };
            }

            // Validation đệ quy cho object (nếu có)
            if (properties[key]?.type === 'object' && typeof params[key] === 'object') {
                const subValidation = this._validateParams(params[key], properties[key]);
                if (!subValidation.valid) return subValidation;
            }
        }

        for (const [key, value] of Object.entries(params)) {
            if (key in properties) {
                const descriptor = properties[key] || {};
                const expectedType = descriptor.type;

                if (expectedType === 'number' && typeof value !== 'number') {
                    return { valid: false, error: `Parameter '${key}' should be number` };
                }
                if (expectedType === 'integer' && !Number.isInteger(value)) {
                    return { valid: false, error: `Parameter '${key}' should be integer` };
                }
                if (expectedType === 'string' && typeof value !== 'string') {
                    return { valid: false, error: `Parameter '${key}' should be string` };
                }
                if (expectedType === 'boolean' && typeof value !== 'boolean') {
                    return { valid: false, error: `Parameter '${key}' should be boolean` };
                }
                if (expectedType === 'array' && !Array.isArray(value)) {
                    return { valid: false, error: `Parameter '${key}' should be array` };
                }
                if (expectedType === 'object' && (value == null || typeof value !== 'object' || Array.isArray(value))) {
                    return { valid: false, error: `Parameter '${key}' should be object` };
                }

                if (descriptor.enum && Array.isArray(descriptor.enum) && !descriptor.enum.includes(value)) {
                    return { valid: false, error: `Parameter '${key}' must be one of: ${descriptor.enum.join(', ')}` };
                }
                if (typeof descriptor.minimum === 'number' && typeof value === 'number' && value < descriptor.minimum) {
                    return { valid: false, error: `Parameter '${key}' must be >= ${descriptor.minimum}` };
                }
                if (typeof descriptor.maximum === 'number' && typeof value === 'number' && value > descriptor.maximum) {
                    return { valid: false, error: `Parameter '${key}' must be <= ${descriptor.maximum}` };
                }
            }
        }

        return { valid: true };
    }

    /**
     * Get usage statistics for all skills
     */
    getUsageStats() {
        const stats = [];

        for (const [name, count] of this.usageStats) {
            const skill = this.skills.get(name);
            stats.push({
                name,
                usageCount: count,
                tags: skill.tags || []
            });
        }

        return stats.sort((a, b) => b.usageCount - a.usageCount);
    }

    /**
     * Get human-readable list of all skills
     */
    listSkills() {
        const skills = [];

        for (const [name, metadata] of this.skills) {
            skills.push({
                name,
                description: metadata.description,
                tags: metadata.tags || [],
                usageCount: this.usageStats.get(name) || 0
            });
        }

        return skills;
    }

    /**
     * Search skills by query
     */
    searchSkills(query) {
        query = query.toLowerCase();
        const results = [];

        for (const [name, metadata] of this.skills) {
            const nameMatch = name.toLowerCase().includes(query);
            const descMatch = metadata.description.toLowerCase().includes(query);
            const tagMatch = (metadata.tags || []).some(t => t.toLowerCase().includes(query));

            if (nameMatch || descMatch || tagMatch) {
                results.push({
                    name,
                    description: metadata.description,
                    tags: metadata.tags || []
                });
            }
        }

        return results;
    }

    /**
     * Unregister a skill (for testing or hot-swap)
     */
    unregisterSkill(name) {
        const skill = this.skills.get(name);
        if (!skill) return false;

        // Remove from main registry
        this.skills.delete(name);
        this.usageStats.delete(name);

        // Remove from tag indices
        for (const tag of skill.tags || []) {
            const tagSet = this.tags.get(tag);
            if (tagSet) {
                tagSet.delete(name);
            }
        }

        console.log(`[ToolRegistry] Unregistered skill: ${name}`);
        return true;
    }

    /**
     * Refresh all skills (re-discover)
     */
    async refresh() {
        console.log('[ToolRegistry] Refreshing skills...');

        this.skills.clear();
        this.usageStats.clear();
        this.tags.clear();

        await this.discoverSkills();
    }
}
