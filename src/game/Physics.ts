/**
 * Physics System — core constants and collision resolution for the platformer.
 *
 * Design-first approach (GMTK Platformer Toolkit):
 *   Pick JUMP_HEIGHT and TIME_TO_APEX, then derive gravity and jump velocity.
 *
 * All values in pixels and seconds. TILE_SIZE = 16px.
 */

// ── Tile & World ─────────────────────────────────────────────────

export const TILE_SIZE = 16;

// ── Jump Design (design-first) ───────────────────────────────────

/** Desired jump height in pixels (3.5 tiles) */
export const JUMP_HEIGHT = 3.5 * TILE_SIZE; // 56px

/** Time to reach the peak of a jump */
export const TIME_TO_APEX = 0.35; // seconds

/** Gravity derived from jump design: g = 2H / t² */
export const GRAVITY = (2 * JUMP_HEIGHT) / (TIME_TO_APEX * TIME_TO_APEX); // ≈914 px/s²

/** Jump velocity derived from jump design: v = 2H / t */
export const JUMP_VELOCITY = (2 * JUMP_HEIGHT) / TIME_TO_APEX; // ≈320 px/s

// ── Gravity Modifiers ────────────────────────────────────────────

/** Falling gravity multiplier — descent is faster than ascent (snappy feel) */
export const FALL_GRAVITY_MULT = 1.6;

/** Jump-cut gravity multiplier — release jump early for short hop */
export const JUMP_CUT_MULT = 3.0;

/** Maximum fall speed */
export const TERMINAL_VELOCITY = 480; // px/s

/** Apex hang — reduce gravity near jump peak for floaty apex */
export const APEX_THRESHOLD = 30; // px/s — if |vy| < this, we're near apex
export const APEX_GRAVITY_MULT = 0.5;

// ── Horizontal Movement ──────────────────────────────────────────

export const MAX_RUN_SPEED = 130; // px/s (~8 tiles/s)
export const RUN_ACCELERATION = 900; // px/s²
export const RUN_DECELERATION = 1200; // px/s²

/** Turning (reversing direction) is snappier than starting from rest */
export const TURN_ACCELERATION = 1500; // px/s²

/** Air control — fraction of ground acceleration */
export const AIR_ACCEL_MULT = 0.65;

// ── Forgiveness Mechanics ────────────────────────────────────────

/** Coyote time — can still jump this long after leaving a platform */
export const COYOTE_TIME = 0.1; // seconds

/** Jump buffer — jump input registered this long before landing */
export const JUMP_BUFFER_TIME = 0.1; // seconds

/** Corner correction — nudge up to this many pixels to clear a corner */
export const CORNER_CORRECTION_THRESHOLD = 4; // px

// ── AABB Types ───────────────────────────────────────────────────

