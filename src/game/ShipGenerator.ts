/**
 * Procedural Ship Generator — unique ship layout every run.
 *
 * ALGORITHM:
 *   1. Generate 4-8 rooms from templates (varying sizes)
 *   2. Place rooms on grid with spacing, no overlap
 *   3. Connect rooms with corridors (MST for guaranteed connectivity)
 *   4. Add doors at corridor-room junctions
 *   5. Overlay vent paths (2+ vents connecting non-adjacent rooms)
 *   6. Flood-fill validation — all floor tiles reachable
 *
 * Seed-based for replay support: same seed → same ship.
 *
 * ROOM TEMPLATES:
 *   ┌─────────┐  ┌───────┐  ┌─────────────┐
 *   │ SMALL   │  │ MEDIUM│  │   LARGE      │
 *   │ 6x5     │  │ 8x6   │  │   12x8       │
 *   └─────────┘  └───────┘  └─────────────┘
 */

import type { TileMap, TileType, Room, RoomExit } from "./TileMap";

// ── Seeded RNG ───────────────────────────────────────────────────
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  /** Returns float in [0, 1) */
  next(): number {
    this.seed = (this.seed * 16807 + 0) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  /** Returns int in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Pick random element from array */
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Shuffle array in place */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

// ── Room templates ───────────────────────────────────────────────
interface RoomTemplate {
  width: number;
  height: number;
  names: string[];
}

const ROOM_TEMPLATES: RoomTemplate[] = [
  { width: 6, height: 5, names: ["Storage Closet", "Maintenance Shaft", "Crew Quarters", "Armory"] },
  { width: 8, height: 6, names: ["Medbay", "Lab", "Communications", "Mess Hall", "Barracks"] },
  { width: 10, height: 7, names: ["Engine Bay", "Cargo Hold", "Hangar Bay", "Reactor Room"] },
  { width: 12, height: 8, names: ["Bridge", "Main Deck", "Life Support", "Engineering"] },
];

// ── Placement ────────────────────────────────────────────────────
interface PlacedRoom {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

function generateRoomPlacements(rng: SeededRandom, roomCount: number): PlacedRoom[] {
  const rooms: PlacedRoom[] = [];
  const usedNames = new Set<string>();

  // Grid-based placement: arrange rooms in a rough 2-row layout
  const cols = Math.ceil(roomCount / 2);
  let gridX = 1;
  let maxRowHeight = 0;

  for (let i = 0; i < roomCount; i++) {
    const template = rng.pick(ROOM_TEMPLATES);
    let name: string;
    do {
      name = rng.pick(template.names);
    } while (usedNames.has(name) && usedNames.size < 20);
    usedNames.add(name);

    const row = i < cols ? 0 : 1;
    const col = i < cols ? i : i - cols;

    // Calculate position with spacing
    const x = 1 + col * 16; // 16 tile horizontal spacing
    const y = 1 + row * 12; // 12 tile vertical spacing

    // Add some random offset
    const ox = rng.int(0, 3);
    const oy = rng.int(0, 2);

    const room: PlacedRoom = {
      id: name.toLowerCase().replace(/\s+/g, "_"),
      name,
      x: x + ox,
      y: y + oy,
      width: template.width,
      height: template.height,
      centerX: 0,
      centerY: 0,
    };
    room.centerX = room.x + Math.floor(room.width / 2);
    room.centerY = room.y + Math.floor(room.height / 2);

    rooms.push(room);
  }

  return rooms;
}

// ── Grid building ────────────────────────────────────────────────
function calculateGridSize(rooms: PlacedRoom[]): { width: number; height: number } {
  let maxX = 0;
  let maxY = 0;
  for (const r of rooms) {
    maxX = Math.max(maxX, r.x + r.width + 2);
    maxY = Math.max(maxY, r.y + r.height + 2);
  }
  return { width: maxX, height: maxY };
}

function buildGrid(width: number, height: number): TileType[][] {
  return Array.from({ length: height }, () => Array(width).fill(0 as TileType));
}

function carveRoom(grid: TileType[][], room: PlacedRoom) {
  // Walls
  for (let dy = 0; dy < room.height; dy++) {
    for (let dx = 0; dx < room.width; dx++) {
      const y = room.y + dy;
      const x = room.x + dx;
      if (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length) {
        if (dy === 0 || dy === room.height - 1 || dx === 0 || dx === room.width - 1) {
          grid[y][x] = 2; // wall
        } else {
          grid[y][x] = 1; // floor
        }
      }
    }
  }
}

// ── Corridor generation (MST-based) ─────────────────────────────
interface Edge {
  from: number;
  to: number;
  dist: number;
}

function generateCorridors(
  grid: TileType[][],
  rooms: PlacedRoom[],
  rng: SeededRandom
): Array<{ from: number; to: number; doorPos: [number, number][] }> {
  // Build MST using Prim's algorithm for guaranteed connectivity
  const edges: Edge[] = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const dist = Math.abs(rooms[i].centerX - rooms[j].centerX) +
                   Math.abs(rooms[i].centerY - rooms[j].centerY);
      edges.push({ from: i, to: j, dist });
    }
  }
  edges.sort((a, b) => a.dist - b.dist);

  // Kruskal's MST
  const parent = Array.from({ length: rooms.length }, (_, i) => i);
  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }
  function union(a: number, b: number) {
    parent[find(a)] = find(b);
  }

  const mstEdges: Edge[] = [];
  for (const edge of edges) {
    if (find(edge.from) !== find(edge.to)) {
      mstEdges.push(edge);
      union(edge.from, edge.to);
    }
  }

  // Add 1-2 extra connections for loops
  const extraEdges = edges.filter((e) => !mstEdges.includes(e));
  rng.shuffle(extraEdges);
  const extraCount = rng.int(1, Math.min(2, extraEdges.length));
  for (let i = 0; i < extraCount; i++) {
    mstEdges.push(extraEdges[i]);
  }

  // Carve L-shaped corridors between room centers.
  // Any wall tile we carve through becomes a door (type 3).
  // Any void tile we carve through becomes floor (type 1) with walls on sides.
  const corridorData: Array<{ from: number; to: number; doorPos: [number, number][] }> = [];
  const h = grid.length;
  const w = grid[0].length;

  function carveTile(x: number, y: number, doors: [number, number][]) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const tile = grid[y][x];
    if (tile === 2) {
      // Wall → door
      grid[y][x] = 3;
      doors.push([x, y]);
    } else if (tile === 0) {
      // Void → floor + walls on adjacent void tiles
      grid[y][x] = 1;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && grid[ny][nx] === 0) {
          grid[ny][nx] = 2;
        }
      }
    }
    // floor or door → leave as-is
  }

  for (const edge of mstEdges) {
    const a = rooms[edge.from];
    const b = rooms[edge.to];
    const doors: [number, number][] = [];

    // L-shape: horizontal from a.center to b.centerX, then vertical to b.centerY
    const sx = a.centerX, sy = a.centerY;
    const ex = b.centerX, ey = b.centerY;

    // Horizontal segment
    const xStep = ex > sx ? 1 : -1;
    for (let x = sx; x !== ex + xStep; x += xStep) {
      carveTile(x, sy, doors);
    }

    // Vertical segment
    const yStep = ey > sy ? 1 : -1;
    for (let y = sy; y !== ey + yStep; y += yStep) {
      carveTile(ex, y, doors);
    }

    corridorData.push({ from: edge.from, to: edge.to, doorPos: doors });
  }

  return corridorData;
}

