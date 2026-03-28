/**
 * Main Game Loop — 60 FPS fixed-timestep platformer orchestration.
 *
 * TICK CYCLE (every ~16.67ms, 60 ticks/second):
 *   1. Process player input
 *   2. Update player physics (PlayerController)
 *   3. Update alien physics (AlienController)
 *   4. Resolve combat (hitbox checks)
 *   5. Update camera
 *   6. Check win/loss
 *   7. Broadcast to spectators (throttled to 30fps)
 *
 * DIRECTOR CYCLE (every ~3 seconds):
 *   Fire-and-forget Gemini request, non-blocking.
 */

import type { GameState } from "./GameState";
import { updatePlayer } from "./PlayerController";
import { updateAlien, applyDirectorStrategy } from "../ai/AlienController";
import { resolveCombat } from "./Combat";
import { updateCamera, type Camera, createCamera } from "./Camera";
import { applyEnvironmentActions } from "../environment/EnvironmentSystem";
import { DirectorClient } from "../ai/DirectorClient";
import { DecisionLogger } from "../logging/DecisionLogger";
import { SpectatorServer } from "../spectator/SpectatorServer";
import { SimulatedInput } from "./InputSystem";
import { TILE_SIZE } from "./Physics";

const FPS = 60;
const TICK_INTERVAL_MS = 1000 / FPS; // ~16.67ms
const DT = 1 / FPS; // fixed timestep in seconds
const DIRECTOR_INTERVAL_TICKS = 180; // Every 3 seconds (180 ticks × 16.67ms)
const GAME_TIMEOUT_TICKS = 72000; // 20 minutes (72000 ticks at 60fps)
const BROADCAST_INTERVAL = 2; // broadcast every 2 ticks (30fps to clients)

export class GameLoop {
  private state: GameState;
  private director: DirectorClient;
  private logger: DecisionLogger;
  private spectator: SpectatorServer;
  private camera: Camera;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private simulatedInputs: SimulatedInput[] = [];

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
    this.camera = createCamera();

    // Create simulated input for each player (Phase 1)
    for (const _player of state.players) {
      this.simulatedInputs.push(new SimulatedInput());
    }
  }

  getCamera(): Camera {
    return this.camera;
  }

  start() {
    this.running = true;
    console.log(`[Game] Starting game loop at ${FPS} FPS`);
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

    // ── 1. Process player input ──────────────────────────────
    this.processInput();

    // ── 2. Update player physics ─────────────────────────────
    for (const player of this.state.players) {
      updatePlayer(player, DT, this.state.map, this.state.environment.doors);
    }

    // ── 3. Update alien physics ──────────────────────────────
    updateAlien(this.state, DT);

    // ── 4. Combat ────────────────────────────────────────────
    const combatEvents = resolveCombat(this.state);
    for (const event of combatEvents) {
      if (event.type === "player_hit") {
        console.log(
          `[Combat] ${event.attacker} hits ${event.target} for ${event.damage} damage!`
        );
        const player = this.state.players.find((p) => p.nickname === event.target);
        if (player && player.hp <= 0) {
          console.log(`[Combat] ${event.target} has been eliminated!`);
        }
      } else {
        console.log(
          `[Combat] ${event.attacker} hits alien for ${event.damage} damage! (HP: ${this.state.alien.hp})`
        );
      }
    }

    // ── 5. Director decision (every 3s) ──────────────────────
    if (this.state.tick % DIRECTOR_INTERVAL_TICKS === 0) {
      this.requestDirectorDecision();
    }

    // ── 6. Win/loss conditions ────────────────────────────────
    this.checkGameEnd();

    // ── 7. Camera ────────────────────────────────────────────
    // Follow first alive player
    const followTarget = this.state.players.find((p) => p.state !== "dead");
    if (followTarget) {
      updateCamera(
        this.camera,
        followTarget.x + followTarget.width / 2,
        followTarget.y + followTarget.height / 2,
        followTarget.facing,
        this.state.map.width * TILE_SIZE,
        this.state.map.height * TILE_SIZE,
        DT
      );
    }

    // ── 8. Broadcast to spectators (30fps) ───────────────────
    if (this.state.tick % BROADCAST_INTERVAL === 0) {
      this.spectator.broadcast(this.state, this.camera);
    }

    // ── 9. Console status (every 1 second) ───────────────────
    if (this.state.tick % FPS === 0) {
      this.printStatus();
    }
  }

  private processInput() {
    // Phase 1: simulated AI input for each player
    for (let i = 0; i < this.state.players.length; i++) {
      const player = this.state.players[i]!;
      if (player.state === "dead") continue;

      const sim = this.simulatedInputs[i];
      if (sim) {
        player.input = sim.tick(DT, player.grounded, player.vx);
      }
    }
  }

  private async requestDirectorDecision() {
    const decision = await this.director.requestDecision(this.state);
    if (!decision) return;

    applyDirectorStrategy(this.state, decision.strategy, decision.targetPlayer);
    applyEnvironmentActions(this.state, decision);

    this.state.lastDirectorDecision = decision;

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

  private checkGameEnd() {
    const alivePlayers = this.state.players.filter((p) => p.state !== "dead");
    if (alivePlayers.length === 0 && this.state.players.length > 0) {
      this.state.gameOver = true;
      this.state.gameResult = "alien_wins";
      console.log("\n[GAME OVER] ALIEN WINS — All crew eliminated.");
      this.stop();
      return;
    }

    if (this.state.tick >= GAME_TIMEOUT_TICKS) {
      this.state.gameOver = true;
      this.state.gameResult = "timeout";
      console.log("\n[GAME OVER] TIMEOUT — Life support failed.");
      this.stop();
      return;
    }

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
    const alienHp = Math.round(this.state.alien.hp);
    const firstPlayer = this.state.players[0];
    const playerInfo = firstPlayer
      ? ` | P1: (${Math.round(firstPlayer.x)},${Math.round(firstPlayer.y)}) ${firstPlayer.state}`
      : "";
    process.stdout.write(
      `\r[T+${elapsed}s] Alien: ${strategy} HP:${alienHp} | Players: ${alive} alive${playerInfo} | Tick: ${this.state.tick}    `
    );
  }
}
