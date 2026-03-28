/**
 * Camera — smooth scrolling viewport for the side-scrolling view.
 *
 * Features:
 *   - Smooth lerp following
 *   - Horizontal lookahead (in facing direction)
 *   - Level bounds clamping
 *   - Configurable viewport size
 */

import { TILE_SIZE } from "./Physics";

export interface Camera {
  /** Top-left of the viewport in world pixels */
  x: number;
  y: number;
  /** Viewport dimensions in pixels */
  width: number;
  height: number;
}

/** Default viewport: 50 tiles wide × 30 tiles tall */
export const VIEWPORT_WIDTH = 50 * TILE_SIZE; // 800px
export const VIEWPORT_HEIGHT = 30 * TILE_SIZE; // 480px

export function createCamera(): Camera {
  return {
    x: 0,
    y: 0,
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
  };
}

/**
 * Update camera to follow a target entity.
 *
 * @param camera The camera to update
 * @param targetX Center X of the entity to follow (pixels)
 * @param targetY Center Y of the entity to follow (pixels)
 * @param facing Entity facing direction for lookahead
 * @param levelWidth Total level width in pixels
 * @param levelHeight Total level height in pixels
 * @param dt Delta time
 */
export function updateCamera(
  camera: Camera,
  targetX: number,
  targetY: number,
  facing: "left" | "right",
  levelWidth: number,
  levelHeight: number,
  dt: number
): void {
  // Lookahead — camera leads slightly in the direction the player faces
  const lookaheadX = facing === "right" ? 40 : -40;
  const lookaheadY = 0; // could add vertical lookahead if desired

  // Desired camera center
  const desiredX = targetX + lookaheadX - camera.width / 2;
  const desiredY = targetY + lookaheadY - camera.height / 2;

  // Smooth follow (lerp)
  const lerpFactor = 1 - Math.pow(0.001, dt); // ~0.1 smoothing
  camera.x += (desiredX - camera.x) * lerpFactor;
  camera.y += (desiredY - camera.y) * lerpFactor;

  // Clamp to level bounds
  camera.x = Math.max(0, Math.min(levelWidth - camera.width, camera.x));
  camera.y = Math.max(0, Math.min(levelHeight - camera.height, camera.y));
}

/**
 * Convert world coordinates to screen coordinates relative to camera.
 */
export function worldToScreen(
  camera: Camera,
  worldX: number,
  worldY: number
): { sx: number; sy: number } {
  return {
    sx: worldX - camera.x,
    sy: worldY - camera.y,
  };
}

/**
 * Check if a world-space rectangle is visible in the camera viewport.
 */
export function isVisible(
  camera: Camera,
  x: number,
  y: number,
  width: number,
  height: number
): boolean {
  return (
    x + width > camera.x &&
    x < camera.x + camera.width &&
    y + height > camera.y &&
    y < camera.y + camera.height
  );
}