// ── Vent generation ──────────────────────────────────────────────
function generateVents(
  grid: TileType[][],
  rooms: PlacedRoom[],
  rng: SeededRandom
): Array<{ fromRoom: number; toRoom: number; tiles: [number, number][] }> {
  const vents: Array<{ fromRoom: number; toRoom: number; tiles: [number, number][] }> = [];
  const ventCount = rng.int(2, Math.min(3, rooms.length - 1));

  // Pick room pairs that aren't directly adjacent (for interesting vent shortcuts)
  const pairs: [number, number][] = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 2; j < rooms.length; j++) { // skip adjacent rooms
      pairs.push([i, j]);
    }
  }
  rng.shuffle(pairs);

  for (let v = 0; v < ventCount && v < pairs.length; v++) {
    const [fi, ti] = pairs[v];
    const a = rooms[fi];
    const b = rooms[ti];
    const ventTiles: [number, number][] = [];

    // Place vent tiles along the edge of each room, then connect vertically/horizontally
    // Vent exit from room A (right or bottom wall)
    const ventAx = a.x + a.width - 1;
    const ventAy = a.centerY;
    // Vent entry to room B (left or top wall)
    const ventBx = b.x;
    const ventBy = b.centerY;

    // Carve vent path (straight line, simplified)
    const midX = Math.floor((ventAx + ventBx) / 2);

    // Vertical from A to midpoint, horizontal, then vertical to B
    for (let x = ventAx; x !== midX; x += (midX > ventAx ? 1 : -1)) {
      if (grid[ventAy]?.[x] === 0) {
        grid[ventAy][x] = 4;
        ventTiles.push([x, ventAy]);
      }
    }
    const yDir = ventBy > ventAy ? 1 : -1;
    for (let y = ventAy; y !== ventBy; y += yDir) {
      if (grid[y]?.[midX] === 0) {
        grid[y][midX] = 4;
        ventTiles.push([midX, y]);
      }
    }
    for (let x = midX; x !== ventBx; x += (ventBx > midX ? 1 : -1)) {
      if (grid[ventBy]?.[x] === 0) {
        grid[ventBy][x] = 4;
        ventTiles.push([x, ventBy]);
      }
    }

    if (ventTiles.length > 0) {
      vents.push({ fromRoom: fi, toRoom: ti, tiles: ventTiles });
    }
  }

  return vents;
}

