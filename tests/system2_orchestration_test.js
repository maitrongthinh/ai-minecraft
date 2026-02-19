import Vec3 from 'vec3';
import { Agent } from '../src/agent/agent.js';
import { globalBus, SIGNAL } from '../src/agent/core/SignalBus.js';
import EventEmitter from 'events';
import { MemorySystem } from '../src/agent/memory/MemorySystem.js';
import { EvolutionEngine } from '../src/agent/core/EvolutionEngine.js';
import { ToolRegistry } from '../src/tools/core/ToolRegistry.js';
import { SkillLibrary as AgentSkillLib } from '../src/agent/library/skill_library.js';
import { SkillLibrary as RootSkillLib } from '../src/skills/SkillLibrary.js';
import { VectorStore } from '../src/memory/VectorStore.js';
import { Examples } from '../src/utils/examples.js';
import { Prompter } from '../src/models/prompter.js';

// Mock heavy prototypes BEFORE any class is instantiated
MemorySystem.prototype.initialize = async () => console.log('[Test] Mock Memory prototype initialized');
EvolutionEngine.prototype.initialize = async () => console.log('[Test] Mock Evolution prototype initialized');
ToolRegistry.prototype.discoverSkills = async () => console.log('[Test] Mock ToolRegistry prototype initialized');
AgentSkillLib.prototype.initSkillLibrary = async () => console.log('[Test] Mock Agent SkillLibrary initialized');
RootSkillLib.prototype.init = async () => console.log('[Test] Mock Root SkillLibrary initialized');
RootSkillLib.prototype.loadSkills = async () => console.log('[Test] Mock Root SkillLibrary loadSkills initialized');
VectorStore.prototype.init = async () => console.log('[Test] Mock VectorStore prototype init');
VectorStore.prototype.getEmbedding = async () => new Array(384).fill(0);
VectorStore.prototype.load = () => { };
Examples.prototype.load = async () => console.log('[Test] Mock Examples prototype loaded');
// Partially mock Prompter to avoid profile loading errors in constructor
Prompter.prototype.initExamples = async () => console.log('[Test] Mock Prompter.initExamples');

// Mock Bot
class MockBot extends EventEmitter {
    constructor() {
        super();
        this.username = 'Groq';
        this.entity = {
            position: new Vec3(0, 0, 0),
            yaw: 0,
            height: 1.6
        };
        this.health = 20;
        this.food = 20;
        this.inventory = new EventEmitter(); // TaskScheduler expects EventEmitter
        this.inventory.items = () => [];
        this.inventory.slots = new Array(46);
    }
}

