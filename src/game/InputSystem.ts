/**
 * Input System — manages keyboard state from WebSocket clients.
 *
 * In Phase 1 (prototype), also provides simulated AI input
 * for testing player movement without a real client.
 */

import type { InputState } from "./GameState";
import { createEmptyInput } from "./GameState";

/**
 * Raw key state received from WebSocket client.
 */
export interface RawKeyState {
  ArrowLeft?: boolean;
  ArrowRight?: boolean;
  ArrowUp?: boolean;
  Space?: boolean;
  KeyZ?: boolean;
  KeyX?: boolean;
  // WASD alternatives
  KeyA?: boolean;
  KeyD?: boolean;
  KeyW?: boolean;
}

/**
 * Convert raw key state into game InputState.
 * Tracks previous frame to detect "just pressed" events.
 */
export class InputManager {
  private prev: RawKeyState = {};
  private current: RawKeyState = {};

  /** Update with new key state from client */
  update(keys: RawKeyState): void {
    this.prev = { ...this.current };
    this.current = { ...keys };
  }

  /** Get the current InputState for a player */
  getInput(): InputState {
    const left =
      !!this.current.ArrowLeft || !!this.current.KeyA;
    const right =
      !!this.current.ArrowRight || !!this.current.KeyD;
    const jump =
      !!this.current.ArrowUp || !!this.current.Space || !!this.current.KeyW;
    const attack = !!this.current.KeyZ || !!this.current.KeyX;

    const prevJump =
      !!this.prev.ArrowUp || !!this.prev.Space || !!this.prev.KeyW;
    const prevAttack = !!this.prev.KeyZ || !!this.prev.KeyX;

    return {
      left,
      right,
      jump,
      jumpPressed: jump && !prevJump,
      attack,
      attackPressed: attack && !prevAttack,
    };
  }
}

/**
 * Simulated input for Phase 1 — the AI "player" that wanders around.
 * More interesting than random: it runs, jumps over gaps, and explores.
 */
export class SimulatedInput {
  private moveDir: -1 | 0 | 1 = 1;
  private jumpTimer = 0;
  private dirChangeTimer = 0;
  private jumpHeld = false;
  private prevJump = false;

  /** Generate input that makes the player run and jump around */
  tick(dt: number, grounded: boolean, vx: number): InputState {
    this.jumpTimer -= dt;
    this.dirChangeTimer -= dt;

    // Change direction occasionally
    if (this.dirChangeTimer <= 0) {
      this.dirChangeTimer = 1 + Math.random() * 3;
      this.moveDir = Math.random() > 0.3 ? (Math.random() > 0.5 ? 1 : -1) : 0;
    }

    // If stuck against a wall (low velocity but trying to move), reverse
    if (Math.abs(vx) < 5 && this.moveDir !== 0) {
      this.moveDir = (this.moveDir * -1) as -1 | 1;
      this.dirChangeTimer = 0.5 + Math.random() * 1;
    }

    // Jump periodically when grounded
    const wantJump = grounded && this.jumpTimer <= 0 && Math.random() > 0.7;
    if (wantJump) {
      this.jumpHeld = true;
      this.jumpTimer = 0.5 + Math.random() * 2;
    }

    // Release jump after a variable time (for variable jump height)
    if (this.jumpHeld && !grounded && Math.random() > 0.85) {
      this.jumpHeld = false;
    }
    if (grounded) {
      this.jumpHeld = false;
    }

    const jumpPressed = this.jumpHeld && !this.prevJump;
    this.prevJump = this.jumpHeld;

    return {
      left: this.moveDir === -1,
      right: this.moveDir === 1,
      jump: this.jumpHeld || wantJump,
      jumpPressed: jumpPressed || wantJump,
      attack: false,
      attackPressed: false,
    };
  }
}
