/**
 * Spectator Server — WebSocket server pushing game state to browser viewers.
 * Phase 1: localhost debug window showing full map + AI reasoning.
 */

import type { GameState } from "../game/GameState";
import { getRoomAt } from "../game/TileMap";

interface SpectatorPayload {
  tick: number;
  alien: {
    x: number;
    y: number;
    hp: number;
    strategy: string;
    targetPlayer: string | null;
    room: string;
  };
  players: Array<{
    nickname: string;
    x: number;
    y: number;
    hp: number;
    weapon: string;
    state: string;
    room: string;
  }>;
  environment: {
    lights: Record<string, boolean>;
    power: boolean;
  };
  director: {
    strategy: string;
    targetPlayer: string | null;
    reasoning: string;
    innerMonologue: string;
    environmentActions: Array<{ actionType: string; room: string; value: string }>;
  } | null;
  gameOver: boolean;
  gameResult: string | null;
}

function buildPayload(state: GameState): SpectatorPayload {
  const alienRoom = getRoomAt(state.map, state.alien.x, state.alien.y);
  const lights: Record<string, boolean> = {};
  state.environment.lights.forEach((v, k) => (lights[k] = v));

  return {
    tick: state.tick,
    alien: {
      x: state.alien.x,
      y: state.alien.y,
      hp: state.alien.hp,
      strategy: state.alien.strategy,
      targetPlayer: state.alien.targetPlayer,
      room: alienRoom?.name ?? "unknown",
    },
    players: state.players.map((p) => {
      const pRoom = getRoomAt(state.map, p.x, p.y);
      return {
        nickname: p.nickname,
        x: p.x,
        y: p.y,
        hp: p.hp,
        weapon: p.weapon,
        state: p.state,
        room: pRoom?.name ?? "unknown",
      };
    }),
    environment: { lights, power: state.environment.power },
    director: state.lastDirectorDecision
      ? {
          strategy: state.lastDirectorDecision.strategy,
          targetPlayer: state.lastDirectorDecision.targetPlayer,
          reasoning: state.lastDirectorDecision.reasoning,
          innerMonologue: state.lastDirectorDecision.innerMonologue,
          environmentActions: state.lastDirectorDecision.environmentActions,
        }
      : null,
    gameOver: state.gameOver,
    gameResult: state.gameResult,
  };
}

export class SpectatorServer {
  private clients = new Set<any>(); // Bun WebSocket instances
  private server: ReturnType<typeof Bun.serve> | null = null;

  start(port: number) {
    this.server = Bun.serve({
      port,
      fetch(req, server) {
        const url = new URL(req.url);

        // Serve the spectator HTML page
        if (url.pathname === "/" || url.pathname === "/spectator") {
          return new Response(SPECTATOR_HTML, {
            headers: { "Content-Type": "text/html" },
          });
        }

        // WebSocket upgrade
        if (url.pathname === "/ws") {
          const success = server.upgrade(req);
          if (success) return undefined;
          return new Response("WebSocket upgrade failed", { status: 400 });
        }

        return new Response("Not found", { status: 404 });
      },
      websocket: {
        open: (ws) => {
          this.clients.add(ws);
          console.log(`[Spectator] Client connected (${this.clients.size} total)`);
        },
        close: (ws) => {
          this.clients.delete(ws);
          console.log(`[Spectator] Client disconnected (${this.clients.size} total)`);
        },
        message: () => {}, // spectators don't send messages
      },
    });

    console.log(`[Spectator] Server running at http://localhost:${port}`);
  }

