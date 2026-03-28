/**
 * Director Client — Layer 2 of the Hybrid Brain.
 * Calls Gemini every 3-5 seconds for strategic decisions.
 *
 * Phase 1: in-process (direct Gemini SDK call).
 * Phase 3: extracted to HTTP sidecar for Godot.
 *
 * PATTERNS (inspired by budok-ai):
 * 1. Multi-Strategy Response Parsing — 4-tier fallback chain
 * 2. Tactical Context Enrichment — pre-computed situation summaries
 * 3. Repetition Detection — tracks and penalizes repeated tactics
 * 4. Action Catalog — metadata-enriched prompt for informed decisions
 * 5. Heuristic Fallback — state-aware fallback when Gemini fails
 */

import { GoogleGenerativeAI, type FunctionCall } from "@google/generative-ai";
import type { GameState, DirectorDecision, Strategy } from "../game/GameState";
import { getRoomAt } from "../game/TileMap";
import { directorTools } from "../spike/director-tools";
import { formatActionCatalogForPrompt } from "./ActionCatalog";
import { computeFallbackDecision } from "./DirectorFallback";

// ── Repetition Tracker ──────────────────────────────────────────

interface DecisionRecord {
  tick: number;
  strategy: Strategy;
  environmentActions: string[]; // stringified action types
  vocalize: string;
}

class RepetitionTracker {
  private history: DecisionRecord[] = [];
  private readonly maxHistory = 20;

  record(tick: number, decision: DirectorDecision) {
    this.history.push({
      tick,
      strategy: decision.strategy,
      environmentActions: decision.environmentActions.map(
        (a) => `${a.actionType}:${a.room}:${a.value}`
      ),
      vocalize: decision.vocalize,
    });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /** Get the last N decisions */
  getRecent(n: number): DecisionRecord[] {
    return this.history.slice(-n);
  }

  /** Count consecutive uses of a strategy */
  getConsecutiveStrategyCount(): { strategy: Strategy; count: number } | null {
    if (this.history.length === 0) return null;
    const last = this.history[this.history.length - 1]!;
    let count = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i]!.strategy === last.strategy) count++;
      else break;
    }
    return { strategy: last.strategy, count };
  }

  /** Find environment actions used frequently in recent history */
  getOverusedActions(recentN: number = 10): string[] {
    const recent = this.getRecent(recentN);
    const counts = new Map<string, number>();
    for (const r of recent) {
      for (const a of r.environmentActions) {
        counts.set(a, (counts.get(a) || 0) + 1);
      }
    }
    // Actions used in 4+ of last 10 decisions are "overused"
    return Array.from(counts.entries())
      .filter(([_, count]) => count >= 4)
      .map(([action]) => action);
  }

  /** Generate a prompt section warning about repetition */
  generateRepetitionWarning(): string | null {
    const warnings: string[] = [];

    const consecutive = this.getConsecutiveStrategyCount();
    if (consecutive && consecutive.count >= 4) {
      warnings.push(
        `WARNING: You have used "${consecutive.strategy}" for ${consecutive.count} consecutive decisions. ` +
          `Vary your approach — repetitive tactics become predictable and less frightening.`
      );
    }

    const overused = this.getOverusedActions();
    if (overused.length > 0) {
      warnings.push(
        `WARNING: These actions are overused recently: ${overused.join(", ")}. ` +
          `Fear fatigue — the same scare loses impact. Try different tactics.`
      );
    }

    return warnings.length > 0 ? warnings.join("\n") : null;
  }
}

// ── Tactical Context Builder ────────────────────────────────────

