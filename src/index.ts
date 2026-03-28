#!/usr/bin/env bun
/**
 * AIien — 2D Side-Scrolling Platformer Horror Game
 *
 * A multiplayer platformer where players must survive against an
 * AI-controlled alien antagonist on a procedurally generated spaceship.
 * The alien is directed by a Gemini-powered "Director AI" that makes
 * strategic decisions about hunting, environmental manipulation, and
 * player psychology.
 *
 * Controls: Arrow keys / WASD to move, Space/Up to jump, Z/X to attack
 * (Currently simulated — connect via spectator to watch AI play)
 */

import { generateLevel, printLevel } from "./game/LevelGenerator";
import { createInitialGameState, addPlayer } from "./game/GameState";
import { generateAlienCard } from "./ai/AlienGenerator";
import { KnowledgeBase } from "./ai/KnowledgeBase";
import { DirectorClient } from "./ai/DirectorClient";
import { DecisionLogger } from "./logging/DecisionLogger";
import { SessionManifest } from "./logging/SessionManifest";
import { SpectatorServer } from "./spectator/SpectatorServer";
import { GameLoop } from "./game/GameLoop";

// ── Load env ─────────────────────────────────────────────────────
const envFile = Bun.file(".env.local");
if (await envFile.exists()) {
  const text = await envFile.text();
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([\w]+)\s*=\s*(.+)\s*$/);
    if (match) process.env[match[1]!] = match[2]!.trim();
  }
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("ERROR: Set GEMINI_API_KEY in .env.local");
  process.exit(1);
}

// ── Parse CLI args ───────────────────────────────────────────────
const args = process.argv.slice(2);
const seed = args.find((a: string) => a.startsWith("--seed="))
  ? parseInt(args.find((a: string) => a.startsWith("--seed="))!.split("=")[1]!)
  : undefined;
const playerNames = args.filter((a: string) => !a.startsWith("--"));

console.log("╔══════════════════════════════════════════════════╗");
console.log("║     AIien — 2D Platformer Horror                 ║");
console.log("║     GMTK-inspired physics + Gemini Director AI   ║");
console.log("╚══════════════════════════════════════════════════╝");
console.log();

// ── Generate level ───────────────────────────────────────────────
console.log("[Level] Generating procedural platformer level...");
const { map, seed: actualSeed } = generateLevel(seed);
console.log(`[Level] Generated! Seed: ${actualSeed} | ${map.rooms.length} rooms | ${map.width}x${map.height} tiles`);
console.log(`[Level] Rooms: ${map.rooms.map((r) => r.name).join(", ")}`);
printLevel(map);
console.log();

// ── Generate alien ───────────────────────────────────────────────
console.log("[Alien] Generating unique alien...");
const { card: alienCard, generated } = await generateAlienCard(GEMINI_API_KEY);
console.log(`[Alien] ${generated ? "AI-Generated" : "Fallback"}: ${alienCard.name} (${alienCard.bodyType})`);
console.log(`[Alien] HP: ${alienCard.hp} | Speed: ${alienCard.speed} | ${alienCard.movementStyle}`);
console.log(`[Alien] Personality: ${alienCard.personality}`);
console.log(`[Alien] Abilities: ${alienCard.abilities.map((a) => `${a.name} (${a.damage}dmg)`).join(", ")}`);
console.log();

// ── Knowledge base ───────────────────────────────────────────────
const kb = new KnowledgeBase();
const names = playerNames.length > 0 ? playerNames : ["yoonki", "alex", "sam"];

const profiles = await kb.getProfilesForSession(names);
if (profiles.length > 0) {
  console.log(`[KB] Found ${profiles.length} returning players:`);
  for (const p of profiles) {
    console.log(`  ${p.nickname}: ${p.gamesPlayed} games | fears: ${p.fearBehaviors.join(", ") || "unknown"}`);
  }
} else {
  console.log("[KB] All new players — no prior data");
}
console.log();

// ── Create game state ────────────────────────────────────────────
const state = createInitialGameState(map, alienCard);

// Add players at spawn points
for (let i = 0; i < names.length; i++) {
  addPlayer(state, names[i]!, i);
}

console.log(`[Players] ${state.players.length} players spawned`);
console.log(`[Alien] Spawned at (${Math.round(state.alien.x)}, ${Math.round(state.alien.y)})`);
console.log();

// ── Create systems ───────────────────────────────────────────────
const director = new DirectorClient(GEMINI_API_KEY);
const sessionId = `${Date.now()}`;
const logger = new DecisionLogger(sessionId);
const spectator = new SpectatorServer();

const SPECTATOR_PORT = parseInt(process.env.SPECTATOR_PORT ?? "4000");
spectator.start(SPECTATOR_PORT);
console.log(`[Spectator] Open http://localhost:${SPECTATOR_PORT} to watch the AI hunt`);
console.log(`[Physics] 60 FPS | Gravity: design-first (GMTK toolkit inspired)`);
console.log(`[Physics] Jump: 3.5 tiles | Coyote: 100ms | Buffer: 100ms | Variable height: ON`);
console.log();

// ── Write session manifest ──────────────────────────────────────
const manifest = new SessionManifest(sessionId);
await manifest.write({
  sessionId,
  startedAt: new Date().toISOString(),
  seed: actualSeed,
  useProceduralShip: true,
  alienCard,
  alienGenerated: generated,
  players: names,
  modelVersion: "gemini-2.0-flash",
  directorIntervalTicks: 180,
  gameTimeoutTicks: 72000,
  spectatorPort: SPECTATOR_PORT,
  version: "0.3.0",
});

// ── Start game ───────────────────────────────────────────────────
const game = new GameLoop(state, director, logger, spectator);
game.start();

console.log("[Game] Running at 60 FPS... (Ctrl+C to stop)\n");

// ── Graceful shutdown ────────────────────────────────────────────
process.on("SIGINT", async () => {
  console.log("\n\n[Game] Stopping...");
  game.stop();
  spectator.stop();

  // Save session results
  console.log("[KB] Saving player profiles...");
  for (const player of state.players) {
    const fearBehaviors: string[] = [];
    const strategyPatterns: string[] = [];

    if (player.state === "dead") fearBehaviors.push("died to alien");
    if (player.weapon === "shotgun") strategyPatterns.push("prefers close-range weapons");
    if (player.weapon === "pistol") strategyPatterns.push("uses standard weapons");

    await kb.recordSession(player.nickname, {
      weaponsUsed: [player.weapon],
      newFearBehaviors: fearBehaviors,
      newStrategyPatterns: strategyPatterns,
    });
  }

  await logger.writeSessionMetrics();

  console.log(`[Log] Decisions saved to: ${logger.getFilePath()}`);
  console.log("[KB] Profiles updated for next session");

  process.exit(0);
});