export interface AABB {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Check if two AABBs overlap */
export function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** Get the overlap between two AABBs (returns null if no overlap) */
export function aabbOverlapRect(
  a: AABB,
  b: AABB
): { dx: number; dy: number } | null {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (overlapX <= 0 || overlapY <= 0) return null;
  return { dx: overlapX, dy: overlapY };
}

// ── Physics Body ─────────────────────────────────────────────────

export interface PhysicsBody {
  x: number; // top-left x in pixels
  y: number; // top-left y in pixels
  vx: number; // horizontal velocity px/s
  vy: number; // vertical velocity px/s (positive = downward)
  width: number; // hitbox width px
  height: number; // hitbox height px
  grounded: boolean;
}

/** Apply gravity to a physics body for one timestep */
export function applyGravity(
  body: PhysicsBody,
  dt: number,
  jumpHeld: boolean
): void {
  let gravMult = 1.0;

  if (body.vy > 0) {
    // Falling — heavier gravity
    gravMult = FALL_GRAVITY_MULT;
  } else if (body.vy < 0 && !jumpHeld) {
    // Rising but jump released — cut the jump short
    gravMult = JUMP_CUT_MULT;
  } else if (Math.abs(body.vy) < APEX_THRESHOLD) {
    // Near apex — floaty hang time
    gravMult = APEX_GRAVITY_MULT;
  }

  body.vy += GRAVITY * gravMult * dt;

  // Clamp to terminal velocity
  if (body.vy > TERMINAL_VELOCITY) {
    body.vy = TERMINAL_VELOCITY;
  }
}

// ── Tile Collision ───────────────────────────────────────────────

export const enum TileType {
  EMPTY = 0, // air — no collision
  SOLID = 1, // full solid block (floor/wall/ceiling)
  WALL = 2, // solid, visually distinct (hull)
  PLATFORM = 3, // one-way — only collide from above
  VENT = 4, // alien-only passage (solid for players)
  DOOR = 5, // togglable solid
  HAZARD = 6, // damage on contact
}

/** Check if a tile is solid for collision (from a given direction) */
export function isTileSolid(
  tile: number,
  fromAbove: boolean,
  isAlien: boolean
): boolean {
  switch (tile) {
    case TileType.EMPTY:
      return false;
    case TileType.SOLID:
    case TileType.WALL:
      return true;
    case TileType.PLATFORM:
      return fromAbove; // one-way: only solid when landing on top
    case TileType.VENT:
      return !isAlien; // solid for players, passable for alien
    case TileType.DOOR:
      return true; // handled dynamically by environment system
    case TileType.HAZARD:
      return false; // pass through but deal damage
    default:
      return false;
  }
}

/**
 * Resolve horizontal collisions against the tile map.
 * Moves body.x, then checks for overlapping solid tiles and pushes out.
 */
export function resolveCollisionX(
  body: PhysicsBody,
  tiles: number[][],
  mapWidth: number,
  mapHeight: number,
  isAlien: boolean,
  doorStates?: Map<string, string>
): void {
  // Determine which tile columns the body overlaps
  const left = Math.floor(body.x / TILE_SIZE);
  const right = Math.floor((body.x + body.width - 1) / TILE_SIZE);
  const top = Math.floor(body.y / TILE_SIZE);
  const bottom = Math.floor((body.y + body.height - 1) / TILE_SIZE);

  for (let ty = top; ty <= bottom; ty++) {
    for (let tx = left; tx <= right; tx++) {
      if (tx < 0 || tx >= mapWidth || ty < 0 || ty >= mapHeight) {
        // Out of bounds = solid wall
        pushOutX(body, tx);
        continue;
      }
      const tile = tiles[ty]?.[tx] ?? 0;

      // Skip non-solid tiles (platforms only block from above, not sides)
      if (tile === TileType.PLATFORM) continue;
      if (tile === TileType.EMPTY || tile === TileType.HAZARD) continue;
      if (tile === TileType.VENT && isAlien) continue;
      if (tile === TileType.DOOR && doorStates) {
        const state = doorStates.get(`${tx},${ty}`);
        if (state === "open") continue;
      }

      // Check overlap
      const tileBox: AABB = {
        x: tx * TILE_SIZE,
        y: ty * TILE_SIZE,
        width: TILE_SIZE,
        height: TILE_SIZE,
      };
      if (aabbOverlap(body, tileBox)) {
        pushOutX(body, tx);
      }
    }
  }
}

function pushOutX(body: PhysicsBody, tileX: number): void {
  const tileLeft = tileX * TILE_SIZE;
  const tileRight = tileLeft + TILE_SIZE;
  const bodyCenter = body.x + body.width / 2;

  if (bodyCenter < tileLeft + TILE_SIZE / 2) {
    // Push left (body is to the left of tile center)
    body.x = tileLeft - body.width;
    if (body.vx > 0) body.vx = 0;
  } else {
    // Push right
    body.x = tileRight;
    if (body.vx < 0) body.vx = 0;
  }
}

/**
 * Resolve vertical collisions against the tile map.
 * Moves body.y, then checks for overlapping solid tiles and pushes out.
 * Updates body.grounded.
 */
export function resolveCollisionY(
  body: PhysicsBody,
  tiles: number[][],
  mapWidth: number,
  mapHeight: number,
  isAlien: boolean,
  doorStates?: Map<string, string>
): void {
  body.grounded = false;

  const left = Math.floor(body.x / TILE_SIZE);
  const right = Math.floor((body.x + body.width - 1) / TILE_SIZE);
  const top = Math.floor(body.y / TILE_SIZE);
  const bottom = Math.floor((body.y + body.height - 1) / TILE_SIZE);

  for (let ty = top; ty <= bottom; ty++) {
    for (let tx = left; tx <= right; tx++) {
      if (tx < 0 || tx >= mapWidth || ty < 0 || ty >= mapHeight) {
        pushOutY(body, ty);
        continue;
      }
      const tile = tiles[ty]?.[tx] ?? 0;

      if (tile === TileType.EMPTY || tile === TileType.HAZARD) continue;
      if (tile === TileType.VENT && isAlien) continue;
      if (tile === TileType.DOOR && doorStates) {
        const state = doorStates.get(`${tx},${ty}`);
        if (state === "open") continue;
      }

      const tileBox: AABB = {
        x: tx * TILE_SIZE,
        y: ty * TILE_SIZE,
        width: TILE_SIZE,
        height: TILE_SIZE,
      };

      if (!aabbOverlap(body, tileBox)) continue;

      // One-way platforms: only collide if falling onto them from above
      if (tile === TileType.PLATFORM) {
        const bodyBottom = body.y + body.height;
        const tileSurface = ty * TILE_SIZE;
        // Only land if body was above the platform and moving down
        if (body.vy > 0 && bodyBottom - body.vy * (1 / 60) <= tileSurface + 2) {
          body.y = tileSurface - body.height;
          body.vy = 0;
          body.grounded = true;
        }
        continue;
      }

      pushOutY(body, ty);
    }
  }
}

function pushOutY(body: PhysicsBody, tileY: number): void {
  const tileTop = tileY * TILE_SIZE;
  const tileBottom = tileTop + TILE_SIZE;
  const bodyCenter = body.y + body.height / 2;

  if (bodyCenter < tileTop + TILE_SIZE / 2) {
    // Push up (landing on top of tile)
    body.y = tileTop - body.height;
    if (body.vy > 0) {
      body.vy = 0;
      body.grounded = true;
    }
  } else {
    // Push down (bonking head on ceiling)
    body.y = tileBottom;
    if (body.vy < 0) body.vy = 0;
  }
}

/**
 * Corner correction — if player barely clips the corner of a tile
 * when jumping, nudge them horizontally to clear it.
 */
export function cornerCorrection(
  body: PhysicsBody,
  tiles: number[][],
  mapWidth: number,
  mapHeight: number,
  isAlien: boolean
): void {
  // Only apply when moving upward (jumping into corners)
  if (body.vy >= 0) return;

  const top = Math.floor(body.y / TILE_SIZE);
  const left = Math.floor(body.x / TILE_SIZE);
  const right = Math.floor((body.x + body.width - 1) / TILE_SIZE);

  // Check tile directly above left and right edges
  for (const tx of [left, right]) {
    if (tx < 0 || tx >= mapWidth || top < 0 || top >= mapHeight) continue;
    const tile = tiles[top]?.[tx] ?? 0;
    if (!isTileSolid(tile, false, isAlien)) continue;

    const tileBox: AABB = {
      x: tx * TILE_SIZE,
      y: top * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
    };

    if (!aabbOverlap(body, tileBox)) continue;

    // How much are we overlapping horizontally?
    const overlapLeft = body.x + body.width - tileBox.x;
    const overlapRight = tileBox.x + tileBox.width - body.x;
    const minOverlap = Math.min(overlapLeft, overlapRight);

    if (minOverlap <= CORNER_CORRECTION_THRESHOLD) {
      // Nudge the body horizontally to clear the corner
      if (overlapLeft < overlapRight) {
        body.x -= overlapLeft;
      } else {
        body.x += overlapRight;
      }
      return; // only correct once per frame
    }
  }
}
