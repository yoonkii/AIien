/**
 * Spectator Server — WebSocket server with side-scrolling platformer renderer.
 *
 * Broadcasts game state + camera to connected browser clients.
 * The browser renders a 2D side-view canvas with tile map, entities, and HUD.
 * Also accepts keyboard input from clients (for future real player control).
 */

import type { GameState } from "../game/GameState";
import type { Camera } from "../game/Camera";
import { TILE_SIZE } from "../game/Physics";
import { getRoomAtWorld } from "../game/TileMap";

interface SpectatorPayload {
  tick: number;
  camera: { x: number; y: number; width: number; height: number };
  map: {
    tiles: number[][];
    width: number;
    height: number;
  };
  alien: {
    x: number;
    y: number;
    width: number;
    height: number;
    hp: number;
    maxHp: number;
    strategy: string;
    facing: string;
    attacking: boolean;
  };
  players: Array<{
    nickname: string;
    x: number;
    y: number;
    width: number;
    height: number;
    hp: number;
    maxHp: number;
    state: string;
    facing: string;
    attacking: boolean;
    invincible: boolean;
  }>;
  environment: {
    power: boolean;
    darkRooms: string[];
  };
  director: {
    strategy: string;
    innerMonologue: string;
    reasoning: string;
  } | null;
}

export class SpectatorServer {
  private server: ReturnType<typeof Bun.serve> | null = null;
  private sockets = new Set<any>();

  start(port: number) {
    this.server = Bun.serve({
      port,
      fetch: (req, server) => {
        if (server.upgrade(req)) return;
        return new Response(SPECTATOR_HTML, {
          headers: { "Content-Type": "text/html" },
        });
      },
      websocket: {
        open: (ws) => {
          this.sockets.add(ws);
        },
        close: (ws) => {
          this.sockets.delete(ws);
        },
        message: (_ws, _msg) => {
          // Future: handle keyboard input from clients
        },
      },
    });
  }

  stop() {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
  }

  broadcast(state: GameState, camera: Camera) {
    if (this.sockets.size === 0) return;

    const darkRooms: string[] = [];
    for (const [roomId, lit] of state.environment.lights) {
      if (!lit) darkRooms.push(roomId);
    }

    const payload: SpectatorPayload = {
      tick: state.tick,
      camera: {
        x: Math.round(camera.x),
        y: Math.round(camera.y),
        width: camera.width,
        height: camera.height,
      },
      map: {
        tiles: state.map.tiles,
        width: state.map.width,
        height: state.map.height,
      },
      alien: {
        x: Math.round(state.alien.x),
        y: Math.round(state.alien.y),
        width: state.alien.width,
        height: state.alien.height,
        hp: Math.round(state.alien.hp),
        maxHp: state.alien.maxHp,
        strategy: state.alien.strategy,
        facing: state.alien.facing,
        attacking: state.alien.attackTimer > 0,
      },
      players: state.players.map((p) => ({
        nickname: p.nickname,
        x: Math.round(p.x),
        y: Math.round(p.y),
        width: p.width,
        height: p.height,
        hp: p.hp,
        maxHp: p.maxHp,
        state: p.state,
        facing: p.facing,
        attacking: p.attackTimer > 0,
        invincible: p.invincibleTimer > 0,
      })),
      environment: {
        power: state.environment.power,
        darkRooms,
      },
      director: state.lastDirectorDecision
        ? {
            strategy: state.lastDirectorDecision.strategy,
            innerMonologue: state.lastDirectorDecision.innerMonologue,
            reasoning: state.lastDirectorDecision.reasoning,
          }
        : null,
    };

    const json = JSON.stringify(payload);
    for (const ws of this.sockets) {
      try {
        ws.send(json);
      } catch {
        this.sockets.delete(ws);
      }
    }
  }
}

// ── Inline HTML for the spectator viewer ────────────────────────

const SPECTATOR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AIien — Spectator</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0A0E17;
      color: #CBD5E0;
      font-family: 'IBM Plex Mono', monospace;
      display: flex;
      height: 100vh;
      overflow: hidden;
    }
    #game-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      position: relative;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
      image-rendering: pixelated;
    }
    /* CRT scanline overlay */
    #scanlines {
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0,0,0,0.03) 2px,
        rgba(0,0,0,0.03) 4px
      );
    }
    #sidebar {
      width: 280px;
      background: #0F1420;
      padding: 12px;
      overflow-y: auto;
      border-left: 1px solid #2D3748;
      font-size: 11px;
      line-height: 1.5;
    }
    .section { margin-bottom: 12px; }
    .section-title {
      color: #38B2AC;
      font-weight: 700;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 4px;
    }
    .alien-info { color: #C53030; }
    .player-info { color: #38B2AC; }
    .monologue {
      color: #C53030;
      font-style: italic;
      border-left: 2px solid #C53030;
      padding-left: 8px;
      margin: 4px 0;
    }
    .reasoning {
      color: #38B2AC;
      border-left: 2px solid #38B2AC;
      padding-left: 8px;
      margin: 4px 0;
    }
    .hp-bar {
      height: 4px;
      background: #2D3748;
      margin: 2px 0;
      border-radius: 2px;
    }
    .hp-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.3s;
    }
    #status-bar {
      position: absolute;
      bottom: 8px;
      left: 8px;
      color: #4A5568;
      font-size: 10px;
    }
  </style>