async function runSystem2OrchestrationTest() {
    console.log('--- MIND-SYNC Integration Test: System 2 Orchestration ---');

    const agent = new Agent();
    const mockBot = new MockBot();

    // Mock _connectToMinecraft
    agent._connectToMinecraft = async () => {
        agent.bot = mockBot;
        globalBus.emitSignal(SIGNAL.BOT_READY);
        return true;
    };

    try {
        console.log('[Test] Starting Agent...');
        await agent.start();
        console.log('[Test] Agent and System 2 initialized.');

        // Final sanity check on references
        console.log('[Test] Health Check:');
        console.log(' - Agent Scheduler:', !!agent.scheduler);
        console.log(' - Agent Blackboard:', !!agent.scheduler?.blackboard);
        console.log(' - Agent System2:', !!agent.system2);
        console.log(' - Agent Bot:', !!agent.bot);
    } catch (err) {
        console.error('[Test] 💥 STARTUP ERROR:', err.stack || err);
        process.exit(1);
    }

    try {
        const system2 = agent.system2;
        const bb = agent.scheduler?.blackboard;

        if (!bb) {
            console.error('[Test] ❌ ERROR: Blackboard is undefined! Scheduler:', !!agent.scheduler);
            process.exit(1);
        }

        // 1. Mock Sub-Agents to avoid LLM calls
        console.log('[Test] Mocking sub-agents for deterministic testing...');

        system2.planner.decompose = async (goal) => {
            console.log(`[Test] Mock Planner decomposing: ${goal}`);
            return {
                success: true,
                plan: [
                    { id: 1, task: 'test_step_1', params: {}, status: 'pending' },
                    { id: 2, task: 'test_step_2', params: {}, status: 'pending' }
                ]
            };
        };

        system2.critic.review = async (plan) => {
            console.log('[Test] Mock Critic reviewing plan with scores...');
            return {
                approved: true,
                issues: [],
                suggestions: [],
                scores: { safety: 1.0, resource: 0.9, efficiency: 0.95 },
                summary: 'Perfect scores!'
            };
        };

        // We want to test the REAL ExecutorAgent's Blackboard reporting, 
        // but we'll mock the internal skill execution
        system2.executor._executeViaRegistry = async (step) => {
            console.log(`[Test] Mock Executor running step: ${step.task}`);
            return { success: true, message: 'Done' };
        };

        // 2. Test Goal Processing & Blackboard Reporting
        console.log('[Test] Processing Goal: "Verify System 2"');
        const goalPromise = system2.processGoal('Verify System 2');

        // Check planning/validating phase
        await new Promise(r => setTimeout(r, 100));
        console.log('[DEBUG] Agent.scheduler exists:', !!agent.scheduler);
        console.log('[DEBUG] Agent.scheduler.blackboard exists:', !!agent.scheduler?.blackboard);
        const activeGoal = agent.scheduler.blackboard.get('system2_state.active_goal');
        const phase = agent.scheduler.blackboard.get('system2_state.plan_phase');

        console.log(`[Test] Blackboard Goal: ${activeGoal}, Phase: ${phase}`);

        if (activeGoal === 'Verify System 2') {
            console.log('✅ Blackboard Active Goal OK');
        } else {
            console.error('❌ Blackboard Active Goal Mismatch', activeGoal);
        }

        // Wait for execution to start
        await new Promise(r => setTimeout(r, 350));
        const execPhase = agent.scheduler.blackboard.get('system2_state.plan_phase');
        const execStep = agent.scheduler.blackboard.get('system2_state.current_step');
        console.log(`[Test] Current Phase: ${execPhase}, Step: ${execStep?.task}`);

        if (execPhase === 'executing' && execStep && execStep.task === 'test_step_1') {
            console.log('✅ Blackboard Execution Phase & Step OK');
        } else {
            console.error('❌ Blackboard Execution Phase & Step Failed', { phase: execPhase, step: execStep });
        }

        await goalPromise;

        // Check Completion & Idle Reset
        const finalPhase = agent.scheduler.blackboard.get('system2_state.plan_phase');
        console.log(`[Test] Final Phase (Expected idle): ${finalPhase}`);
        if (finalPhase === 'idle') {
            console.log('✅ Blackboard Completion Reset OK');
        } else {
            console.error('❌ Blackboard Completion Reset Failed', finalPhase);
        }

        // 3. Test Human Override Priority
        console.log('[Test] Testing Human Override (Voice of God)...');

        // Start a long-running goal
        system2.executor._executeViaRegistry = async (step) => {
            await new Promise(r => setTimeout(r, 2000));
            return { success: true };
        };

        const longGoalPromise = system2.processGoal('Long Task');
        await new Promise(r => setTimeout(r, 200));

        console.log('[Test] Emitting HUMAN_OVERRIDE signal...');
        globalBus.emitSignal(SIGNAL.HUMAN_OVERRIDE, {
            payload: { goal: 'Emergency Reroute' }
        });

        await new Promise(r => setTimeout(r, 1000));
        const overrideGoal = agent.scheduler.blackboard.get('system2_state.active_goal');
        console.log(`[Test] Post-Override Goal: ${overrideGoal}`);

        if (overrideGoal === 'Emergency Reroute') {
            console.log('✅ Human Override Interruption OK');
        } else {
            console.error('❌ Human Override Interruption Failed', overrideGoal);
        }

        console.log('[Test] Cleanup...');
        agent.core.shutdown();
        console.log('--- Test Complete ---');
        process.exit(0);

    } catch (err) {
        console.error('[Test] 💥 ERROR during test:', err);
        process.exit(1);
    }
}

runSystem2OrchestrationTest();
