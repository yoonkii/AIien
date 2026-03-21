/**
 * Hardcoded 5-room ship map for Phase 1.
 *
 * SHIP LAYOUT (global grid 40x20):
 *
 *   ╔════════════╗         ╔══════════╗
 *   ║ ENGINE BAY ║════D════║  BRIDGE  ║
 *   ║  (10x8)    ║  corr   ║  (8x6)   ║
 *   ╚════════╤═══╝  B(6x3) ╚════D═════╝
 *            │vent           vent│
 *   ╔═══════╧════╗         ╔════╧══════╗
 *   ║  CARGO BAY ║════D════║  MEDBAY   ║
 *   ║  (10x6)    ║  corr   ║  (8x6)    ║
 *   ╚════════════╝  A(6x3) ╚═══════════╝
 *
 *   D = door tile (type 3)
 *   vent = vent tile (type 4, alien-only)
 */

import type { TileMap, TileType, Room } from "./TileMap";

const W = 40; // global grid width
const H = 20; // global grid height

function createEmptyGrid(): TileType[][] {
  return Array.from({ length: H }, () => Array(W).fill(0 as TileType));
}

function fillRect(grid: TileType[][], x: number, y: number, w: number, h: number, tile: TileType) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (y + dy < H && x + dx < W) grid[y + dy][x + dx] = tile;
    }
  }
}

function setTile(grid: TileType[][], x: number, y: number, tile: TileType) {
  if (y >= 0 && y < H && x >= 0 && x < W) grid[y][x] = tile;
}

/** Build walls around a floor rectangle */
function buildRoom(grid: TileType[][], x: number, y: number, w: number, h: number) {
  // Fill with walls first
  fillRect(grid, x, y, w, h, 2);
  // Fill interior with floor
  fillRect(grid, x + 1, y + 1, w - 2, h - 2, 1);
}

export function createShipMap(): TileMap {
  const grid = createEmptyGrid();

  // ── Rooms ──────────────────────────────────────────
  // Engine Bay: top-left
  buildRoom(grid, 0, 0, 12, 8);

  // Bridge: top-right
  buildRoom(grid, 22, 0, 10, 7);

  // Corridor B: top connector
  buildRoom(grid, 12, 2, 10, 4);

  // Cargo Bay: bottom-left
  buildRoom(grid, 0, 10, 12, 7);

  // Medbay: bottom-right
  buildRoom(grid, 22, 10, 10, 7);

  // Corridor A: bottom connector
  buildRoom(grid, 12, 11, 10, 4);

  // ── Doors (type 3) ────────────────────────────────
  // Engine Bay → Corridor B
  setTile(grid, 12, 4, 3);
  // Corridor B → Bridge
  setTile(grid, 21, 4, 3);
  // Cargo Bay → Corridor A
  setTile(grid, 12, 13, 3);
  // Corridor A → Medbay
  setTile(grid, 21, 13, 3);

  // ── Vents (type 4, alien-only) ────────────────────
  // Engine Bay ↔ Cargo Bay (vertical vent on left side)
  setTile(grid, 8, 8, 4);
  setTile(grid, 8, 9, 4);

  // Bridge ↔ Medbay (vertical vent on right side)
  setTile(grid, 26, 7, 4);
  setTile(grid, 26, 8, 4);
  setTile(grid, 26, 9, 4);

  // ── Room definitions ──────────────────────────────
  const rooms: Room[] = [
    {
      id: "engine_bay",
      name: "Engine Bay",
      x: 0, y: 0, width: 12, height: 8,
      exits: [
        { direction: "east", toRoomId: "corridor_b", type: "door", pos: [12, 4] },
        { direction: "down", toRoomId: "cargo_bay", type: "vent", pos: [8, 8] },
      ],
    },
    {
      id: "corridor_b",
      name: "Corridor B",
      x: 12, y: 2, width: 10, height: 4,
      exits: [
        { direction: "west", toRoomId: "engine_bay", type: "door", pos: [12, 4] },
        { direction: "east", toRoomId: "bridge", type: "door", pos: [21, 4] },
      ],
    },
    {
      id: "bridge",
      name: "Bridge",
      x: 22, y: 0, width: 10, height: 7,
      exits: [
        { direction: "west", toRoomId: "corridor_b", type: "door", pos: [21, 4] },
        { direction: "down", toRoomId: "medbay", type: "vent", pos: [26, 7] },
      ],
    },
    {
      id: "cargo_bay",
      name: "Cargo Bay",
      x: 0, y: 10, width: 12, height: 7,
      exits: [
        { direction: "east", toRoomId: "corridor_a", type: "door", pos: [12, 13] },
        { direction: "up", toRoomId: "engine_bay", type: "vent", pos: [8, 9] },
      ],
    },
    {
      id: "corridor_a",
      name: "Corridor A",
      x: 12, y: 11, width: 10, height: 4,
      exits: [
        { direction: "west", toRoomId: "cargo_bay", type: "door", pos: [12, 13] },
        { direction: "east", toRoomId: "medbay", type: "door", pos: [21, 13] },
      ],
    },
    {
      id: "medbay",
      name: "Medbay",
      x: 22, y: 10, width: 10, height: 7,
      exits: [
        { direction: "west", toRoomId: "corridor_a", type: "door", pos: [21, 13] },
        { direction: "up", toRoomId: "bridge", type: "vent", pos: [26, 9] },
      ],
    },
  ];

  return { width: W, height: H, tiles: grid, rooms };
}

/** Debug: print map to console with colored symbols */
export function printMap(
  map: TileMap,
  entities?: Array<{ x: number; y: number; char: string }>
) {
  const entityMap = new Map<string, string>();
  for (const e of entities ?? []) {
    entityMap.set(`${e.x},${e.y}`, e.char);
  }

  const tileChars: Record<TileType, string> = {
    0: " ",
    1: ".",
    2: "#",
    3: "D",
    4: "~",
  };

  const lines: string[] = [];
  for (let y = 0; y < map.height; y++) {
    let line = "";
    for (let x = 0; x < map.width; x++) {
      const entity = entityMap.get(`${x},${y}`);
      line += entity ?? tileChars[map.tiles[y][x]];
    }
    lines.push(line);
  }
  console.log(lines.join("\n"));
}
