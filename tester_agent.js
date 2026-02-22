import { io } from "socket.io-client";
import fs from "fs";

const socket = io("http://127.0.0.1:8092");
const targetBot = "Groq";
const logFile = "C:\\Users\\trong\\.gemini\\antigravity\\brain\\d7d53bcf-75e6-49fb-b79f-3d93579d0aa6\\walkthrough.md";

fs.writeFileSync(logFile, "# Mindcraft Bot Comprehensive Test Report\n\n", "utf8");

function logToReport(text) {
    console.log(text);
    fs.appendFileSync(logFile, text + "\n", "utf8");
}

socket.on("connect", () => {
    logToReport("Connected to MindServer!");
});

const tests = [
    // Navigation
    { category: "Navigation", level: 1, cmd: "Walk forward 2 blocks." },
    { category: "Navigation", level: 2, cmd: "Look around and go to the nearest dirt block." },
    { category: "Navigation", level: 3, cmd: "Go up to y=70 if you are not already." },
    { category: "Navigation", level: 4, cmd: "Go to x=10, z=10." },
    { category: "Navigation", level: 5, cmd: "Explore the area for 20 seconds and come back here." },

    // Gathering
    { category: "Gathering", level: 1, cmd: "Break 1 dirt block." },
    { category: "Gathering", level: 2, cmd: "Collect 2 oak logs." },
    { category: "Gathering", level: 3, cmd: "Gather 3 cobblestone." },
    { category: "Gathering", level: 4, cmd: "Make a crafting table and craft a wooden pickaxe." },
    { category: "Gathering", level: 5, cmd: "Try to find and mine some coal or iron ore if you can find it, otherwise just get stone." },

    // Crafting
    { category: "Crafting", level: 1, cmd: "Craft some oak planks." },
    { category: "Crafting", level: 2, cmd: "Craft 4 sticks." },
    { category: "Crafting", level: 3, cmd: "Craft a wooden pickaxe if you don't have one." },
    { category: "Crafting", level: 4, cmd: "Craft a stone pickaxe." },
    { category: "Crafting", level: 5, cmd: "Craft a furnace." },

    // Combat
    { category: "Combat", level: 1, cmd: "Equip anything you have as a weapon." },
    { category: "Combat", level: 2, cmd: "Look for nearby animals to hunt." },
    { category: "Combat", level: 3, cmd: "If there is a hostile mob, attack it." },
    { category: "Combat", level: 4, cmd: "Defend this area for 30 seconds." },
    { category: "Combat", level: 5, cmd: "Craft a sword if you don't have one, and prepare for battle." },

    // Building
    { category: "Building", level: 1, cmd: "Place a dirt block down." },
    { category: "Building", level: 2, cmd: "Build a 3 block high pillar." },
    { category: "Building", level: 3, cmd: "Build a small 3x3 floor out of dirt or planks." },
    { category: "Building", level: 4, cmd: "Build a small wall next to the floor." },
    { category: "Building", level: 5, cmd: "Try to build a tiny house or shelter with whatever blocks you have." }
];

let testIndex = 0;

function runNextTest() {
    if (testIndex >= tests.length) {
        logToReport("\n## ALL TESTS COMPLETED!");
        process.exit(0);
    }
    const test = tests[testIndex++];
    logToReport(`\n### Test [${test.category} - L${test.level}]: ${test.cmd}`);

    const prompt = `TEST OBJECTIVE: ${test.cmd}\nYou MUST use the 'actions' or 'skills' library to execute this request. Respond in VALID JSON format ONLY, as required by your core instructions, with your code inside the task.content field. Do NOT wrap in markdown blocks.`;
    socket.emit("send-message", targetBot, { from: 'system', message: prompt });

    // Wait 25 seconds for each task
    setTimeout(runNextTest, 25000);
}

// Ensure the bot is there before starting
let started = false;
socket.on("agents-status", (agents) => {
    const groq = agents.find(a => a.name === targetBot);
    if (groq && groq.in_game && !started) {
        started = true;
        logToReport(`${targetBot} is in-game! Starting tests in 5 seconds...`);
        setTimeout(runNextTest, 5000);
    }
});

socket.on("bot-output", (agentName, message) => {
    logToReport(`**BOT-OUTPUT (${agentName}):** ${message}`);
});

socket.on("bot-thought", (agentName, thought) => {
    logToReport(`**BOT-THOUGHT (${agentName}):** ${thought}`);
});

socket.on("chat-message", (agentName, json) => {
    logToReport(`**CHAT (${agentName}):** ${json.message}`);
});
