import { SkillManager } from './src/agent/intelligence/SkillManager.js';
import fs from 'fs';
import path from 'path';

// Mock Agent
const agent = {
    prompts: {
        getProfilePath: () => './bots/TestBot'
    }
};

// Create dummy code file to simulate dynamic tool creation
const codePath = './bots/TestBot/skill_library/dummy_skill.js';
if (!fs.existsSync(path.dirname(codePath))) {
    fs.mkdirSync(path.dirname(codePath), { recursive: true });
}
fs.writeFileSync(codePath, 'module.exports = async function() { console.log("Dummy"); }');

console.log("--- Initializing Skill Manager ---");
const manager = new SkillManager(agent);

console.log("\n--- Adding Skill ---");
manager.addSkill('dummy_skill', 'A test skill for Hive-Mind', codePath, ['test']);

console.log("\n--- Checking Shared Manifest ---");
const sharedManifestPath = './bots/_shared_brain/skills_manifest.json';
if (fs.existsSync(sharedManifestPath)) {
    const data = JSON.parse(fs.readFileSync(sharedManifestPath, 'utf8'));
    console.log("Shared Manifest:", JSON.stringify(data, null, 2));
} else {
    console.error("Shared manifest NOT FOUND!");
}

console.log("\n--- Checking Shared Code File ---");
const sharedCodePath = './bots/_shared_brain/VerifiedSkills/dummy_skill.js';
if (fs.existsSync(sharedCodePath)) {
    console.log("Shared Code File exists!");
} else {
    console.error("Shared Code File NOT FOUND!");
}

console.log("\n--- Checking Merged Library ---");
console.log("All Skills:", Object.keys(manager.getAllSkills()));

console.log("\n--- Cleaning Up ---");
// Uncomment to clean up after test if desired
// fs.unlinkSync(codePath);
// fs.unlinkSync(sharedCodePath);