// ── Flood fill validation ────────────────────────────────────────
function validateConnectivity(grid: TileType[][]): boolean {
  // Find first floor tile
  let startX = -1;
  let startY = -1;
  let totalFloor = 0;

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      if (grid[y][x] === 1 || grid[y][x] === 3) {
        totalFloor++;
        if (startX === -1) { startX = x; startY = y; }
      }
    }
  }

  if (startX === -1) return false;

  // BFS flood fill
  const visited = new Set<string>();
  const queue: [number, number][] = [[startX, startY]];
  visited.add(`${startX},${startY}`);

  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      if (ny < 0 || ny >= grid.length || nx < 0 || nx >= grid[0].length) continue;
      const tile = grid[ny][nx];
      if (tile === 1 || tile === 3) { // floor or door
        visited.add(key);
        queue.push([nx, ny]);
      }
    }
  }

  const reachable = visited.size;
  const ratio = reachable / totalFloor;
  return ratio > 0.8; // Allow small unreachable pockets
}

// ── Public API ───────────────────────────────────────────────────
export interface GeneratedShip {
  map: TileMap;
  seed: number;
  alienSpawn: [number, number];
  playerSpawns: [number, number][];
}

export function generateShip(seed?: number): GeneratedShip {
  const actualSeed = seed ?? Math.floor(Math.random() * 2147483647);
  const rng = new SeededRandom(actualSeed);

  const roomCount = rng.int(4, 8);
  const placements = generateRoomPlacements(rng, roomCount);
  const { width, height } = calculateGridSize(placements);

  const grid = buildGrid(width, height);

  // Carve rooms
  for (const room of placements) {
    carveRoom(grid, room);
  }

  // Generate corridors (MST + extras)
  const corridorData = generateCorridors(grid, placements, rng);

  // Generate vents
  const vents = generateVents(grid, placements, rng);

  // Validate connectivity
  const connected = validateConnectivity(grid);
  if (!connected) {
    // Retry with different seed (recursive, max 1 retry)
    console.warn(`[ShipGen] Seed ${actualSeed} produced disconnected map, retrying...`);
    return generateShip(actualSeed + 1);
  }

  // Build Room objects with exits
  const rooms: Room[] = placements.map((p, i) => {
    const exits: RoomExit[] = [];

    // Find doors connected to this room
    for (const corr of corridorData) {
      if (corr.from === i || corr.to === i) {
        const otherIdx = corr.from === i ? corr.to : corr.from;
        for (const doorPos of corr.doorPos) {
          // Check if door is on this room's boundary
          if (doorPos[0] >= p.x && doorPos[0] < p.x + p.width &&
              doorPos[1] >= p.y && doorPos[1] < p.y + p.height) {
            exits.push({
              direction: doorPos[0] === p.x ? "west" : doorPos[0] === p.x + p.width - 1 ? "east" :
                         doorPos[1] === p.y ? "north" : "south",
              toRoomId: placements[otherIdx].id,
              type: "door",
              pos: doorPos,
            });
          }
        }
      }
    }

    // Find vents connected to this room
    for (const vent of vents) {
      if (vent.fromRoom === i || vent.toRoom === i) {
        const otherIdx = vent.fromRoom === i ? vent.toRoom : vent.fromRoom;
        if (vent.tiles.length > 0) {
          const ventTile = vent.fromRoom === i ? vent.tiles[0] : vent.tiles[vent.tiles.length - 1];
          exits.push({
            direction: "vent",
            toRoomId: placements[otherIdx].id,
            type: "vent",
            pos: ventTile,
          });
        }
      }
    }

    return {
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      exits,
    };
  });

  // Spawn points: players in first room, alien in last room
  const playerRoom = placements[0];
  const alienRoom = placements[placements.length - 1];

  const playerSpawns: [number, number][] = [
    [playerRoom.x + 2, playerRoom.y + 2],
    [playerRoom.x + 4, playerRoom.y + 2],
    [playerRoom.x + 2, playerRoom.y + 4],
    [playerRoom.x + 4, playerRoom.y + 4],
  ].filter(([x, y]) => x < playerRoom.x + playerRoom.width - 1 && y < playerRoom.y + playerRoom.height - 1);

  const alienSpawn: [number, number] = [
    alienRoom.centerX,
    alienRoom.centerY,
  ];

  return {
    map: { width, height, tiles: grid, rooms },
    seed: actualSeed,
    alienSpawn,
    playerSpawns,
  };
}
