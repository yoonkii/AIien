/**
 * Director Client — Layer 2 of the Hybrid Brain.
 * Calls Gemini every 3-5 seconds for strategic decisions.
 *
 * Phase 1: in-process (direct Gemini SDK call).
 * Phase 3: extracted to HTTP sidecar for Godot.
 *
 * FALLBACK: If Gemini times out (>5s) or fails, the behavior tree
 * continues with the last-received strategy. The alien never freezes.
 */

import { GoogleGenerativeAI, type FunctionCall } from "@google/generative-ai";
import type { GameState, DirectorDecision, Strategy } from "../game/GameState";
import { getRoomAt } from "../game/TileMap";
import { directorTools } from "../spike/director-tools";

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
7. Endgame urgency → if players are near the objective, act NOW.`;

const TIMEOUT_MS = 5000;

export class DirectorClient {
  private model;
  private lastDecision: DirectorDecision | null = null;
  private pendingRequest = false;

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
    lines.push(`  Abilities: ${state.alien.card.abilities.map((a) => a.name).join(", ")}`);
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
   * Request a Director decision. Non-blocking — returns the last decision
   * if a request is already in flight or if the API fails.
   */
  async requestDecision(state: GameState): Promise<DirectorDecision | null> {
    if (this.pendingRequest) return this.lastDecision;

    this.pendingRequest = true;
    const gameStateText = this.encodeGameState(state);
    const prompt = `Analyze this game state and make your Director decision.\n\n${gameStateText}`;

    try {
      const response = await Promise.race([
        this.model.generateContent(prompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Director timeout")), TIMEOUT_MS)
        ),
      ]);

      const candidate = response.response.candidates?.[0];
      if (!candidate) return this.lastDecision;

      // Parse the director_decision function call
      for (const part of candidate.content.parts) {
        if (part.functionCall?.name === "director_decision") {
          const args = part.functionCall.args as Record<string, any>;

          const decision: DirectorDecision = {
            strategy: (args.strategy as Strategy) ?? "patrol",
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

          this.lastDecision = decision;
          return decision;
        }
      }

      // No function call found — return last decision
      return this.lastDecision;
    } catch (err) {
      // Timeout or API error — fallback to last decision
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("timeout")) {
        console.error(`[Director] Error: ${msg}`);
      }
      return this.lastDecision;
    } finally {
      this.pendingRequest = false;
    }
  }

  /** Get the most recent decision (for fallback) */
  getLastDecision(): DirectorDecision | null {
    return this.lastDecision;
  }
}
