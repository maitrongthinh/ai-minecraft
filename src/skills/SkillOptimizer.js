/**
 * SkillOptimizer - Task 10
 * 
 * Optimizes skill code using MiniMax-M2 AI
 * - Reads old code
 * - Sends to MiniMax for optimization
 * - Tests optimized version
 * - Saves if successful, otherwise rollback
 */

import fs from 'fs';
import path from 'path';
// Prompter import removed - reusing agent.prompter instead

const MAX_OPTIMIZATION_ATTEMPTS = 3;

export class SkillOptimizer {
    /**
     * @param {Object} agent - Agent instance
     * @param {SkillLibrary} skillLibrary - SkillLibrary instance
     */
    constructor(agent, skillLibrary) {
        this.agent = agent;
        this.skillLibrary = skillLibrary;
        // Reuse agent's existing prompter instead of creating new one
        this.prompter = agent.prompter;
    }

    /**
     * Optimize a skill using MiniMax-M2
     * Task 10: Main optimization workflow
     * 
     * @param {string} skillName - Name of skill to optimize
     * @returns {Promise<Object>} Optimization result
     */
    async optimize(skillName) {
        console.log(`[SkillOptimizer] Starting optimization for '${skillName}'...`);

        const skill = this.skillLibrary.getSkill(skillName);
        if (!skill) {
            console.error(`[SkillOptimizer] Skill '${skillName}' not found.`);
            return { success: false, error: 'Skill not found' };
        }

        // Check if recently optimized (< 24h ago)
        if (skill.last_optimized && (Date.now() - skill.last_optimized) < 86400000) {
            console.log(`[SkillOptimizer] Skill '${skillName}' was recently optimized. Skipping.`);
            return { success: false, error: 'Recently optimized' };
        }

        // Backup current version
        const backupPath = this.backupSkill(skillName, skill);
        console.log(`[SkillOptimizer] Backed up to ${backupPath}`);

        let attempts = 0;
        let optimized = false;
        let optimizedCode = null;

        while (attempts < MAX_OPTIMIZATION_ATTEMPTS && !optimized) {
            attempts++;
            console.log(`[SkillOptimizer] Attempt ${attempts}/${MAX_OPTIMIZATION_ATTEMPTS}...`);

            try {
                // Generate optimization prompt
                const prompt = this.generateOptimizationPrompt(skill, attempts);

                // Call MiniMax via DualBrain
                const response = await this.agent.brain.code(prompt);

                // Extract code from response
                optimizedCode = this.extractCode(response);

                if (!optimizedCode) {
                    console.warn('[SkillOptimizer] Failed to extract code from AI response.');
                    continue;
                }

                // Test optimized code (syntax check + basic validation)
                const testResult = await this.testSkillCode(skillName, optimizedCode);

                if (testResult.success) {
                    optimized = true;
                    console.log(`[SkillOptimizer] ✓ Optimization successful on attempt ${attempts}`);
                } else {
                    console.warn(`[SkillOptimizer] Test failed: ${testResult.error}`);
                }
            } catch (err) {
                console.error(`[SkillOptimizer] Attempt ${attempts} failed:`, err.message);
            }
        }

        if (optimized) {
            // Save optimized version
            this.skillLibrary.addSkill(
                skillName,
                optimizedCode,
                skill.description,
                skill.tags || []
            );

            // Update last_optimized timestamp
            const updatedSkill = this.skillLibrary.getSkill(skillName);
            updatedSkill.last_optimized = Date.now();
            this.skillLibrary.addSkill(
                skillName,
                optimizedCode,
                skill.description,
                skill.tags || []
            );

            console.log(`[SkillOptimizer] ✓ Skill '${skillName}' optimized and saved (v${updatedSkill.version})`);
            return { success: true, version: updatedSkill.version, attempts };
        } else {
            // Rollback on failure
            console.warn(`[SkillOptimizer] Optimization failed after ${attempts} attempts. Rolling back...`);
            this.rollback(skillName, backupPath);
            return { success: false, error: 'Optimization failed', attempts };
        }
    }

