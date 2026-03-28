/**
 * Level Generator — procedural side-scrolling spaceship levels.
 *
 * Generates platformer-friendly layouts with rooms connected by corridors.
 * Each room has different platform configurations for varied gameplay.
 * Seed-based for deterministic replay support.
 */

import { TileType } from "./Physics";
import { TILE_SIZE } from "./Physics";
import type { LevelMap, RoomInfo } from "./GameState";

// ── Seeded RNG ──────────────────────────────────────────────────

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  next(): number {
    this.state = (this.state * 1664525 + 1013904223) & 0xffffffff;
    return (this.state >>> 0) / 0xffffffff;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)]!;
  }

  shuffle<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j]!, result[i]!];
    }
    return result;
  }
}

// ── Room Templates ──────────────────────────────────────────────

interface RoomTemplate {
  id: string;
  name: string;
  width: number; // tiles
  height: number; // tiles
  /** Build the interior platforms and features */
  build: (tiles: number[][], offsetX: number, offsetY: number, rng: SeededRandom) => void;
}

const ROOM_TEMPLATES: RoomTemplate[] = [
  {
    id: "engine_bay",
    name: "Engine Bay",
    width: 20,
    height: 14,
    build: (tiles, ox, oy, rng) => {
      // Large open room with catwalk at top and crates on floor
      // Floor catwalk (one-way platform) at 1/3 height
      const catwalkY = oy + 4;
      for (let x = ox + 3; x < ox + 17; x++) {
        tiles[catwalkY]![x] = TileType.PLATFORM;
      }
      // Some crate platforms on the floor
      for (let i = 0; i < 3; i++) {
        const cx = ox + 4 + i * 5;
        const cy = oy + 11;
        tiles[cy]![cx] = TileType.SOLID;
        tiles[cy]![cx + 1] = TileType.SOLID;
      }
    },
  },
  {
    id: "medbay",
    name: "Medbay",
    width: 14,
    height: 12,
    build: (tiles, ox, oy, rng) => {
      // Shelves / exam tables as platforms
      const shelfY1 = oy + 4;
      const shelfY2 = oy + 8;
      for (let x = ox + 2; x < ox + 6; x++) {
        tiles[shelfY1]![x] = TileType.PLATFORM;
      }
      for (let x = ox + 8; x < ox + 12; x++) {
        tiles[shelfY2]![x] = TileType.PLATFORM;
      }
      // Small step
      tiles[oy + 10]![ox + 6] = TileType.SOLID;
      tiles[oy + 10]![ox + 7] = TileType.SOLID;
    },
  },
  {
    id: "cargo_bay",
    name: "Cargo Bay",
    width: 18,
    height: 14,
    build: (tiles, ox, oy, rng) => {
      // Stacked crates creating a staircase pattern
      // Bottom row
      for (let x = ox + 2; x < ox + 5; x++) {
        tiles[oy + 11]![x] = TileType.SOLID;
        tiles[oy + 12]![x] = TileType.SOLID;
      }
      // Mid platform
      for (let x = ox + 7; x < ox + 11; x++) {
        tiles[oy + 9]![x] = TileType.PLATFORM;
      }
      // Upper crate
      tiles[oy + 6]![ox + 13] = TileType.SOLID;
      tiles[oy + 6]![ox + 14] = TileType.SOLID;
      tiles[oy + 7]![ox + 13] = TileType.SOLID;
      tiles[oy + 7]![ox + 14] = TileType.SOLID;
      // Top platform
      for (let x = ox + 12; x < ox + 16; x++) {
        tiles[oy + 4]![x] = TileType.PLATFORM;
      }
    },
  },
  {
    id: "corridor",
    name: "Corridor",
    width: 12,
    height: 8,
    build: (tiles, ox, oy, _rng) => {
      // Simple narrow passage — floor with a gap
      // Gap in the middle of the floor
      tiles[oy + 6]![ox + 5] = TileType.EMPTY;
      tiles[oy + 6]![ox + 6] = TileType.EMPTY;
      // Small overhead platform
      for (let x = ox + 3; x < ox + 9; x++) {
        tiles[oy + 3]![x] = TileType.PLATFORM;
      }
    },
  },
  {
    id: "reactor_room",
    name: "Reactor Room",
    width: 16,
    height: 16,
    build: (tiles, ox, oy, rng) => {
      // Tall room with vertical platforming
      // Staggered platforms going up
      for (let i = 0; i < 4; i++) {
        const py = oy + 13 - i * 3;
        const px = i % 2 === 0 ? ox + 2 : ox + 9;
        const len = 5;
        for (let x = px; x < px + len; x++) {
          if (py >= 0 && py < tiles.length && x < ox + 15) {
            tiles[py]![x] = TileType.PLATFORM;
          }
        }
      }
    },
  },
  {
    id: "vent_shaft",
    name: "Vent Shaft",
    width: 6,
    height: 14,
    build: (tiles, ox, oy, _rng) => {
      // Vertical vent passage — alien shortcut
      // Fill interior with vent tiles
      for (let y = oy + 1; y < oy + 13; y++) {
        for (let x = ox + 2; x < ox + 4; x++) {
          tiles[y]![x] = TileType.VENT;
        }
      }
    },
  },
  {
    id: "bridge",
    name: "Bridge",
    width: 16,
    height: 10,
    build: (tiles, ox, oy, _rng) => {
      // Command center — elevated console platform
      // Central raised platform
      for (let x = ox + 5; x < ox + 11; x++) {
        tiles[oy + 6]![x] = TileType.SOLID;
      }
      // Side platforms
      for (let x = ox + 1; x < ox + 4; x++) {
        tiles[oy + 4]![x] = TileType.PLATFORM;
      }
      for (let x = ox + 12; x < ox + 15; x++) {
        tiles[oy + 4]![x] = TileType.PLATFORM;
      }
    },
  },
];

