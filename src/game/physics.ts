import { CircleBody, GameEvent } from "./types";

export const FIXED_DT = 1 / 60;
export const STOP_SPEED = 18;
export const DAMPING_PER_SEC = 1.6;
export const MAX_SPEED = 1400;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function length(x: number, y: number): number {
  return Math.hypot(x, y);
}

// 1ステップ分の物理。dt は固定。push されたイベントを events に追加する。
// 戻り値: すべての player/ally が停止していれば true。
export function stepPhysics(
  bodies: CircleBody[],
  width: number,
  height: number,
  dt: number,
  turn: number,
  events: GameEvent[],
): boolean {
  // 1) 移動 + 速度上限
  for (const b of bodies) {
    if (b.hp <= 0) continue;
    const sp = length(b.vx, b.vy);
    if (sp > MAX_SPEED) {
      b.vx = (b.vx / sp) * MAX_SPEED;
      b.vy = (b.vy / sp) * MAX_SPEED;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  // 2) 壁反射
  for (const b of bodies) {
    if (b.hp <= 0) continue;
    if (b.kind === "enemy") continue; // 敵は今は静止
    if (b.x - b.r < 0) {
      b.x = b.r;
      b.vx = -b.vx;
      events.push({ t: "wallBounce", turn, bodyId: b.id, axis: "x" });
    } else if (b.x + b.r > width) {
      b.x = width - b.r;
      b.vx = -b.vx;
      events.push({ t: "wallBounce", turn, bodyId: b.id, axis: "x" });
    }
    if (b.y - b.r < 0) {
      b.y = b.r;
      b.vy = -b.vy;
      events.push({ t: "wallBounce", turn, bodyId: b.id, axis: "y" });
    } else if (b.y + b.r > height) {
      b.y = height - b.r;
      b.vy = -b.vy;
      events.push({ t: "wallBounce", turn, bodyId: b.id, axis: "y" });
    }
  }

  // 3) プレイヤー × 敵 衝突
  for (const a of bodies) {
    if (a.hp <= 0) continue;
    if (a.kind !== "player" && a.kind !== "ally") continue;
    const speed = length(a.vx, a.vy);
    if (speed < STOP_SPEED) continue;

    for (const b of bodies) {
      if (b === a || b.hp <= 0) continue;
      if (b.kind !== "enemy") continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const rr = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 > rr * rr) continue;

      const d = Math.sqrt(Math.max(d2, 0.0001));
      const nx = -dx / d;
      const ny = -dy / d;

      // めり込み補正
      const overlap = rr - d;
      a.x += nx * overlap;
      a.y += ny * overlap;

      // ダメージ計算: 速度に比例
      const damage = Math.round(a.attack * (0.5 + speed / 600));
      b.hp = Math.max(0, b.hp - damage);
      events.push({
        t: "hit",
        turn,
        attackerId: a.id,
        targetId: b.id,
        damage,
        targetHpAfter: b.hp,
      });

      if (b.hp <= 0) {
        events.push({ t: "kill", turn, targetId: b.id });
      }

      // 反射(貫通でなければ)
      if (!a.pierce && b.hp > 0) {
        const dot = a.vx * nx + a.vy * ny;
        a.vx = a.vx - 2 * dot * nx;
        a.vy = a.vy - 2 * dot * ny;
      }
    }
  }

  // 4) 減速 + 停止判定
  const damping = Math.exp(-DAMPING_PER_SEC * dt);
  let allStopped = true;
  for (const b of bodies) {
    if (b.hp <= 0) continue;
    if (b.kind !== "player" && b.kind !== "ally") continue;
    b.vx *= damping;
    b.vy *= damping;
    const sp = length(b.vx, b.vy);
    if (sp < STOP_SPEED) {
      if (sp > 0) events.push({ t: "stop", turn, bodyId: b.id });
      b.vx = 0;
      b.vy = 0;
    } else {
      allStopped = false;
    }
  }

  return allStopped;
}
