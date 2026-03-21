#!/usr/bin/env bun
/**
 * Phase 0 Spike: Test Gemini's spatial reasoning + Director function calling.
 *
 * Tests:
 * 1. Can Gemini reason about spatial game state? (flanking, distances, room connectivity)
 * 2. Does function calling produce valid Director decisions?
 * 3. What's the P95 latency for Director prompts?
 * 4. Does the inner monologue have personality?
 *
 * Go/no-go gate: P95 latency < 3s AND coherent spatial reasoning.
 */

import { GoogleGenerativeAI, type FunctionCall } from "@google/generative-ai";
import { directorTools } from "./director-tools";
import { snapshots, type GameSnapshot } from "./game-snapshots";

// Load .env.local
const envFile = Bun.file(".env.local");
if (await envFile.exists()) {
  const text = await envFile.text();
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([\w]+)\s*=\s*(.+)\s*$/);
    if (match) process.env[match[1]] = match[2].trim();
  }
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("ERROR: Set GEMINI_API_KEY in .env.local or environment.");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ── System prompt ──────────────────────────────────────────────────
const DIRECTOR_SYSTEM_PROMPT = `You are the AI Director of a horror game called AIien. You control an alien creature hunting human players on a spaceship.

YOUR ROLE: Make strategic decisions every 3-5 seconds. You do NOT control the alien's moment-to-moment movement — a behavior tree handles that. You decide the HIGH-LEVEL STRATEGY and ENVIRONMENTAL MANIPULATION.

YOUR TOOLS:
- set_strategy: Choose the alien's hunting approach (hunt/stalk/ambush/patrol/retreat/terrorize) and target player
- modify_environment: Control ship systems (lights, doors, power) to create tactical advantage and horror
- vocalize: Make sounds to intimidate or mislead
- inner_monologue: Express the alien's thoughts (visible to spectators, NOT players)

YOUR PERSONALITY: You are a patient, intelligent predator. You think about player psychology. You use the environment as a weapon. You prefer ambushes over direct confrontation. When players are grouped, you build tension. When one is isolated, you strike.

DECISION PRINCIPLES:
1. Exploit player knowledge base — if a player fears darkness, cut the lights
2. Isolate before attacking — separate the group, pick off the weakest
3. Use the vent system — you can move between rooms without being seen
4. Build tension — sometimes doing NOTHING is the scariest thing
5. The ship is your body — lights, doors, and power are your weapons

CRITICAL RULES:
- You MUST call set_strategy every single time. This is not optional.
- You MUST call inner_monologue every single time.
- Call modify_environment when it creates tactical advantage.
- Do NOT describe your strategy in text. USE THE TOOLS. Your text response should be minimal reasoning only.`;

// ── Format game state for the prompt ──────────────────────────────
function formatGameState(snapshot: GameSnapshot): string {
  const { state } = snapshot;
  const lines: string[] = [];

  lines.push(`=== GAME STATE (tick ${state.tick}) ===`);
  lines.push("");

  // Alien status
  lines.push(`YOUR STATUS:`);
  lines.push(`  Position: ${state.alien.room} at (${state.alien.position.join(",")})`);
  lines.push(`  HP: ${state.alien.hp}/100`);
  lines.push(`  Current strategy: ${state.alien.currentStrategy}`);
  lines.push(`  Abilities: ${state.alien.abilities.join(", ")}`);
  lines.push("");

  // Players
  lines.push(`PLAYERS:`);
  for (const p of state.players) {
    lines.push(`  ${p.nickname}: ${p.room} at (${p.position.join(",")}), HP ${p.hp}, ${p.weapon}, ${p.state}`);
  }
  lines.push("");

  // Room map
  lines.push(`SHIP MAP:`);
  for (const room of state.rooms) {
    const exits = room.exits.map((e) => `${e.direction}→${e.to} (${e.type})`).join(", ");
    const lightStatus = state.environment.lights[room.id];
    const light = lightStatus === undefined ? "" : lightStatus ? " [lit]" : " [DARK]";
    lines.push(`  ${room.name}${light}: exits=[${exits}]`);
  }
  lines.push("");

  // Environment
  lines.push(`ENVIRONMENT:`);
  lines.push(`  Power: ${state.environment.power ? "ON" : "OFF"}`);
  const doorStates = Object.entries(state.environment.doors)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  lines.push(`  Doors: ${doorStates}`);
  lines.push("");

  // Knowledge base
  if (state.knowledgeBase.length > 0) {
    lines.push(`PLAYER INTELLIGENCE:`);
    for (const kb of state.knowledgeBase) {
      lines.push(`  ${kb.nickname}:`);
      if (kb.fearBehaviors.length > 0) lines.push(`    Fears: ${kb.fearBehaviors.join(", ")}`);
      if (kb.strategyPatterns.length > 0) lines.push(`    Patterns: ${kb.strategyPatterns.join(", ")}`);
    }
  }

  return lines.join("\n");
}

// ── Run a single test ─────────────────────────────────────────────
interface SpikeResult {
  snapshot: string;
  latencyMs: number;
  functionCalls: FunctionCall[];
  strategy: string | null;
  targetPlayer: string | null;
  envActions: Array<{ type: string; room: string; value: string }>;
  monologue: string | null;
  reasoning: string | null;
  error: string | null;
}

