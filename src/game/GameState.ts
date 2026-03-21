/**
 * Central game state — single source of truth for all entities and environment.
 *
 * DATA FLOW:
 *   GameLoop.tick()
 *     → reads GameState
 *     → updates player positions from input
 *     → runs BehaviorTree.tick() for alien
 *     → applies environment changes from Director
 *     → writes updated GameState
 *     → broadcasts to spectator
 */

import type { TileMap } from "./TileMap";
import type { AlienCard } from "../ai/AlienCard";

export type Strategy = "hunt" | "stalk" | "ambush" | "patrol" | "retreat" | "terrorize";
export type DoorState = "open" | "closed" | "locked";

export interface PlayerState {
  nickname: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  weapon: string;
  ammo: number;
  state: "idle" | "moving" | "sprinting" | "crouching" | "interacting" | "dead";
  direction: [number, number]; // last movement direction
}

export interface AlienState {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  strategy: Strategy;
  targetPlayer: string | null;
  hidden: boolean;
  card: AlienCard;
  /** Path the alien is currently following (from A*) */
  currentPath: [number, number][];
  pathIndex: number;
}

export interface EnvironmentState {
  lights: Map<string, boolean>; // roomId → on/off
  doors: Map<string, DoorState>; // "x,y" → state
  power: boolean;
}

export interface DirectorDecision {
  strategy: Strategy;
  targetPlayer: string | null;
  environmentActions: Array<{
    actionType: "lights" | "door" | "power";
    room: string;
    value: string;
  }>;
  vocalize: "hiss" | "screech" | "silence" | "none";
  innerMonologue: string;
  reasoning: string;
  timestamp: number;
}

export interface GameState {
  tick: number;
  map: TileMap;
  players: PlayerState[];
  alien: AlienState;
  environment: EnvironmentState;
  /** Latest Director decision (updated every 3-5s) */
  lastDirectorDecision: DirectorDecision | null;
  /** Session start time */
  startedAt: number;
  /** Is the game over? */
  gameOver: boolean;
  gameResult: "players_win" | "alien_wins" | "timeout" | null;
}

export function createInitialGameState(map: TileMap, alienCard: AlienCard): GameState {
  // Initialize environment — all lights on, all doors open
  const lights = new Map<string, boolean>();
  for (const room of map.rooms) {
    lights.set(room.id, true);
  }

  // Find door tiles and set them all open
  const doors = new Map<string, DoorState>();
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.tiles[y][x] === 3) {
        doors.set(`${x},${y}`, "open");
      }
    }
  }

  // Place alien in cargo bay (bottom-left room, center-ish)
  const alien: AlienState = {
    x: 5,
    y: 13,
    hp: alienCard.hp,
    maxHp: alienCard.hp,
    strategy: "patrol",
    targetPlayer: null,
    hidden: false,
    card: alienCard,
    currentPath: [],
    pathIndex: 0,
  };

  return {
    tick: 0,
    map,
    players: [],
    alien,
    environment: { lights, doors, power: true },
    lastDirectorDecision: null,
    startedAt: Date.now(),
    gameOver: false,
    gameResult: null,
  };
}

/** Add a player to the game at a spawn point */
export function addPlayer(state: GameState, nickname: string): PlayerState {
  // Spawn in engine bay (top-left room)
  const spawnPoints: [number, number][] = [
    [3, 3], [5, 3], [3, 5], [5, 5],
  ];
  const idx = state.players.length % spawnPoints.length;
  const [sx, sy] = spawnPoints[idx];

  const player: PlayerState = {
    nickname,
    x: sx,
    y: sy,
    hp: 100,
    maxHp: 100,
    weapon: "pistol",
    ammo: 24,
    state: "idle",
    direction: [0, 0],
  };

  state.players.push(player);
  return player;
}