// ── Level Generator ─────────────────────────────────────────────

export interface GeneratedLevel {
  map: LevelMap;
  seed: number;
}

export function generateLevel(seed?: number): GeneratedLevel {
  const actualSeed = seed ?? Math.floor(Math.random() * 2147483647);
  const rng = new SeededRandom(actualSeed);

  // Pick 4-6 rooms (always include engine_bay and bridge)
  const numRooms = rng.int(4, 6);
  const requiredIds = ["engine_bay", "bridge"];
  const optionalTemplates = ROOM_TEMPLATES.filter(
    (t) => !requiredIds.includes(t.id)
  );
  const shuffled = rng.shuffle(optionalTemplates);
  const selectedTemplates = [
    ROOM_TEMPLATES.find((t) => t.id === "engine_bay")!,
    ...shuffled.slice(0, numRooms - 2),
    ROOM_TEMPLATES.find((t) => t.id === "bridge")!,
  ];

  // Add a vent shaft between rooms occasionally
  if (rng.next() > 0.4) {
    const ventIdx = rng.int(1, selectedTemplates.length - 1);
    selectedTemplates.splice(
      ventIdx,
      0,
      ROOM_TEMPLATES.find((t) => t.id === "vent_shaft")!
    );
  }

  // Layout rooms horizontally with connecting corridors
  const PADDING = 2; // tiles between rooms
  let cursorX = 2; // start with 2-tile border
  const rooms: RoomInfo[] = [];
  const roomPlacements: {
    template: RoomTemplate;
    x: number;
    y: number;
  }[] = [];

  // Find total height needed
  const maxHeight = Math.max(...selectedTemplates.map((t) => t.height));
  const levelHeight = maxHeight + 6; // top/bottom margins

  for (const template of selectedTemplates) {
    // Vertically center rooms, with slight random offset
    const yOffset = Math.floor((levelHeight - template.height) / 2) + rng.int(-1, 1);

    rooms.push({
      id: template.id + (rooms.filter((r) => r.id.startsWith(template.id)).length > 0 ? "_2" : ""),
      name: template.name,
      x: cursorX,
      y: yOffset,
      width: template.width,
      height: template.height,
    });

    roomPlacements.push({
      template,
      x: cursorX,
      y: yOffset,
    });

    cursorX += template.width + PADDING;
  }

  const levelWidth = cursorX + 2; // right border

  // Initialize tiles — all solid (hull)
  const tiles: number[][] = [];
  for (let y = 0; y < levelHeight; y++) {
    tiles.push(new Array(levelWidth).fill(TileType.WALL));
  }

  // Carve out room interiors
  for (const placement of roomPlacements) {
    const { template, x: ox, y: oy } = placement;

    // Carve empty space
    for (let y = oy + 1; y < oy + template.height - 1; y++) {
      for (let x = ox + 1; x < ox + template.width - 1; x++) {
        if (y >= 0 && y < levelHeight && x >= 0 && x < levelWidth) {
          tiles[y]![x] = TileType.EMPTY;
        }
      }
    }

    // Build room floor
    const floorY = oy + template.height - 1;
    for (let x = ox; x < ox + template.width; x++) {
      if (floorY >= 0 && floorY < levelHeight && x >= 0 && x < levelWidth) {
        tiles[floorY]![x] = TileType.SOLID;
      }
    }

    // Build room ceiling
    for (let x = ox; x < ox + template.width; x++) {
      if (oy >= 0 && oy < levelHeight && x >= 0 && x < levelWidth) {
        tiles[oy]![x] = TileType.SOLID;
      }
    }

    // Build room walls (left and right)
    for (let y = oy; y < oy + template.height; y++) {
      if (y >= 0 && y < levelHeight) {
        if (ox >= 0 && ox < levelWidth) tiles[y]![ox] = TileType.WALL;
        const rightWall = ox + template.width - 1;
        if (rightWall >= 0 && rightWall < levelWidth) tiles[y]![rightWall] = TileType.WALL;
      }
    }

    // Apply room-specific interior features
    template.build(tiles, ox, oy, rng);
  }

  // Connect rooms with corridors (doors between them)
  for (let i = 0; i < roomPlacements.length - 1; i++) {
    const left = roomPlacements[i]!;
    const right = roomPlacements[i + 1]!;

    // Corridor from right edge of left room to left edge of right room
    const corridorStartX = left.x + left.template.width - 1;
    const corridorEndX = right.x + 1;

    // Find overlapping Y range for corridor
    const topOverlap = Math.max(left.y + 1, right.y + 1);
    const botOverlap = Math.min(
      left.y + left.template.height - 2,
      right.y + right.template.height - 2
    );

    if (botOverlap - topOverlap >= 2) {
      // Carve a 3-tile-high corridor at the vertical midpoint
      const corridorY = Math.floor((topOverlap + botOverlap) / 2) - 1;

      for (let x = corridorStartX; x <= corridorEndX; x++) {
        for (let dy = 0; dy < 3; dy++) {
          const cy = corridorY + dy;
          if (cy >= 0 && cy < levelHeight && x >= 0 && x < levelWidth) {
            tiles[cy]![x] = TileType.EMPTY;
          }
        }
        // Corridor floor
        const floorCy = corridorY + 3;
        if (floorCy >= 0 && floorCy < levelHeight && x >= 0 && x < levelWidth) {
          tiles[floorCy]![x] = TileType.SOLID;
        }
        // Corridor ceiling
        const ceilCy = corridorY - 1;
        if (ceilCy >= 0 && ceilCy < levelHeight && x >= 0 && x < levelWidth) {
          tiles[ceilCy]![x] = TileType.SOLID;
        }
      }

      // Place doors at room boundaries
      const doorY = corridorY + 2; // just above floor
      if (doorY >= 0 && doorY < levelHeight) {
        tiles[doorY]![corridorStartX] = TileType.DOOR;
        tiles[doorY]![corridorEndX] = TileType.DOOR;
      }
    }
  }

  // Determine spawn points
  const firstRoom = roomPlacements[0]!;
  const lastRoom = roomPlacements[roomPlacements.length - 1]!;

  const playerSpawns: [number, number][] = [];
  for (let i = 0; i < 4; i++) {
    playerSpawns.push([
      (firstRoom.x + 3 + i * 2) * TILE_SIZE,
      (firstRoom.y + firstRoom.template.height - 2) * TILE_SIZE - 24, // above floor, accounting for player height
    ]);
  }

  const alienSpawn: [number, number] = [
    (lastRoom.x + Math.floor(lastRoom.template.width / 2)) * TILE_SIZE,
    (lastRoom.y + lastRoom.template.height - 2) * TILE_SIZE - 28, // above floor, accounting for alien height
  ];

  const map: LevelMap = {
    tiles,
    width: levelWidth,
    height: levelHeight,
    rooms,
    playerSpawns,
    alienSpawn,
  };

  return { map, seed: actualSeed };
}

/** Print an ASCII representation of the level for debugging */
export function printLevel(map: LevelMap): void {
  const chars: Record<number, string> = {
    [TileType.EMPTY]: " ",
    [TileType.SOLID]: "#",
    [TileType.WALL]: "█",
    [TileType.PLATFORM]: "=",
    [TileType.VENT]: "v",
    [TileType.DOOR]: "D",
    [TileType.HAZARD]: "!",
  };

  console.log(`Level: ${map.width}x${map.height} tiles, ${map.rooms.length} rooms`);
  for (let y = 0; y < map.height; y++) {
    let line = "";
    for (let x = 0; x < map.width; x++) {
      const tile = map.tiles[y]?.[x] ?? 0;
      line += chars[tile] ?? "?";
    }
    console.log(line);
  }
  console.log(`Rooms: ${map.rooms.map((r) => r.name).join(", ")}`);
}