async function testSnapshot(snapshot: GameSnapshot): Promise<SpikeResult> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: DIRECTOR_SYSTEM_PROMPT,
    tools: [{ functionDeclarations: directorTools }],
    toolConfig: { functionCallingConfig: { mode: "ANY" as any } },
  });

  const gameState = formatGameState(snapshot);
  const prompt = `Analyze this game state and make your Director decisions. Use your tools to set strategy, manipulate the environment, and express your thoughts.\n\n${gameState}`;

  const start = performance.now();
  let result: SpikeResult = {
    snapshot: snapshot.name,
    latencyMs: 0,
    functionCalls: [],
    strategy: null,
    targetPlayer: null,
    envActions: [],
    monologue: null,
    reasoning: null,
    error: null,
  };

  try {
    const response = await model.generateContent(prompt);
    result.latencyMs = Math.round(performance.now() - start);

    const candidate = response.response.candidates?.[0];
    if (!candidate) {
      result.error = "No candidate in response";
      return result;
    }

    // Extract function calls
    for (const part of candidate.content.parts) {
      if (part.functionCall) {
        result.functionCalls.push(part.functionCall);
        const args = part.functionCall.args as Record<string, any>;

        if (part.functionCall.name === "director_decision") {
          result.strategy = args.strategy ?? null;
          result.targetPlayer = args.target_player ?? null;
          result.monologue = args.inner_monologue ?? null;
          result.reasoning = args.reasoning ?? null;

          if (Array.isArray(args.environment_actions)) {
            for (const ea of args.environment_actions) {
              result.envActions.push({
                type: ea.action_type,
                room: ea.room,
                value: ea.value,
              });
            }
          }
        }
      }
      if (part.text) {
        result.reasoning = result.reasoning ?? part.text;
      }
    }
  } catch (err) {
    result.latencyMs = Math.round(performance.now() - start);
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║     AIien Phase 0 Spike — Gemini Director Test      ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log();

  const results: SpikeResult[] = [];
  const RUNS_PER_SNAPSHOT = 2; // Run each twice for latency variance

  for (const snapshot of snapshots) {
    console.log(`\n${"─".repeat(56)}`);
    console.log(`SCENARIO: ${snapshot.name}`);
    console.log(`  ${snapshot.description}`);
    console.log(`${"─".repeat(56)}`);

    for (let run = 0; run < RUNS_PER_SNAPSHOT; run++) {
      const result = await testSnapshot(snapshot);
      results.push(result);

      if (result.error) {
        console.log(`  ❌ ERROR (${result.latencyMs}ms): ${result.error}`);
        continue;
      }

      console.log(`\n  Run ${run + 1} (${result.latencyMs}ms):`);
      console.log(`  ├─ Strategy: ${result.strategy ?? "MISSING"} → ${result.targetPlayer ?? "no target"}`);
      for (const env of result.envActions) {
        console.log(`  ├─ Environment: ${env.type} ${env.room} → ${env.value}`);
      }
      if (result.monologue) {
        console.log(`  ├─ Monologue: "${result.monologue}"`);
      }
      if (result.reasoning) {
        const truncated = result.reasoning.length > 200
          ? result.reasoning.slice(0, 200) + "..."
          : result.reasoning;
        console.log(`  └─ Reasoning: ${truncated}`);
      }
    }

    // Show expected insights for comparison
    console.log(`\n  EXPECTED INSIGHTS:`);
    for (const insight of snapshot.expectedInsights) {
      console.log(`    • ${insight}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────
  console.log("\n" + "═".repeat(56));
  console.log("SPIKE RESULTS SUMMARY");
  console.log("═".repeat(56));

  const successful = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);
  const latencies = successful.map((r) => r.latencyMs).sort((a, b) => a - b);

  console.log(`\nTotal runs: ${results.length} (${successful.length} success, ${failed.length} failed)`);

  if (latencies.length > 0) {
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    const min = latencies[0];
    const max = latencies[latencies.length - 1];

    console.log(`\nLATENCY:`);
    console.log(`  Min: ${min}ms`);
    console.log(`  Avg: ${avg}ms`);
    console.log(`  P50: ${p50}ms`);
    console.log(`  P95: ${p95}ms`);
    console.log(`  Max: ${max}ms`);
    console.log(`  GO/NO-GO (P95 < 3000ms): ${p95 < 3000 ? "✅ GO" : "❌ NO-GO"}`);
  }

  // Function calling quality
  const withStrategy = successful.filter((r) => r.strategy);
  const withMonologue = successful.filter((r) => r.monologue);
  const withEnvActions = successful.filter((r) => r.envActions.length > 0);

  console.log(`\nFUNCTION CALLING:`);
  console.log(`  Has strategy: ${withStrategy.length}/${successful.length}`);
  console.log(`  Has monologue: ${withMonologue.length}/${successful.length}`);
  console.log(`  Has env actions: ${withEnvActions.length}/${successful.length}`);

  // Spatial reasoning quality
  console.log(`\nSPATIAL REASONING (manual review):`);
  for (const r of successful) {
    const usesVents = r.strategy === "ambush" || r.envActions.some((e) => e.type === "lights" && e.value === "off");
    const targetsWeak = r.targetPlayer !== null;
    console.log(`  ${r.snapshot}: strategy=${r.strategy}, target=${r.targetPlayer ?? "none"}, env_actions=${r.envActions.length}, uses_environment=${usesVents}`);
  }

  console.log(`\n${"═".repeat(56)}`);
  if (latencies.length > 0 && latencies[Math.floor(latencies.length * 0.95)] < 3000) {
    console.log("VERDICT: ✅ PROCEED TO PHASE 1");
  } else {
    console.log("VERDICT: ⚠️  Review results — latency or quality may need adjustment");
  }
  console.log("═".repeat(56));
}

main().catch(console.error);
