import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { globalBus, SIGNAL } from '../src/agent/core/SignalBus.js';

const ROOT = process.cwd();
const BOTS_DIR = path.join(ROOT, 'bots');
const GENERATED_DIR = path.join(ROOT, 'src', 'skills', 'generated');

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function readJson(filePath, fallback = null) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        const raw = fs.readFileSync(filePath, 'utf8');
        if (!raw.trim()) return fallback;
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function writeJson(filePath, payload) {
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function runTestGate() {
    const checks = [
        'node tests/syntax_check.js',
        'node tests/test_settings.js'
    ];

    const results = [];
    for (const command of checks) {
        try {
            execSync(command, { cwd: ROOT, stdio: 'pipe' });
            results.push({ command, success: true });
        } catch (error) {
            const stderr = error?.stderr ? String(error.stderr) : String(error.message || 'unknown error');
            results.push({ command, success: false, stderr });
            return { passed: false, results };
        }
    }

    return { passed: true, results };
}

function sanitizeName(name) {
    return String(name || 'promoted_rule')
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60);
}

function buildGeneratedSkill(rule) {
    const skillName = sanitizeName(`promoted_${rule.intent || rule.id}`) || `promoted_${Date.now()}`;
    const metadata = {
        name: skillName,
        description: `Promoted behavior rule from ${rule.sourcePlayer || 'unknown'}`,
        parameters: {
            type: 'object',
            properties: {}
        },
        returns: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                message: { type: 'string' }
            }
        },
        tags: ['generated', 'behavior', 'nightly']
    };

    const code = `/**\n * Auto-generated from nightly promotion\n */\nexport const metadata = ${JSON.stringify(metadata, null, 4)};\n\nexport default async function execute() {\n    return { success: true, message: 'Promoted rule acknowledged: ${skillName}' };\n}\n`;

    return { skillName, code };
}

function appendJournal(journalPath, content) {
    const previous = fs.existsSync(journalPath) ? fs.readFileSync(journalPath, 'utf8') : '';
    fs.writeFileSync(journalPath, `${previous}${content}\n`, 'utf8');
}

function processBot(botName, gateResult) {
    const botDir = path.join(BOTS_DIR, botName);
    const rulesPath = path.join(botDir, 'behavior_rules.json');
    const metricsPath = path.join(botDir, 'learning_metrics.json');
    const promotedDir = path.join(botDir, 'promoted_rules');
    const journalDir = path.join(botDir, 'learning_journal');

    ensureDir(promotedDir);
    ensureDir(journalDir);
    ensureDir(GENERATED_DIR);

    const rules = readJson(rulesPath, []);
    const metrics = readJson(metricsPath, {});

    const activeRules = (Array.isArray(rules) ? rules : []).filter(rule => rule && rule.active !== false);
    const timestamp = new Date();
    const stamp = timestamp.toISOString().replace(/[:.]/g, '-');

    const promotionPayload = {
        bot: botName,
        timestamp: timestamp.toISOString(),
        gate: gateResult,
        candidates: activeRules,
        metricsSnapshot: metrics,
        promoted: []
    };

    if (gateResult.passed) {
        for (const rule of activeRules.slice(0, 10)) {
            const generated = buildGeneratedSkill(rule);
            const generatedPath = path.join(GENERATED_DIR, `${generated.skillName}.js`);
            fs.writeFileSync(generatedPath, generated.code, 'utf8');
            promotionPayload.promoted.push({
                ruleId: rule.id,
                skillName: generated.skillName,
                generatedPath
            });
        }
        globalBus.emitSignal(SIGNAL.LEARNING_PROMOTION_PASSED, {
            bot: botName,
            promoted: promotionPayload.promoted.length,
            candidates: activeRules.length,
            timestamp: Date.now()
        });
    } else {
        globalBus.emitSignal(SIGNAL.LEARNING_PROMOTION_FAILED, {
            bot: botName,
            reason: gateResult.results.find(r => !r.success)?.command || 'unknown',
            candidates: activeRules.length,
            timestamp: Date.now()
        });
    }

    const promotionFile = path.join(promotedDir, `promotion_${stamp}.json`);
    writeJson(promotionFile, promotionPayload);

    const journalPath = path.join(journalDir, `${timestamp.toISOString().slice(0, 10)}.md`);
    const journalLines = [
        `## Nightly Promotion (${timestamp.toISOString()})`,
        `- Test gate: ${gateResult.passed ? 'PASSED' : 'FAILED'}`,
        `- Active rules: ${activeRules.length}`,
        `- Promoted skills: ${promotionPayload.promoted.length}`
    ];

    if (!gateResult.passed) {
        const failed = gateResult.results.find(r => !r.success);
        if (failed) {
            journalLines.push(`- Failure: \`${failed.command}\``);
        }
    }

    appendJournal(journalPath, `${journalLines.join('\n')}\n`);

    return {
        bot: botName,
        gatePassed: gateResult.passed,
        activeRules: activeRules.length,
        promotedSkills: promotionPayload.promoted.length,
        promotionFile
    };
}

function main() {
    ensureDir(BOTS_DIR);
    ensureDir(GENERATED_DIR);

    const botNames = fs.readdirSync(BOTS_DIR)
        .filter(name => fs.statSync(path.join(BOTS_DIR, name)).isDirectory());

    const gateResult = runTestGate();
    const summaries = botNames.map(botName => processBot(botName, gateResult));

    const output = {
        timestamp: new Date().toISOString(),
        gate: gateResult,
        summaries
    };

    const outputPath = path.join(ROOT, 'tasks', 'nightly_promotion_summary.json');
    writeJson(outputPath, output);

    console.log('[nightly_promote_learning] Completed');
    console.log(JSON.stringify(output, null, 2));

    if (!gateResult.passed) {
        process.exitCode = 1;
    }
}

main();