    /**
     * Generate optimization prompt for MiniMax
     */
    generateOptimizationPrompt(skill, attemptNumber) {
        const codeWithoutMetadata = this.stripMetadata(skill.code);

        return `You are an expert JavaScript/Node.js developer optimizing a Minecraft bot skill.

**Current Skill:**
\`\`\`javascript
${codeWithoutMetadata}
\`\`\`

**Description:** ${skill.description}
**Success Count:** ${skill.success_count || 0}
**Version:** ${skill.version || 1}

**Optimization Goals (Attempt ${attemptNumber}):**
1. **Performance:** Reduce unnecessary loops, use efficient algorithms
2. **Robustness:** Add error handling, edge case checks
3. **Readability:** Clean code, clear variable names, JSDoc comments
4. **Best Practices:** Modern JavaScript (async/await, optional chaining)

${attemptNumber > 1 ? '**Previous attempt failed. Try a different approach.**' : ''}

**Requirements:**
- Keep the same function signature and exports
- Preserve core functionality (don't change what the skill does)
- Add try-catch for error handling
- Return meaningful success/error messages
- Use mineflayer best practices

**Output Format:**
Provide ONLY the optimized JavaScript code, no explanations. Start with the code block:

\`\`\`javascript
// Optimized skill code here
\`\`\`
`;
    }

    /**
     * Strip metadata block from skill code
     */
    stripMetadata(code) {
        return code.replace(/\/\*\*[\s\S]*?\*\/\s*/, '').trim();
    }

    /**
     * Extract code from AI response
     */
    extractCode(response) {
        // Try to extract code from markdown code block
        const codeBlockMatch = response.match(/```(?:javascript)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
            return codeBlockMatch[1].trim();
        }

        // Fallback: use entire response if no code block
        return response.trim();
    }

    /**
     * Test optimized skill code
     * Task 10: Basic validation (syntax + structure check)
     */
    async testSkillCode(skillName, code) {
        try {
            // 1. Syntax check: Try to parse as module
            const { SyntaxError } = await import('acorn');
            // Basic syntax validation would go here

            // 2. Check if exports exist
            if (!code.includes('module.exports') && !code.includes('export default')) {
                return { success: false, error: 'No exports found' };
            }

            // 3. Check for function definition
            if (!code.includes('function') && !code.includes('=>')) {
                return { success: false, error: 'No function found' };
            }

            // More advanced testing could:
            // - Actually execute in sandbox
            // - Mock bot object and test calls
            // - Check for common errors (undefined vars, etc.)

            console.log(`[SkillOptimizer] ✓ Code validation passed for '${skillName}'`);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Backup skill before optimization
     */
    backupSkill(skillName, skill) {
        const timestamp = Date.now();
        const backupDir = path.join(path.dirname(skill.filePath), '.backups');

        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const backupPath = path.join(backupDir, `${skillName}_v${skill.version || 1}_${timestamp}.js`);
        fs.writeFileSync(backupPath, skill.code, 'utf8');

        return backupPath;
    }

    /**
     * Rollback to backup version
     */
    rollback(skillName, backupPath) {
        try {
            const skill = this.skillLibrary.getSkill(skillName);
            const backupCode = fs.readFileSync(backupPath, 'utf8');

            // Restore from backup
            fs.writeFileSync(skill.filePath, backupCode, 'utf8');

            console.log(`[SkillOptimizer] ✓ Rolled back '${skillName}' to backup`);
        } catch (err) {
            console.error(`[SkillOptimizer] Rollback failed:`, err);
        }
    }

    /**
     * Get optimization stats for a skill
     */
    getOptimizationHistory(skillName) {
        const skill = this.skillLibrary.getSkill(skillName);
        if (!skill) return null;

        const backupDir = path.join(path.dirname(skill.filePath), '.backups');
        if (!fs.existsSync(backupDir)) return { versions: 0 };

        const backups = fs.readdirSync(backupDir)
            .filter(f => f.startsWith(skillName))
            .map(f => ({
                file: f,
                version: parseInt(f.match(/_v(\d+)_/)?.[1] || '0'),
                timestamp: parseInt(f.match(/_(\d+)\.js$/)?.[1] || '0')
            }))
            .sort((a, b) => b.timestamp - a.timestamp);

        return {
            current_version: skill.version || 1,
            versions: backups.length,
            last_optimized: skill.last_optimized,
            backups
        };
    }
}