  /** Broadcast game state to all connected spectators */
  broadcast(state: GameState) {
    if (this.clients.size === 0) return;
    const payload = JSON.stringify(buildPayload(state));
    for (const client of this.clients) {
      try {
        client.send(payload);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  stop() {
    this.server?.stop();
  }
}

// ── Spectator HTML (inline, self-contained) ──────────────────────
const SPECTATOR_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>AIien — Spectator</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0A0E17;
    color: #CBD5E0;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    overflow: hidden;
    height: 100vh;
  }
  body::after {
    content: '';
    position: fixed;
    inset: 0;
    background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px);
    pointer-events: none;
    z-index: 1000;
  }
  .container { display: grid; grid-template-columns: 1fr 340px; height: 100vh; }
  .map-panel { padding: 16px; overflow: hidden; }
  .sidebar {
    background: #0F1420;
    border-left: 1px solid #2D3748;
    overflow-y: auto;
    padding: 12px;
  }
  .section-title {
    font-size: 9px;
    color: #E8930C;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin: 12px 0 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #2D3748;
  }
  .section-title:first-child { margin-top: 0; }
  canvas { image-rendering: pixelated; }
  .stat { display: flex; justify-content: space-between; padding: 3px 0; }
  .stat-label { color: #718096; }
  .stat-value { color: #CBD5E0; }
  .stat-value.amber { color: #E8930C; }
  .stat-value.teal { color: #38B2AC; }
  .stat-value.red { color: #C53030; }
  .reasoning {
    background: rgba(56,178,172,0.05);
    border-left: 2px solid #2C8C87;
    padding: 8px;
    margin: 4px 0;
    line-height: 1.5;
    color: #A0AEC0;
    font-size: 11px;
  }
  .monologue {
    background: rgba(197,48,48,0.05);
    border-left: 2px solid #C53030;
    padding: 8px;
    margin: 4px 0;
    font-style: italic;
    line-height: 1.5;
    color: #A0AEC0;
    font-size: 11px;
  }
  .player-card {
    background: #1A2030;
    border: 1px solid #2D3748;
    border-radius: 2px;
    padding: 8px;
    margin: 4px 0;
  }
  .player-name { color: #38B2AC; font-weight: 600; }
  .env-action {
    background: rgba(232,147,12,0.08);
    border-left: 2px solid #E8930C;
    padding: 4px 8px;
    margin: 2px 0;
    font-size: 10px;
    color: #E8930C;
  }
  #status { color: #718096; font-size: 10px; padding: 4px; }
  .history { max-height: 200px; overflow-y: auto; }
</style>
</head>
<body>
<div class="container">
  <div class="map-panel">
    <canvas id="map" width="640" height="320"></canvas>
    <div id="status">Connecting...</div>
  </div>
  <div class="sidebar" id="sidebar">
    <div class="section-title">Director AI</div>
    <div id="director-info">Waiting for first decision...</div>
    <div class="section-title">Players</div>
    <div id="player-info"></div>
    <div class="section-title">Alien</div>
    <div id="alien-info"></div>
    <div class="section-title">Environment</div>
    <div id="env-info"></div>
    <div class="section-title">Decision History</div>
    <div id="history" class="history"></div>
  </div>
</div>
<script>
const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');
const TILE = 16;
let lastState = null;
const decisionHistory = [];

const COLORS = {
  void: '#060810',
  floor: '#1A2030',
  floorDark: '#0D1218',
  wall: '#2D3748',
  door: '#E8930C',
  doorLocked: '#C53030',
  vent: '#4A5568',
  player: '#38B2AC',
  alien: '#C53030',
};

function drawMap(state) {
  if (!state) return;
  ctx.fillStyle = COLORS.void;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // We don't have full tile data in the payload, so draw rooms as rectangles
  // This is a simplified spectator view
  const roomPositions = {
    engine_bay: { x: 0, y: 0, w: 12, h: 8 },
    corridor_b: { x: 12, y: 2, w: 10, h: 4 },
    bridge: { x: 22, y: 0, w: 10, h: 7 },
    cargo_bay: { x: 0, y: 10, w: 12, h: 7 },
    corridor_a: { x: 12, y: 11, w: 10, h: 4 },
    medbay: { x: 22, y: 10, w: 10, h: 7 },
  };

  for (const [id, r] of Object.entries(roomPositions)) {
    const lit = state.environment.lights[id] !== false && state.environment.power;
    ctx.fillStyle = lit ? COLORS.floor : COLORS.floorDark;
    ctx.fillRect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE);
    ctx.strokeStyle = COLORS.wall;
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE);

    // Room label
    ctx.fillStyle = '#4A5568';
    ctx.font = '9px IBM Plex Mono';
    ctx.fillText(id.replace('_', ' ').toUpperCase(), r.x * TILE + 4, r.y * TILE + 12);
  }

  // Draw players
  for (const p of state.players) {
    if (p.state === 'dead') continue;
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(p.x * TILE + TILE/2, p.y * TILE + TILE/2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#38B2AC';
    ctx.font = '9px IBM Plex Mono';
    ctx.fillText(p.nickname, p.x * TILE - 4, p.y * TILE - 4);
  }

  // Draw alien
  ctx.fillStyle = COLORS.alien;
  ctx.beginPath();
  ctx.arc(state.alien.x * TILE + TILE/2, state.alien.y * TILE + TILE/2, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#C53030';
  ctx.font = 'bold 10px IBM Plex Mono';
  ctx.fillText('ALIEN', state.alien.x * TILE - 8, state.alien.y * TILE - 6);
}

function updateSidebar(state) {
  // Director
  const di = document.getElementById('director-info');
  if (state.director) {
    const d = state.director;
    di.innerHTML = \`
      <div class="stat"><span class="stat-label">Strategy</span><span class="stat-value amber">\${d.strategy.toUpperCase()}</span></div>
      <div class="stat"><span class="stat-label">Target</span><span class="stat-value">\${d.targetPlayer || 'none'}</span></div>
      \${d.reasoning ? '<div class="reasoning">' + d.reasoning + '</div>' : ''}
      \${d.innerMonologue ? '<div class="monologue">"' + d.innerMonologue + '"</div>' : ''}
      \${d.environmentActions.map(a => '<div class="env-action">' + a.actionType + ' ' + a.room + ' → ' + a.value + '</div>').join('')}
    \`;
  }

  // Players
  const pi = document.getElementById('player-info');
  pi.innerHTML = state.players.map(p => \`
    <div class="player-card">
      <div class="player-name">\${p.nickname}</div>
      <div class="stat"><span class="stat-label">HP</span><span class="stat-value \${p.hp < 30 ? 'red' : 'teal'}">\${p.hp}/100</span></div>
      <div class="stat"><span class="stat-label">Room</span><span class="stat-value">\${p.room}</span></div>
      <div class="stat"><span class="stat-label">State</span><span class="stat-value">\${p.state}</span></div>
    </div>
  \`).join('');

  // Alien
  const ai = document.getElementById('alien-info');
  ai.innerHTML = \`
    <div class="stat"><span class="stat-label">HP</span><span class="stat-value \${state.alien.hp < 40 ? 'red' : ''}">\${state.alien.hp}/100</span></div>
    <div class="stat"><span class="stat-label">Room</span><span class="stat-value">\${state.alien.room}</span></div>
    <div class="stat"><span class="stat-label">Position</span><span class="stat-value">(\${state.alien.x}, \${state.alien.y})</span></div>
  \`;

  // Environment
  const ei = document.getElementById('env-info');
  const lightEntries = Object.entries(state.environment.lights)
    .map(([room, on]) => '<div class="stat"><span class="stat-label">' + room + '</span><span class="stat-value ' + (on ? 'teal' : 'red') + '">' + (on ? 'LIT' : 'DARK') + '</span></div>')
    .join('');
  ei.innerHTML = \`
    <div class="stat"><span class="stat-label">Power</span><span class="stat-value \${state.environment.power ? 'teal' : 'red'}">\${state.environment.power ? 'ON' : 'OFF'}</span></div>
    \${lightEntries}
  \`;

  // Status
  document.getElementById('status').textContent = \`Tick: \${state.tick} | Players: \${state.players.filter(p => p.state !== 'dead').length} alive\`;
}

// WebSocket
const ws = new WebSocket('ws://' + location.host + '/ws');
ws.onopen = () => { document.getElementById('status').textContent = 'Connected'; };
ws.onclose = () => { document.getElementById('status').textContent = 'Disconnected'; };
ws.onmessage = (e) => {
  const state = JSON.parse(e.data);
  lastState = state;
  drawMap(state);
  updateSidebar(state);

  // Track decision history
  if (state.director) {
    const last = decisionHistory[0];
    if (!last || last.strategy !== state.director.strategy || last.innerMonologue !== state.director.innerMonologue) {
      decisionHistory.unshift({ tick: state.tick, ...state.director });
      if (decisionHistory.length > 20) decisionHistory.pop();
      const hDiv = document.getElementById('history');
      hDiv.innerHTML = decisionHistory.map(d =>
        '<div style="margin-bottom:8px;padding:4px;border-bottom:1px solid #1A2030">' +
        '<div style="color:#718096;font-size:9px">T+' + d.tick + ' — ' + d.strategy.toUpperCase() + '</div>' +
        (d.innerMonologue ? '<div class="monologue" style="margin:2px 0">"' + d.innerMonologue + '"</div>' : '') +
        '</div>'
      ).join('');
    }
  }
};
</script>
</body>
</html>`;
