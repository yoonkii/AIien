/**
 * Main Game Loop — orchestrates all systems.
 *
 * TICK CYCLE (every ~100ms for prototype, 10 ticks/second):
 *   1. Process player input (simulated in Phase 1)
 *   2. Run BehaviorTree.tick() → move alien
 *   3. Check combat (alien attacks, player attacks)
 *   4. Check win/loss conditions
 *   5. Broadcast to spectators (every tick)
 *
 * DIRECTOR CYCLE (every ~3-5 seconds):
 *   1. Encode game state
 *   2. Request Director decision from Gemini
 *   3. Apply strategy + environment actions
 *   4. Log decision for Director's Cut
 */

import type { GameState, PlayerState } from "./GameState";
import { behaviorTreeTick, applyDirectorStrategy } from "../ai/BehaviorTree";
import { DirectorClient } from "../ai/DirectorClient";
import { applyEnvironmentActions } from "../environment/EnvironmentSystem";
import { DecisionLogger } from "../logging/DecisionLogger";
import { SpectatorServer } from "../spectator/SpectatorServer";

const TICK_INTERVAL_MS = 100; // 10 ticks per second
const DIRECTOR_INTERVAL_TICKS = 30; // Every 3 seconds (30 ticks × 100ms)
const GAME_TIMEOUT_TICKS = 12000; // 20 minutes (12000 ticks × 100ms)

export class GameLoop {
  private state: GameState;
  private director: DirectorClient;
  private logger: DecisionLogger;
  private spectator: SpectatorServer;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    state: GameState,
    director: DirectorClient,
    logger: DecisionLogger,
    spectator: SpectatorServer
  ) {
    this.state = state;
    this.director = director;
    this.logger = logger;
    this.spectator = spectator;
  }

  start() {
    this.running = true;
    console.log("[Game] Starting game loop");
    this.tickTimer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
  }

  stop() {
    this.running = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private async tick() {
    if (!this.running || this.state.gameOver) return;

    this.state.tick++;

    // ── 1. Simulate player movement (Phase 1: random wandering) ──
    this.simulatePlayerMovement();

    // ── 2. Director decision (every 3s) ──
    if (this.state.tick % DIRECTOR_INTERVAL_TICKS === 0) {
      this.requestDirectorDecision(); // fire-and-forget, non-blocking
    }

    // ── 3. Behavior tree tick → move alien ──
    const btResult = behaviorTreeTick(this.state);
    this.state.alien.x = btResult.newX;
    this.state.alien.y = btResult.newY;

    // ── 4. Combat ──
    if (btResult.attacked && btResult.attackTarget) {
      const target = this.state.players.find((p) => p.nickname === btResult.attackTarget);
      if (target && target.state !== "dead") {
        target.hp -= btResult.attackDamage;
        console.log(
          `[Combat] Alien attacks ${target.nickname} for ${btResult.attackDamage} damage! (HP: ${target.hp})`
        );
        if (target.hp <= 0) {
          target.hp = 0;
          target.state = "dead";
          console.log(`[Combat] ${target.nickname} has been eliminated!`);
        }
      }
    }

    // ── 5. Win/loss conditions ──
    this.checkGameEnd();

    // ── 6. Broadcast to spectators ──
    this.spectator.broadcast(this.state);

    // ── 7. Console output (every 10 ticks = 1 second) ──
    if (this.state.tick % 10 === 0) {
      this.printStatus();
    }
  }

  private async requestDirectorDecision() {
    const decision = await this.director.requestDecision(this.state);
    if (!decision) return;

    // Apply strategy to behavior tree
    applyDirectorStrategy(this.state, decision.strategy, decision.targetPlayer);

    // Apply environment actions
    applyEnvironmentActions(this.state, decision);

    // Store for spectator display
    this.state.lastDirectorDecision = decision;

    // Log for Director's Cut with metrics and prompt telemetry
    const metrics = this.director.getLastMetrics();
    const prompt = this.director.getLastPrompt(this.state);
    this.logger.log(this.state.tick, decision, metrics, prompt);

    const metricsTag = metrics
      ? ` [${metrics.parseMethod}, ${metrics.latencyMs}ms]`
      : "";
    console.log(
      `[Director] Strategy: ${decision.strategy}${decision.targetPlayer ? ` → ${decision.targetPlayer}` : ""} | ` +
        `Env: ${decision.environmentActions.length} actions${metricsTag} | ` +
        `"${decision.innerMonologue.slice(0, 60)}${decision.innerMonologue.length > 60 ? "..." : ""}"`
    );
  }

  /**
   * Phase 1: simulate player movement (random wandering).
   * Phase 2+: replaced with real player input via multiplayer.
   */
  private simulatePlayerMovement() {
    for (const player of this.state.players) {
      if (player.state === "dead") continue;

      // Move randomly every 5 ticks (0.5 seconds)
      if (this.state.tick % 5 !== 0) continue;

      const dirs: [number, number][] = [
        [0, 0], [0, 0], [0, 0], // 60% chance: stay put
        [1, 0], [-1, 0], [0, 1], [0, -1], // 40% chance: move
      ];
      const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
      const nx = player.x + dx;
      const ny = player.y + dy;

      // Check walkability
      if (
        nx >= 0 && nx < this.state.map.width &&
        ny >= 0 && ny < this.state.map.height
      ) {
        const tile = this.state.map.tiles[ny][nx];
        if (tile === 1 || tile === 3) {
          // Check door isn't locked
          if (tile === 3) {
            const doorState = this.state.environment.doors.get(`${nx},${ny}`);
            if (doorState === "locked") continue;
          }
          player.x = nx;
          player.y = ny;
          player.state = "moving";
          player.direction = [dx, dy];
        }
      }
    }
  }

  private checkGameEnd() {
    // All players dead → alien wins
    const alivePlayers = this.state.players.filter((p) => p.state !== "dead");
    if (alivePlayers.length === 0 && this.state.players.length > 0) {
      this.state.gameOver = true;
      this.state.gameResult = "alien_wins";
      console.log("\n[GAME OVER] ALIEN WINS — All crew eliminated.");
      this.stop();
      return;
    }

    // Timeout → forced confrontation (simplified: alien wins)
    if (this.state.tick >= GAME_TIMEOUT_TICKS) {
      this.state.gameOver = true;
      this.state.gameResult = "timeout";
      console.log("\n[GAME OVER] TIMEOUT — Life support failed.");
      this.stop();
      return;
    }

    // Alien dead → players win
    if (this.state.alien.hp <= 0) {
      this.state.gameOver = true;
      this.state.gameResult = "players_win";
      console.log("\n[GAME OVER] PLAYERS WIN — Alien eliminated!");
      this.stop();
      return;
    }
  }

  private printStatus() {
    const elapsed = ((this.state.tick * TICK_INTERVAL_MS) / 1000).toFixed(0);
    const alive = this.state.players.filter((p) => p.state !== "dead").length;
    const strategy = this.state.alien.strategy;
    const alienHp = this.state.alien.hp;
    process.stdout.write(
      `\r[T+${elapsed}s] Alien: ${strategy} HP:${alienHp} | Players: ${alive} alive | Tick: ${this.state.tick}    `
    );
  }
}
