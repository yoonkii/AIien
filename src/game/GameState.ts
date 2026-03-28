/**
 * Central game state — single source of truth for all entities and environment.
 * Redesigned for 2D side-scrolling platformer with continuous physics.
 *
 * COORDINATE SYSTEM:
 *   (0,0) = top-left of the level
 *   x increases rightward, y increases downward
 *   All positions in PIXELS (not tiles). Use TILE_SIZE to convert.
 */

import type { AlienCard } from "../ai/AlienCard";
import { TILE_SIZE, type PhysicsBody } from "./Physics";

// ── Strategies (unchanged from Director AI) ─────────────────────

export type Strategy = "hunt" | "stalk" | "ambush" | "patrol" | "retreat" | "terrorize";
export type DoorState = "open" | "closed" | "locked";

// ── Input State ─────────────────────────────────────────────────

export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean;
  /** True only on the frame jump was first pressed */
  jumpPressed: boolean;
  attack: boolean;
  /** True only on the frame attack was first pressed */
  attackPressed: boolean;
}

export function createEmptyInput(): InputState {
  return {
    left: false,
    right: false,
    jump: false,
    jumpPressed: false,
    attack: false,
    attackPressed: false,
  };
}

// ── Player State ────────────────────────────────────────────────

export interface PlayerState extends PhysicsBody {
  nickname: string;
  hp: number;
  maxHp: number;
  weapon: string;
  ammo: number;
  state: "idle" | "running" | "jumping" | "falling" | "attacking" | "hurt" | "dead";
  facing: "left" | "right";

  // Jump mechanics
  jumpHeld: boolean;
  coyoteTimer: number;
  jumpBufferTimer: number;
  /** Was grounded last frame? For coyote time tracking */
  wasGrounded: boolean;

  // Combat
  attackTimer: number; // >0 means attack hitbox is active
  attackCooldown: number; // >0 means can't attack yet
  invincibleTimer: number; // >0 means invincible (after being hit)

  // Input
  input: InputState;
}

// ── Alien State ─────────────────────────────────────────────────

export interface AlienState extends PhysicsBody {
  hp: number;
  maxHp: number;
  strategy: Strategy;
  targetPlayer: string | null;
  hidden: boolean;
  card: AlienCard;
  facing: "left" | "right";

  // AI navigation
  /** High-level waypoints (pixel coordinates) the alien is following */
  waypoints: [number, number][];
  waypointIndex: number;

  // Combat
  attackTimer: number;
  attackCooldown: number;
  invincibleTimer: number;

  // Platformer-specific
  jumpHeld: boolean;
  canWallCling: boolean;
}

// ── Environment State ───────────────────────────────────────────

export interface EnvironmentState {
  lights: Map<string, boolean>; // roomId → on/off
  doors: Map<string, DoorState>; // "tileX,tileY" → state
  power: boolean;
}

// ── Director Decision (unchanged) ───────────────────────────────

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

// ── Room Info (for level) ───────────────────────────────────────

export interface RoomInfo {
  id: string;
  name: string;
  x: number; // tile x
  y: number; // tile y
  width: number; // tiles
  height: number; // tiles
}

// ── Level Map ───────────────────────────────────────────────────

export interface LevelMap {
  tiles: number[][]; // [row][col], row = y, col = x
  width: number; // tiles
  height: number; // tiles
  rooms: RoomInfo[];
  playerSpawns: [number, number][]; // pixel coordinates
  alienSpawn: [number, number]; // pixel coordinates
}

// ── Game State ───────────────────────────────────────────────────

export interface GameState {
  tick: number;
  map: LevelMap;
  players: PlayerState[];
  alien: AlienState;
  environment: EnvironmentState;
  /** Latest Director decision (updated every ~3s) */
  lastDirectorDecision: DirectorDecision | null;
  /** Session start time */
  startedAt: number;
  /** Is the game over? */
  gameOver: boolean;
  gameResult: "players_win" | "alien_wins" | "timeout" | null;
}

// ── Factory Functions ───────────────────────────────────────────

export function createPlayer(nickname: string, spawnX: number, spawnY: number): PlayerState {
  return {
    nickname,
    x: spawnX,
    y: spawnY,
    vx: 0,
    vy: 0,
    width: 12, // slightly smaller than a tile for smoother movement
    height: 24, // 1.5 tiles tall
    grounded: false,
    hp: 100,
    maxHp: 100,
    weapon: "pistol",
    ammo: 24,
    state: "idle",
    facing: "right",
    jumpHeld: false,
    coyoteTimer: 0,
    jumpBufferTimer: 999, // start expired
    wasGrounded: false,
    attackTimer: 0,
    attackCooldown: 0,
    invincibleTimer: 0,
    input: createEmptyInput(),
  };
}

export function createAlien(card: AlienCard, spawnX: number, spawnY: number): AlienState {
  return {
    x: spawnX,
    y: spawnY,
    vx: 0,
    vy: 0,
    width: 20,
    height: 28, // alien is bigger than player
    grounded: false,
    hp: card.hp,
    maxHp: card.hp,
    strategy: "patrol",
    targetPlayer: null,
    hidden: false,
    card,
    facing: "left",
    waypoints: [],
    waypointIndex: 0,
    attackTimer: 0,
    attackCooldown: 0,
    invincibleTimer: 0,
    jumpHeld: false,
    canWallCling: true,
  };
}

export function createInitialGameState(map: LevelMap, alienCard: AlienCard): GameState {
  // Initialize environment — all lights on, all doors open
  const lights = new Map<string, boolean>();
  for (const room of map.rooms) {
    lights.set(room.id, true);
  }

  const doors = new Map<string, DoorState>();
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.tiles[y]?.[x] === 5) {
        doors.set(`${x},${y}`, "open");
      }
    }
  }

  const alien = createAlien(alienCard, map.alienSpawn[0], map.alienSpawn[1]);

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

export function addPlayer(state: GameState, nickname: string, index: number): PlayerState {
  const spawn = state.map.playerSpawns[index % state.map.playerSpawns.length]!;
  const player = createPlayer(nickname, spawn[0], spawn[1]);
  state.players.push(player);
  return player;
}