function buildTacticalContext(state: GameState): string {
  const lines: string[] = ["TACTICAL ANALYSIS:"];
  const alien = state.alien;
  const alivePlayers = state.players.filter((p) => p.state !== "dead");

  if (alivePlayers.length === 0) {
    lines.push("  All players eliminated. Victory.");
    return lines.join("\n");
  }

  // HP assessment
  const hpRatio = alien.hp / alien.maxHp;
  if (hpRatio < 0.2) {
    lines.push("  CRITICAL: Your HP is dangerously low. Retreat and heal is strongly recommended.");
  } else if (hpRatio < 0.4) {
    lines.push("  CAUTION: HP is below 40%. Avoid direct confrontation unless certain of a kill.");
  } else if (hpRatio > 0.8) {
    lines.push("  You are at high HP. Aggressive tactics are viable.");
  }

  // Player proximity analysis
  const playerDistances: { nickname: string; dist: number; room: string; isolated: boolean }[] = [];
  for (const p of alivePlayers) {
    const dist = Math.abs(p.x - alien.x) + Math.abs(p.y - alien.y);
    const room = getRoomAt(state.map, p.x, p.y);

    // Check isolation — is any other alive player within 8 tiles?
    let isolated = true;
    for (const other of alivePlayers) {
      if (other === p) continue;
      const otherDist = Math.abs(p.x - other.x) + Math.abs(p.y - other.y);
      if (otherDist < 8) {
        isolated = false;
        break;
      }
    }

    playerDistances.push({
      nickname: p.nickname,
      dist,
      room: room?.name ?? "unknown",
      isolated,
    });
  }

  // Sort by distance
  playerDistances.sort((a, b) => a.dist - b.dist);

  for (const pd of playerDistances) {
    const distLabel =
      pd.dist <= 2 ? "ADJACENT" :
      pd.dist <= 5 ? "CLOSE" :
      pd.dist <= 10 ? "MEDIUM" :
      pd.dist <= 20 ? "FAR" : "VERY FAR";

    const hpInfo = alivePlayers.find((p) => p.nickname === pd.nickname)!;
    const playerHpRatio = hpInfo.hp / hpInfo.maxHp;
    const hpLabel = playerHpRatio < 0.3 ? "WOUNDED" : playerHpRatio < 0.6 ? "HURT" : "HEALTHY";

    let line = `  ${pd.nickname}: ${distLabel} (${pd.dist} tiles) in ${pd.room}, ${hpLabel} (${hpInfo.hp}HP)`;
    if (pd.isolated) line += " — ISOLATED (no allies nearby)";
    lines.push(line);
  }

  // Suggest high-value target
  const weakest = [...alivePlayers].sort((a, b) => a.hp - b.hp)[0]!;
  const nearest = playerDistances[0]!;
  const isolatedPlayers = playerDistances.filter((pd) => pd.isolated);

  lines.push("");
  lines.push("  SUGGESTED TARGETS:");
  if (isolatedPlayers.length > 0) {
    lines.push(`    Isolated: ${isolatedPlayers.map((p) => p.nickname).join(", ")} — easiest to pick off`);
  }
  if (weakest.hp < weakest.maxHp * 0.5) {
    lines.push(`    Weakest: ${weakest.nickname} (${weakest.hp}HP) — easy kill`);
  }
  lines.push(`    Nearest: ${nearest.nickname} (${nearest.dist} tiles) — quickest to reach`);

  // Environment status summary
  const darkRooms = state.map.rooms.filter((r) => !state.environment.lights.get(r.id));
  const lockedDoors = Array.from(state.environment.doors.entries()).filter(([_, v]) => v === "locked");
  lines.push("");
  lines.push(`  ENVIRONMENT: ${darkRooms.length} dark rooms, ${lockedDoors.length} locked doors, power ${state.environment.power ? "ON" : "OFF"}`);

  // Game phase
  const elapsedSeconds = (state.tick * 100) / 1000;
  if (elapsedSeconds < 60) {
    lines.push("  PHASE: Early game — build tension, establish presence, avoid revealing yourself too soon.");
  } else if (elapsedSeconds < 300) {
    lines.push("  PHASE: Mid game — isolate and pressure. Mix stalking with occasional strikes.");
  } else {
    lines.push("  PHASE: Late game — be aggressive. Time is running out. Force confrontations.");
  }

  return lines.join("\n");
}

// ── Response Parser (Multi-Strategy) ────────────────────────────

const VALID_STRATEGIES: Strategy[] = ["hunt", "stalk", "ambush", "patrol", "retreat", "terrorize"];

