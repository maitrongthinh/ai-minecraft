import fs from 'fs';

const groqProfilePath = './profiles/groq.json';
const lastProfilePath = './bots/Groq/last_profile.json';

try {
    const groqProfile = JSON.parse(fs.readFileSync(groqProfilePath, 'utf8'));
    const lastProfile = JSON.parse(fs.readFileSync(lastProfilePath, 'utf8'));

    // Extract the missing system prompts and examples
    const keysToInject = [
        'conversing',
        'coding',
        'saving_memory',
        'bot_responder',
        'image_analysis',
        'speak_model',
        'conversation_examples',
        'coding_examples'
    ];

    for (const key of keysToInject) {
        if (lastProfile[key] !== undefined && groqProfile[key] === undefined) {
            groqProfile[key] = lastProfile[key];
            console.log(`Injected: ${key}`);
        }
    }

    fs.writeFileSync(groqProfilePath, JSON.stringify(groqProfile, null, 4));
    console.log('Successfully repaired groq.json!');
} catch (err) {
    console.error('Error repairing profile:', err);
}