</head>
<body>
  <div id="game-container">
    <canvas id="canvas"></canvas>
    <div id="scanlines"></div>
    <div id="status-bar">Connecting...</div>
  </div>
  <div id="sidebar">
    <div class="section">
      <div class="section-title">AIien — Director's Cut</div>
      <div style="color: #4A5568; font-size: 10px;">Side-scrolling Platformer View</div>
    </div>
    <div id="alien-panel" class="section"></div>
    <div id="player-panel" class="section"></div>
    <div id="director-panel" class="section"></div>
    <div id="env-panel" class="section"></div>
  </div>

  <script>
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const TILE = ${TILE_SIZE};

    // Colors from DESIGN.md
    const COLORS = {
      void: '#0A0E17',
      solid: '#1A2030',
      wall: '#2D3748',
      platform: '#4A5568',
      vent: '#553C9A',
      door: '#E8930C',
      hazard: '#C53030',
      player: '#38B2AC',
      playerHurt: '#63B3ED',
      alien: '#C53030',
      alienGlow: '#E8930C',
      attackBox: 'rgba(232, 147, 12, 0.4)',
      bg: '#0A0E17',
    };

    let lastState = null;

    function resize() {
      const container = canvas.parentElement;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    function render(state) {
      const { camera, map, alien, players, environment } = state;
      const scaleX = canvas.width / camera.width;
      const scaleY = canvas.height / camera.height;
      const scale = Math.min(scaleX, scaleY);

      ctx.save();
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.translate(-camera.x, -camera.y);

      // ── Draw tiles ────────────────────────────────────
      const startTX = Math.floor(camera.x / TILE);
      const endTX = Math.ceil((camera.x + camera.width) / TILE);
      const startTY = Math.floor(camera.y / TILE);
      const endTY = Math.ceil((camera.y + camera.height) / TILE);

      for (let ty = startTY; ty <= endTY; ty++) {
        for (let tx = startTX; tx <= endTX; tx++) {
          if (ty < 0 || ty >= map.height || tx < 0 || tx >= map.width) continue;
          const tile = map.tiles[ty]?.[tx] ?? 0;
          if (tile === 0) continue; // skip empty

          const colors = [null, COLORS.solid, COLORS.wall, COLORS.platform, COLORS.vent, COLORS.door, COLORS.hazard];
          const color = colors[tile] || COLORS.solid;
          ctx.fillStyle = color;
          ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);

          // Platform indicator (top line)
          if (tile === 3) {
            ctx.fillStyle = '#718096';
            ctx.fillRect(tx * TILE, ty * TILE, TILE, 2);
          }
        }
      }

      // ── Draw players ──────────────────────────────────
      for (const p of players) {
        if (p.state === 'dead') continue;

        // Flash when invincible
        if (p.invincible && Math.floor(state.tick / 4) % 2 === 0) continue;

        ctx.fillStyle = COLORS.player;
        ctx.fillRect(p.x, p.y, p.width, p.height);

        // Eyes (facing direction indicator)
        const eyeX = p.facing === 'right' ? p.x + p.width - 4 : p.x + 1;
        ctx.fillStyle = '#E2E8F0';
        ctx.fillRect(eyeX, p.y + 4, 3, 3);

        // Attack hitbox visualization
        if (p.attacking) {
          ctx.fillStyle = COLORS.attackBox;
          const atkX = p.facing === 'right' ? p.x + p.width : p.x - 24;
          ctx.fillRect(atkX, p.y + 4, 24, 16);
        }

        // Nickname
        ctx.fillStyle = COLORS.player;
        ctx.font = '7px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(p.nickname, p.x + p.width / 2, p.y - 3);

        // HP bar
        const hpW = p.width + 4;
        const hpX = p.x - 2;
        const hpY = p.y - 8;
        ctx.fillStyle = '#2D3748';
        ctx.fillRect(hpX, hpY, hpW, 3);
        ctx.fillStyle = p.hp > 50 ? '#38B2AC' : p.hp > 25 ? '#E8930C' : '#C53030';
        ctx.fillRect(hpX, hpY, hpW * (p.hp / p.maxHp), 3);
      }

      // ── Draw alien ────────────────────────────────────
      if (alien.hp > 0) {
        // Glow effect
        ctx.fillStyle = 'rgba(197, 48, 48, 0.15)';
        ctx.fillRect(alien.x - 4, alien.y - 4, alien.width + 8, alien.height + 8);

        ctx.fillStyle = COLORS.alien;
        ctx.fillRect(alien.x, alien.y, alien.width, alien.height);

        // Eyes
        const eyeX = alien.facing === 'right' ? alien.x + alien.width - 6 : alien.x + 2;
        ctx.fillStyle = '#E8930C';
        ctx.fillRect(eyeX, alien.y + 5, 4, 3);

        // Attack hitbox
        if (alien.attacking) {
          ctx.fillStyle = 'rgba(197, 48, 48, 0.4)';
          const atkX = alien.facing === 'right' ? alien.x + alien.width : alien.x - 32;
          ctx.fillRect(atkX, alien.y + 2, 32, 24);
        }

        // HP bar
        const hpW = alien.width + 8;
        const hpX = alien.x - 4;
        const hpY = alien.y - 10;
        ctx.fillStyle = '#2D3748';
        ctx.fillRect(hpX, hpY, hpW, 4);
        ctx.fillStyle = '#C53030';
        ctx.fillRect(hpX, hpY, hpW * (alien.hp / alien.maxHp), 4);

        // Strategy label
        ctx.fillStyle = '#C53030';
        ctx.font = '6px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(alien.strategy.toUpperCase(), alien.x + alien.width / 2, alien.y - 14);
      }

      ctx.restore();

      // ── Darkness overlay for dark rooms ────────────────
      if (!environment.power) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    function updateSidebar(state) {
      const { alien, players, director, environment } = state;

      // Alien panel
      document.getElementById('alien-panel').innerHTML =
        '<div class="section-title alien-info">Alien</div>' +
        '<div>Strategy: <strong>' + alien.strategy + '</strong></div>' +
        '<div>HP: ' + alien.hp + '/' + alien.maxHp + '</div>' +
        '<div class="hp-bar"><div class="hp-fill" style="width:' + (alien.hp/alien.maxHp*100) + '%;background:#C53030"></div></div>' +
        '<div>Facing: ' + alien.facing + '</div>';

      // Players panel
      let playerHtml = '<div class="section-title player-info">Crew</div>';
      for (const p of players) {
        const hpPct = (p.hp / p.maxHp * 100);
        const hpColor = p.hp > 50 ? '#38B2AC' : p.hp > 25 ? '#E8930C' : '#C53030';
        playerHtml += '<div>' + p.nickname + ': ' + (p.state === 'dead' ? '<span style="color:#C53030">DEAD</span>' : p.state) + '</div>';
        playerHtml += '<div class="hp-bar"><div class="hp-fill" style="width:' + hpPct + '%;background:' + hpColor + '"></div></div>';
      }
      document.getElementById('player-panel').innerHTML = playerHtml;

      // Director panel
      if (director) {
        document.getElementById('director-panel').innerHTML =
          '<div class="section-title">Director AI</div>' +
          '<div>Strategy: ' + director.strategy + '</div>' +
          '<div class="monologue">"' + director.innerMonologue.slice(0, 120) + '"</div>' +
          '<div class="reasoning">' + director.reasoning.slice(0, 120) + '</div>';
      }

      // Environment panel
      const darkCount = environment.darkRooms.length;
      document.getElementById('env-panel').innerHTML =
        '<div class="section-title">Environment</div>' +
        '<div>Power: ' + (environment.power ? 'ON' : '<span style="color:#C53030">OFF</span>') + '</div>' +
        '<div>Dark rooms: ' + darkCount + '</div>';
    }

    // ── WebSocket connection ────────────────────────────
    function connect() {
      const ws = new WebSocket('ws://' + location.host);
      ws.onopen = () => {
        document.getElementById('status-bar').textContent = 'Connected — spectating';
      };
      ws.onmessage = (e) => {
        const state = JSON.parse(e.data);
        lastState = state;
        render(state);
        updateSidebar(state);
        document.getElementById('status-bar').textContent = 'Tick: ' + state.tick;
      };
      ws.onclose = () => {
        document.getElementById('status-bar').textContent = 'Disconnected — reconnecting...';
        setTimeout(connect, 2000);
      };
    }
    connect();
  </script>
</body>
</html>`;