function isValidStrategy(s: string): s is Strategy {
  return VALID_STRATEGIES.includes(s as Strategy);
}

/**
 * Tier 1: Parse from function call response (primary path)
 */
function parseFromFunctionCall(candidate: any): DirectorDecision | null {
  for (const part of candidate.content.parts) {
    if (part.functionCall?.name === "director_decision") {
      const args = part.functionCall.args as Record<string, any>;
      const strategy = args.strategy;
      if (!strategy || !isValidStrategy(strategy)) return null;

      return {
        strategy,
        targetPlayer: args.target_player ?? null,
        environmentActions: Array.isArray(args.environment_actions)
          ? args.environment_actions.map((ea: any) => ({
              actionType: ea.action_type,
              room: ea.room,
              value: ea.value,
            }))
          : [],
        vocalize: args.vocalize ?? "none",
        innerMonologue: args.inner_monologue ?? "",
        reasoning: args.reasoning ?? "",
        timestamp: Date.now(),
      };
    }
  }
  return null;
}

/**
 * Tier 2: Extract JSON from text response (fallback for when Gemini
 * returns text instead of a function call)
 */
function parseFromTextJSON(candidate: any): DirectorDecision | null {
  for (const part of candidate.content.parts) {
    if (part.text) {
      // Try to find JSON in the text
      const jsonMatch = part.text.match(/\{[\s\S]*"strategy"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          const strategy = parsed.strategy;
          if (!strategy || !isValidStrategy(strategy)) return null;

          return {
            strategy,
            targetPlayer: parsed.target_player ?? parsed.targetPlayer ?? null,
            environmentActions: Array.isArray(parsed.environment_actions ?? parsed.environmentActions)
              ? (parsed.environment_actions ?? parsed.environmentActions).map((ea: any) => ({
                  actionType: ea.action_type ?? ea.actionType,
                  room: ea.room,
                  value: ea.value,
                }))
              : [],
            vocalize: parsed.vocalize ?? "none",
            innerMonologue: parsed.inner_monologue ?? parsed.innerMonologue ?? "",
            reasoning: parsed.reasoning ?? "",
            timestamp: Date.now(),
          };
        } catch {
          // JSON parse failed — continue to next tier
        }
      }
    }
  }
  return null;
}

/**
 * Tier 3: Extract strategy keyword from text (minimal fallback)
 */
function parseStrategyFromText(candidate: any): DirectorDecision | null {
  for (const part of candidate.content.parts) {
    if (part.text) {
      const text = part.text.toLowerCase();
      for (const strategy of VALID_STRATEGIES) {
        if (text.includes(strategy)) {
          return {
            strategy,
            targetPlayer: null,
            environmentActions: [],
            vocalize: "none",
            innerMonologue: "[Parsed from text — strategy keyword only]",
            reasoning: `Extracted strategy "${strategy}" from unstructured text response`,
            timestamp: Date.now(),
          };
        }
      }
    }
  }
  return null;
}

// ── Director System Prompt ──────────────────────────────────────

const DIRECTOR_SYSTEM_PROMPT = `You are the AI Director of a horror game called AIien. You control an alien creature hunting human players on a spaceship.

YOUR ROLE: Make strategic decisions every 3-5 seconds. You do NOT control the alien's moment-to-moment movement — a behavior tree handles that. You decide the HIGH-LEVEL STRATEGY and ENVIRONMENTAL MANIPULATION.

You MUST call director_decision exactly once. It bundles your strategy, environment actions, vocalization, and inner monologue.

YOUR PERSONALITY: You are a patient, intelligent predator. You think about player psychology. You use the environment as a weapon. You prefer ambushes over direct confrontation.

DECISION PRINCIPLES:
1. Exploit player knowledge base — if a player fears darkness, cut the lights
2. Isolate before attacking — separate the group, pick off the weakest
3. Use the vent system — you can bypass locked doors
4. Build tension — sometimes doing NOTHING is the scariest thing
5. The ship is your body — lights, doors, and power are your weapons
6. Low HP → retreat to vents. Don't die.
7. Endgame urgency → if players are near the objective, act NOW.
8. VARIETY IS KEY — avoid repeating the same strategy or action too many times. Fear fatigue is real.
9. Escalate tension — early game: observe. mid game: isolate and stalk. late game: hunt aggressively.`;

