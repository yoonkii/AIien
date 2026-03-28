#!/usr/bin/env bun
/**
 * AIien — Phase 2 Prototype Entry Point
 *
 * New in Phase 2:
 * - Procedural ship generation (unique ship every run, seed-based)
 * - AI-generated alien (Gemini creates unique alien per session)
 * - Knowledge base (alien remembers players across sessions)
 * - Alien evolution (Director can evolve alien mid-game)
 */

import { generateShip } from "./game/ShipGenerator";
import { createShipMap, printMap } from "./game/ShipMap";
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
    if (match) process.env[match[1]] = match[2].trim();
  }
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("ERROR: Set GEMINI_API_KEY in .env.local");
  process.exit(1);
}

// ── Parse CLI args ───────────────────────────────────────────────
const args = process.argv.slice(2);
const useProceduralShip = !args.includes("--static-map");
const seed = args.find((a) => a.startsWith("--seed="))
  ? parseInt(args.find((a) => a.startsWith("--seed="))!.split("=")[1])
  : undefined;
const playerNames = args.filter((a) => !a.startsWith("--"));

console.log("╔══════════════════════════════════════════════════╗");
console.log("║     AIien — Phase 2: Roguelike Systems           ║");
console.log("╚══════════════════════════════════════════════════╝");
console.log();

// ── Generate or load ship ────────────────────────────────────────
let map;
let alienSpawn: [number, number];
let playerSpawns: [number, number][];

if (useProceduralShip) {
  console.log("[Ship] Generating procedural ship...");
  const ship = generateShip(seed);
  map = ship.map;
  alienSpawn = ship.alienSpawn;
  playerSpawns = ship.playerSpawns;
  console.log(`[Ship] Generated! Seed: ${ship.seed} | ${map.rooms.length} rooms | ${map.width}x${map.height} tiles`);
  console.log(`[Ship] Rooms: ${map.rooms.map((r) => r.name).join(", ")}`);
} else {
  console.log("[Ship] Using static map");
  map = createShipMap();
  alienSpawn = [5, 13];
  playerSpawns = [[3, 3], [5, 3], [3, 5], [5, 5]];
}

printMap(map);
console.log();

// ── Generate alien ───────────────────────────────────────────────
console.log("[Alien] Generating unique alien...");
const { card: alienCard, generated } = await generateAlienCard(GEMINI_API_KEY);
console.log(`[Alien] ${generated ? "AI-Generated" : "Fallback"}: ${alienCard.name} (${alienCard.bodyType})`);
console.log(`[Alien] HP: ${alienCard.hp} | Speed: ${alienCard.speed} | ${alienCard.movementStyle}`);
console.log(`[Alien] Personality: ${alienCard.personality}`);
console.log(`[Alien] Voice: "${alienCard.voiceStyle}"`);
console.log(`[Alien] Abilities: ${alienCard.abilities.map((a) => `${a.name} (${a.damage}dmg, ${a.cooldown}s cd)`).join(", ")}`);
console.log();

// ── Knowledge base ───────────────────────────────────────────────
const kb = new KnowledgeBase();
const names = playerNames.length > 0 ? playerNames : ["yoonki", "alex", "sam"];

// Load existing profiles
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

// Override alien spawn for procedural maps
state.alien.x = alienSpawn[0];
state.alien.y = alienSpawn[1];

// Add players at spawn points
for (let i = 0; i < names.length; i++) {
  const player = addPlayer(state, names[i]);
  if (playerSpawns[i]) {
    player.x = playerSpawns[i][0];
    player.y = playerSpawns[i][1];
  }
}

console.log(`[Players] ${state.players.length} players spawned`);
printMap(map, [
  ...state.players.map((p) => ({ x: p.x, y: p.y, char: "@" })),
  { x: state.alien.x, y: state.alien.y, char: "X" },
]);
console.log("\n  @ = player, X = alien\n");

// ── Create systems ───────────────────────────────────────────────
const director = new DirectorClient(GEMINI_API_KEY);
const sessionId = `${Date.now()}`;
const logger = new DecisionLogger(sessionId);
const spectator = new SpectatorServer();

const SPECTATOR_PORT = parseInt(process.env.SPECTATOR_PORT ?? "4000");
spectator.start(SPECTATOR_PORT);
console.log(`[Spectator] Open http://localhost:${SPECTATOR_PORT} to watch the AI hunt\n`);

// ── Write session manifest ──────────────────────────────────────
const manifest = new SessionManifest(sessionId);
await manifest.write({
  sessionId,
  startedAt: new Date().toISOString(),
  seed,
  useProceduralShip,
  alienCard,
  alienGenerated: generated,
  players: names,
  modelVersion: "gemini-2.0-flash",
  directorIntervalTicks: 30,
  gameTimeoutTicks: 12000,
  spectatorPort: SPECTATOR_PORT,
  version: "0.2.0",
});

// ── Start game ───────────────────────────────────────────────────
const game = new GameLoop(state, director, logger, spectator);
game.start();

console.log("[Game] Running... (Ctrl+C to stop)\n");

// ── Graceful shutdown with knowledge base update ─────────────────
process.on("SIGINT", async () => {
  console.log("\n\n[Game] Stopping...");
  game.stop();
  spectator.stop();

  // Save session results to knowledge base
  console.log("[KB] Saving player profiles...");
  for (const player of state.players) {
    const fearBehaviors: string[] = [];
    const strategyPatterns: string[] = [];

    // Analyze player behavior from the session
    if (player.state === "dead") {
      fearBehaviors.push("died to alien");
    }
    if (player.weapon === "shotgun") {
      strategyPatterns.push("prefers close-range weapons");
    }
    if (player.weapon === "pistol") {
      strategyPatterns.push("uses standard weapons");
    }

    await kb.recordSession(player.nickname, {
      weaponsUsed: [player.weapon],
      newFearBehaviors: fearBehaviors,
      newStrategyPatterns: strategyPatterns,
    });
  }

  // Write aggregated session metrics
  await logger.writeSessionMetrics();

  console.log(`[Log] Decisions saved to: ${logger.getFilePath()}`);
  console.log("[KB] Profiles updated for next session");

  process.exit(0);
});
