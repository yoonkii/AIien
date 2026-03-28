/**
 * Decision Logger — records Director decisions, prompts, and metrics as JSONL.
 * Enhanced with comprehensive telemetry inspired by budok-ai.
 *
 * Outputs:
 * - decisions-{sessionId}.jsonl — all Director decisions
 * - prompts-{sessionId}.jsonl — full prompt text for each decision (for prompt engineering analysis)
 * - metrics-{sessionId}.json — aggregated session metrics (written on close)
 */

import { appendFile, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import type { DirectorDecision } from "../game/GameState";
import type { DirectorMetrics } from "../ai/DirectorClient";

interface AggregatedMetrics {
  totalDecisions: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  totalTokensUsed: number;
  parseMethodCounts: Record<string, number>;
  fallbackCount: number;
  fallbackReasons: string[];
  strategyCounts: Record<string, number>;
  sessionDurationMs: number;
}

export class DecisionLogger {
  private decisionsPath: string;
  private promptsPath: string;
  private metricsPath: string;
  private ready: Promise<void>;
  private sessionStart = Date.now();

  // Aggregated metrics
  private totalDecisions = 0;
  private latencies: number[] = [];
  private totalTokens = 0;
  private parseMethodCounts: Record<string, number> = {};
  private fallbackCount = 0;
  private fallbackReasons: string[] = [];
  private strategyCounts: Record<string, number> = {};

  constructor(sessionId: string) {
    const dir = join(process.cwd(), "data", "sessions");
    this.decisionsPath = join(dir, `decisions-${sessionId}.jsonl`);
    this.promptsPath = join(dir, `prompts-${sessionId}.jsonl`);
    this.metricsPath = join(dir, `metrics-${sessionId}.json`);
    this.ready = mkdir(dir, { recursive: true }).then(() => {});
  }

  /** Log a Director decision with optional metrics and prompt */
  async log(
    tick: number,
    decision: DirectorDecision,
    metrics?: DirectorMetrics | null,
    prompt?: string
  ) {
    await this.ready;

    // Track aggregated metrics
    this.totalDecisions++;
    this.strategyCounts[decision.strategy] =
      (this.strategyCounts[decision.strategy] || 0) + 1;

    if (metrics) {
      this.latencies.push(metrics.latencyMs);
      this.totalTokens += metrics.tokensUsed;
      this.parseMethodCounts[metrics.parseMethod] =
        (this.parseMethodCounts[metrics.parseMethod] || 0) + 1;
      if (metrics.fallbackReason) {
        this.fallbackCount++;
        this.fallbackReasons.push(metrics.fallbackReason);
      }
    }

    // Write decision entry
    const decisionEntry = JSON.stringify({
      tick,
      ...decision,
      ...(metrics ? {
        latencyMs: metrics.latencyMs,
        tokensUsed: metrics.tokensUsed,
        parseMethod: metrics.parseMethod,
        fallbackReason: metrics.fallbackReason,
      } : {}),
      loggedAt: new Date().toISOString(),
    });
    await this.writeAppend(this.decisionsPath, decisionEntry + "\n");

    // Write prompt entry (separate file to avoid bloating decisions log)
    if (prompt) {
      const promptEntry = JSON.stringify({
        tick,
        prompt,
        loggedAt: new Date().toISOString(),
      });
      await this.writeAppend(this.promptsPath, promptEntry + "\n");
    }
  }

  /** Write aggregated metrics to a JSON file (call on session end) */
  async writeSessionMetrics() {
    await this.ready;

    const avgLatency = this.latencies.length > 0
      ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
      : 0;
    const maxLatency = this.latencies.length > 0
      ? Math.max(...this.latencies)
      : 0;

    const metrics: AggregatedMetrics = {
      totalDecisions: this.totalDecisions,
      avgLatencyMs: Math.round(avgLatency),
      maxLatencyMs: maxLatency,
      totalTokensUsed: this.totalTokens,
      parseMethodCounts: this.parseMethodCounts,
      fallbackCount: this.fallbackCount,
      fallbackReasons: [...new Set(this.fallbackReasons)], // deduplicate
      strategyCounts: this.strategyCounts,
      sessionDurationMs: Date.now() - this.sessionStart,
    };

    await writeFile(this.metricsPath, JSON.stringify(metrics, null, 2) + "\n").catch((err) => {
      console.warn(`[Logger] Metrics write failed: ${err.message}`);
    });

    console.log(`[Logger] Session metrics:`);
    console.log(`  Decisions: ${metrics.totalDecisions} | Avg latency: ${metrics.avgLatencyMs}ms | Max: ${metrics.maxLatencyMs}ms`);
    console.log(`  Tokens: ${metrics.totalTokensUsed} | Fallbacks: ${metrics.fallbackCount}`);
    console.log(`  Parse methods: ${JSON.stringify(metrics.parseMethodCounts)}`);
    console.log(`  Strategies: ${JSON.stringify(metrics.strategyCounts)}`);
  }

  private async writeAppend(filePath: string, data: string) {
    await appendFile(filePath, data).catch((err) => {
      console.warn(`[Logger] Write failed: ${err.message}`);
    });
  }

  getFilePath(): string {
    return this.decisionsPath;
  }
}