const TIMEOUT_MS = 5000;

// ── Director Client ─────────────────────────────────────────────

export interface DirectorMetrics {
  latencyMs: number;
  tokensUsed: number;
  parseMethod: "function_call" | "json_extract" | "keyword_extract" | "heuristic_fallback" | "last_decision";
  fallbackReason: string | null;
}

export class DirectorClient {
  private model;
  private lastDecision: DirectorDecision | null = null;
  private pendingRequest = false;
  private repetitionTracker = new RepetitionTracker();
  private lastMetrics: DirectorMetrics | null = null;
  private currentTick = 0;

  constructor(apiKey: string) {
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: DIRECTOR_SYSTEM_PROMPT,
      tools: [{ functionDeclarations: directorTools }],
      toolConfig: { functionCallingConfig: { mode: "ANY" as any } },
    });
  }

  /** Encode game state as a text prompt for Gemini */
  private encodeGameState(state: GameState): string {
    const lines: string[] = [`=== GAME STATE (tick ${state.tick}) ===`, ""];

    // Alien
    const alienRoom = getRoomAt(state.map, state.alien.x, state.alien.y);
    lines.push(`YOUR STATUS:`);
    lines.push(`  Room: ${alienRoom?.name ?? "unknown"} at (${state.alien.x},${state.alien.y})`);
    lines.push(`  HP: ${state.alien.hp}/${state.alien.maxHp}`);
    lines.push(`  Current strategy: ${state.alien.strategy}`);
    lines.push(`  Personality: ${state.alien.card.personality}`);
    lines.push(`  Voice style: ${state.alien.card.voiceStyle}`);
    lines.push(`  Abilities: ${state.alien.card.abilities.map((a) => `${a.name} (${a.damage}dmg, range:${a.range})`).join(", ")}`);
    lines.push("");

    // Players
    lines.push(`PLAYERS:`);
    for (const p of state.players) {
      if (p.state === "dead") {
        lines.push(`  ${p.nickname}: DEAD`);
        continue;
      }
      const pRoom = getRoomAt(state.map, p.x, p.y);
      lines.push(`  ${p.nickname}: ${pRoom?.name ?? "unknown"} at (${p.x},${p.y}), HP ${p.hp}/${p.maxHp}, ${p.weapon} (${p.ammo} ammo), ${p.state}`);
    }
    lines.push("");

    // Rooms + environment
    lines.push(`SHIP MAP (use room IDs for environment actions, e.g. "engine_bay" not "Engine Bay"):`);
    for (const room of state.map.rooms) {
      const lit = state.environment.lights.get(room.id) ? "lit" : "DARK";
      const exits = room.exits
        .map((e) => {
          const doorKey = `${e.pos[0]},${e.pos[1]}`;
          const doorState = state.environment.doors.get(doorKey);
          const suffix = e.type === "door" && doorState ? ` [${doorState}]` : "";
          return `${e.direction}→${e.toRoomId} (${e.type}${suffix})`;
        })
        .join(", ");
      lines.push(`  ${room.name} [${lit}]: exits=[${exits}]`);
    }
    lines.push("");
    lines.push(`  Power: ${state.environment.power ? "ON" : "OFF"}`);

    return lines.join("\n");
  }

  /**
   * Build the full prompt with tactical context, action catalog,
   * and repetition warnings.
   */
  private buildEnrichedPrompt(state: GameState): string {
    const sections: string[] = [];

    // Core game state
    sections.push(this.encodeGameState(state));

    // Tactical analysis (pre-computed summaries)
    sections.push("");
    sections.push(buildTacticalContext(state));

    // Action catalog reference
    sections.push("");
    sections.push(formatActionCatalogForPrompt());

    // Repetition warnings
    const repetitionWarning = this.repetitionTracker.generateRepetitionWarning();
    if (repetitionWarning) {
      sections.push("");
      sections.push(repetitionWarning);
    }

    // Recent decision history for context
    const recent = this.repetitionTracker.getRecent(5);
    if (recent.length > 0) {
      sections.push("");
      sections.push("RECENT DECISIONS (last 5):");
      for (const r of recent) {
        const envStr = r.environmentActions.length > 0
          ? ` | env: ${r.environmentActions.join(", ")}`
          : "";
        sections.push(`  tick ${r.tick}: ${r.strategy}${envStr}`);
      }
    }

    sections.push("");
    sections.push("Analyze this game state and make your Director decision.");

    return sections.join("\n");
  }

  /**
   * Request a Director decision with multi-strategy parsing.
   * Non-blocking — returns a heuristic fallback if the API fails.
   */
  async requestDecision(state: GameState): Promise<DirectorDecision | null> {
    if (this.pendingRequest) return this.lastDecision;

    this.pendingRequest = true;
    this.currentTick = state.tick;
    const prompt = this.buildEnrichedPrompt(state);
    const startTime = Date.now();

    try {
      const response = await Promise.race([
        this.model.generateContent(prompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Director timeout")), TIMEOUT_MS)
        ),
      ]);

      const latencyMs = Date.now() - startTime;
      const candidate = response.response.candidates?.[0];
      if (!candidate) {
        return this.fallback(state, latencyMs, "No candidates in response");
      }

      // Tier 1: Function call parsing (primary)
      let decision = parseFromFunctionCall(candidate);
      if (decision) {
        this.recordSuccess(decision, latencyMs, "function_call", response);
        return decision;
      }

      // Tier 2: JSON extraction from text
      decision = parseFromTextJSON(candidate);
      if (decision) {
        console.warn("[Director] Tier 2: Parsed from JSON in text response");
        this.recordSuccess(decision, latencyMs, "json_extract", response);
        return decision;
      }

      // Tier 3: Strategy keyword extraction
      decision = parseStrategyFromText(candidate);
      if (decision) {
        console.warn("[Director] Tier 3: Extracted strategy keyword from text");
        this.recordSuccess(decision, latencyMs, "keyword_extract", response);
        return decision;
      }

      // All parsing failed — use heuristic fallback
      return this.fallback(state, latencyMs, "All parsing tiers failed");
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("timeout")) {
        console.error(`[Director] Error: ${msg}`);
      }
      return this.fallback(state, latencyMs, msg);
    } finally {
      this.pendingRequest = false;
    }
  }

  private recordSuccess(
    decision: DirectorDecision,
    latencyMs: number,
    parseMethod: DirectorMetrics["parseMethod"],
    response: any
  ) {
    this.lastDecision = decision;
    this.repetitionTracker.record(this.currentTick, decision);

    // Extract token usage if available
    const usage = response.response?.usageMetadata;
    const tokensUsed = usage
      ? (usage.promptTokenCount ?? 0) + (usage.candidatesTokenCount ?? 0)
      : 0;

    this.lastMetrics = {
      latencyMs,
      tokensUsed,
      parseMethod,
      fallbackReason: null,
    };
  }

  private fallback(
    state: GameState,
    latencyMs: number,
    reason: string
  ): DirectorDecision {
    // Tier 4: Heuristic fallback — state-aware strategy selection
    console.warn(`[Director] Tier 4: Heuristic fallback (${reason})`);
    const decision = computeFallbackDecision(state, this.lastDecision);
    this.lastDecision = decision;
    this.repetitionTracker.record(this.currentTick, decision);

    this.lastMetrics = {
      latencyMs,
      tokensUsed: 0,
      parseMethod: "heuristic_fallback",
      fallbackReason: reason,
    };

    return decision;
  }

  /** Get the most recent decision (for fallback) */
  getLastDecision(): DirectorDecision | null {
    return this.lastDecision;
  }

  /** Get metrics from the most recent request */
  getLastMetrics(): DirectorMetrics | null {
    return this.lastMetrics;
  }

  /** Get the last enriched prompt (for telemetry logging) */
  getLastPrompt(state: GameState): string {
    return this.buildEnrichedPrompt(state);
  }
}
