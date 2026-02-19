import { globalBus, SIGNAL } from './SignalBus.js';

/**
 * Profiler - The MindOS Diagnostic Eye
 * 
 * Tracks system latency, tick rates, signal processing time, and memory usage.
 * Emits warnings if performance thresholds are breached.
 */
export class Profiler {
    constructor(agent) {
        this.agent = agent;
        this.metrics = {
            ticks: new Map(), // name -> { startTime, duration, count }
            signals: new Map(), // signal -> { totalLatency, count }
            lastMemoryReport: 0
        };

        this.thresholds = {
            tick_latency: 50, // ms
            signal_latency: 100, // ms
            memory_warn: 500 * 1024 * 1024 // 500 MB
        };
    }

    init() {
        console.log('[Profiler] 📈 System Profiler Initialized.');

        // Listen for all signals to track processing time (approximate)
        // High-level monitoring via SignalBus
        globalBus.subscribe(SIGNAL.SYSTEM_TICK, () => this.reportMemory());
    }

    /**
     * Start measuring a block of code (e.g. System 2 Loop)
     */
    startTick(name) {
        this.metrics.ticks.set(name, { startTime: performance.now() });
    }

    /**
     * Stop measuring and record duration
     */
    endTick(name) {
        const metric = this.metrics.ticks.get(name);
        if (!metric) return;

        const duration = performance.now() - metric.startTime;
        metric.duration = duration;
        metric.count = (metric.count || 0) + 1;

        if (duration > this.thresholds.tick_latency) {
            console.warn(`[Profiler] ⚠️ LATENCY WARNING: ${name} took ${duration.toFixed(2)}ms`);
        }
    }

    /**
     * Record signal processing latency
     */
    recordSignalLatency(signal, startTime) {
        const latency = performance.now() - startTime;
        let data = this.metrics.signals.get(signal) || { total: 0, count: 0 };
        data.total += latency;
        data.count++;
        this.metrics.signals.set(signal, data);

        if (latency > this.thresholds.signal_latency) {
            console.warn(`[Profiler] 🐢 SLOW SIGNAL: ${signal} took ${latency.toFixed(2)}ms`);
        }
    }

    reportMemory() {
        const now = Date.now();
        if (now - this.metrics.lastMemoryReport < 60000) return; // Once per min

        const mem = process.memoryUsage();
        const heapUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(2);

        console.log(`[Profiler] 🧠 Memory: ${heapUsedMB} MB (Heap)`);

        if (mem.heapUsed > this.thresholds.memory_warn) {
            console.warn(`[Profiler] ‼️ MEMORY CRITICAL: ${heapUsedMB} MB used.`);
            globalBus.emitSignal(SIGNAL.MEMORY_WARNING, { usage: mem });
        }

        this.metrics.lastMemoryReport = now;
    }

    getStats() {
        return {
            ticks: Object.fromEntries(this.metrics.ticks),
            signals: Object.fromEntries(this.metrics.signals),
            memory: process.memoryUsage()
        };
    }
}
