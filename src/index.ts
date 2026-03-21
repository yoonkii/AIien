#!/usr/bin/env bun
/**
 * AIien — Phase 1 Prototype Entry Point
 *
 * Starts a game with:
 * - Hardcoded 5-room ship map
 * - Hardcoded Lurker alien
 * - 2-3 simulated players (random movement)
 * - Gemini Director making strategic decisions every 3s
 * - Spectator view at http://localhost:3000
 * - Decision logging for Director's Cut
 */

import { createShipMap, printMap } from "./game/ShipMap";
import { createInitialGameState, addPlayer } from "./game/GameState";
import { LURKER_CARD } from "./ai/AlienCard";
import { DirectorClient } from "./ai/DirectorClient";
import { DecisionLogger } from "./logging/DecisionLogger";
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

// ── Initialize ───────────────────────────────────────────────────
console.log("╔══════════════════════════════════════════╗");
console.log("║        AIien — Phase 1 Prototype         ║");
console.log("╚══════════════════════════════════════════╝");
console.log();

// Create ship
const map = createShipMap();
console.log("[Ship] Map created (40x20, 6 rooms)");
printMap(map);
console.log();

// Create game state
const state = createInitialGameState(map, LURKER_CARD);

// Add simulated players
addPlayer(state, "yoonki");
addPlayer(state, "alex");
addPlayer(state, "sam");
console.log(`[Players] ${state.players.length} players spawned in Engine Bay`);

// Show initial positions
printMap(map, [
  ...state.players.map((p) => ({ x: p.x, y: p.y, char: "@" })),
  { x: state.alien.x, y: state.alien.y, char: "X" },
]);
console.log("\n  @ = player, X = alien\n");

// Create systems
const director = new DirectorClient(GEMINI_API_KEY);
const sessionId = `${Date.now()}`;
const logger = new DecisionLogger(sessionId);
const spectator = new SpectatorServer();

// Start spectator server
const SPECTATOR_PORT = parseInt(process.env.SPECTATOR_PORT ?? "3001");
spectator.start(SPECTATOR_PORT);
console.log(`[Spectator] Open http://localhost:${SPECTATOR_PORT} to watch the AI hunt\n`);

// Create and start game loop
const game = new GameLoop(state, director, logger, spectator);
game.start();

console.log("[Game] Running... (Ctrl+C to stop)\n");

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\n[Game] Stopping...");
  game.stop();
  spectator.stop();
  console.log(`[Log] Decisions saved to: ${logger.getFilePath()}`);
  process.exit(0);
});
