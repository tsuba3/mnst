import { AimState } from "./input";
import { CircleBody, GameState } from "./types";

export type RenderOptions = {
  debug: boolean;
  aim: AimState;
  activePlayerId: string | null;
};

const COLORS = {
  bg: "#131a2b",
  grid: "rgba(255,255,255,0.04)",
  player: "#5eead4",
  playerActive: "#fde68a",
  ally: "#93c5fd",
  enemy: "#f97373",
  enemyDead: "#3a3a44",
  hpBack: "rgba(0,0,0,0.5)",
  hpFront: "#22d3ee",
  aim: "rgba(253,230,138,0.85)",
  aimGuide: "rgba(253,230,138,0.35)",
  text: "#e8ecf4",
  hit: "#ffffff",
};

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  opts: RenderOptions,
): void {
  const { width, height } = state;
  ctx.clearRect(0, 0, width, height);

  // 背景
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);
  drawGrid(ctx, width, height);

  // ボディ
  for (const b of state.bodies) {
    drawBody(ctx, b, b.id === opts.activePlayerId);
  }

  // 照準
  if (opts.aim.active) {
    drawAim(ctx, opts.aim, state, opts.activePlayerId);
  }

  // デバッグ表示
  if (opts.debug) {
    drawDebug(ctx, state);
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  const step = 40;
  ctx.beginPath();
  for (let x = step; x < width; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = step; y < height; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  b: CircleBody,
  isActive: boolean,
): void {
  const dead = b.hp <= 0;
  let fill = COLORS.ally;
  if (b.kind === "player") fill = isActive ? COLORS.playerActive : COLORS.player;
  if (b.kind === "ally") fill = COLORS.ally;
  if (b.kind === "enemy") fill = dead ? COLORS.enemyDead : COLORS.enemy;

  ctx.beginPath();
  ctx.fillStyle = fill;
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  ctx.fill();

  if (b.pierce && b.kind !== "enemy") {
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.stroke();
  }

  if (!dead) {
    drawHpBar(ctx, b);
  }

  ctx.fillStyle = COLORS.text;
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(b.id, b.x, b.y);
}

function drawHpBar(ctx: CanvasRenderingContext2D, b: CircleBody): void {
  const w = b.r * 2;
  const h = 4;
  const x = b.x - b.r;
  const y = b.y - b.r - 8;
  ctx.fillStyle = COLORS.hpBack;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = b.kind === "enemy" ? "#fda4af" : COLORS.hpFront;
  ctx.fillRect(x, y, (w * b.hp) / b.maxHp, h);
}

function drawAim(
  ctx: CanvasRenderingContext2D,
  aim: AimState,
  state: GameState,
  activePlayerId: string | null,
): void {
  const player = state.bodies.find((b) => b.id === activePlayerId);
  if (!player) return;

  // ひっぱり方向 = 引いた方向の逆 = (start - current)
  const dx = aim.startX - aim.currentX;
  const dy = aim.startY - aim.currentY;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len;
  const uy = dy / len;

  const guideLen = Math.min(len * 1.5, 600);

  ctx.strokeStyle = COLORS.aimGuide;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(player.x + ux * guideLen, player.y + uy * guideLen);
  ctx.stroke();
  ctx.setLineDash([]);

  // 矢印頭
  const ah = 10;
  const tx = player.x + ux * guideLen;
  const ty = player.y + uy * guideLen;
  ctx.strokeStyle = COLORS.aim;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - ux * ah - uy * ah * 0.6, ty - uy * ah + ux * ah * 0.6);
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - ux * ah + uy * ah * 0.6, ty - uy * ah - ux * ah * 0.6);
  ctx.stroke();

  // ドラッグ点
  ctx.beginPath();
  ctx.fillStyle = COLORS.aim;
  ctx.arc(aim.currentX, aim.currentY, 6, 0, Math.PI * 2);
  ctx.fill();
}

function drawDebug(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.save();
  ctx.font = "11px ui-monospace, monospace";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  let y = 28;
  ctx.fillText(`tick=${state.tick} phase=${state.phase} turn=${state.turn}`, 8, y);
  y += 14;
  for (const b of state.bodies) {
    if (b.hp <= 0) continue;
    const sp = Math.hypot(b.vx, b.vy).toFixed(0);
    ctx.fillText(
      `${b.id} (${b.x.toFixed(0)},${b.y.toFixed(0)}) v=${sp} hp=${b.hp}/${b.maxHp}`,
      8,
      y,
    );
    y += 12;
  }

  // 速度ベクトル
  for (const b of state.bodies) {
    if (b.hp <= 0) continue;
    if (b.vx === 0 && b.vy === 0) continue;
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + b.vx * 0.1, b.y + b.vy * 0.1);
    ctx.stroke();
  }
  ctx.restore();
}
