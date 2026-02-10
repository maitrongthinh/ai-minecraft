import fs from 'fs';
import path from 'path';
import { SkillLibrary } from '../../src/skills/SkillLibrary.js';

const skillName = 'test_skill_system_temp';
const skillPath = path.resolve(`src/skills/library/${skillName}.js`);

const testSkillCode = `export default async function ${skillName}(agent, params = {}) {
    return { success: true, message: 'ok', params };
}`;

function assertOrThrow(message, condition) {
    if (!condition) {
        throw new Error(message);
    }
    console.log(`PASS ${message}`);
}

console.log('Running SkillLibrary integration checks...');
async function run() {
    const library = new SkillLibrary();
    await library.init();
    await library.addSkill(skillName, testSkillCode, 'Temporary test skill', ['test', 'skill']);

    assertOrThrow('skill file created', fs.existsSync(skillPath));
    const raw = fs.readFileSync(skillPath, 'utf8');
    assertOrThrow('metadata block exists', raw.includes('@metadata'));
    assertOrThrow('description exists', raw.includes('Temporary test skill'));

    const library2 = new SkillLibrary();
    await library2.init();
    const loaded = library2.getSkill(skillName);
    assertOrThrow('skill loads from disk', !!loaded);

    await library2.markSuccess(skillName);
    await library2.markSuccess(skillName);
    await library2.markSuccess(skillName);
    assertOrThrow('success_count increments', library2.getSkill(skillName).success_count >= 3);

    const summary = await library2.getSummary();
    assertOrThrow('summary contains skill name', summary.includes(skillName));

    const searchResult = library2.search('temporary test skill');
    assertOrThrow('search returns test skill', searchResult && searchResult.name === skillName);

    let optimizedSkill = null;
    library2.setOptimizer({
        optimize: async (name) => {
            optimizedSkill = name;
            return { success: true, version: 2, attempts: 1 };
        }
    });

    for (let i = 0; i < 7; i++) {
        await library2.markSuccess(skillName);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    assertOrThrow('auto optimize trigger executed at >= 10 uses', optimizedSkill === skillName);

    if (fs.existsSync(skillPath)) {
        fs.unlinkSync(skillPath);
    }

    console.log('All SkillLibrary checks passed.');
}

run()
    .then(() => globalThis.process.exit(0))
    .catch((error) => {
        console.error('FAIL', error.message);
        if (fs.existsSync(skillPath)) {
            fs.unlinkSync(skillPath);
        }
        globalThis.process.exit(1);
    });
