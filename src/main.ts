import { Game } from "./game/Game";
import { attachPointerInput, AimState } from "./game/input";
import { render } from "./game/render";
import { stage001 } from "./stages/stage001";
import { GameEvent, GameState } from "./game/types";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d", { alpha: false })!;

// 内部解像度はステージ定義に合わせて固定。表示は CSS でレスポンシブ。
canvas.width = stage001.width;
canvas.height = stage001.height;

const game = new Game({ stage: stage001, seed: 0xc0ffee });

const aim: AimState = {
  active: false,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
};

let activePlayerId: string | null =
  game.getState().bodies.find((b) => b.kind === "player")?.id ?? null;

let debug = false;

function refreshActivePlayer() {
  const ap = game.getActivePlayer();
  activePlayerId = ap?.id ?? null;
}

attachPointerInput(canvas, {
  onAimStart: (x, y) => {
    if (game.getState().phase !== "aiming") return false;
    const ap = game.getActivePlayer();
    if (!ap) return false;
    // アクティブプレイヤーから半径 + 余白 内で開始したらドラッグ受付
    const d = Math.hypot(x - ap.x, y - ap.y);
    if (d > ap.r + 60) {
      // どこを掴んでも始められるようにしてもよい。今は柔らかめ。
    }
    aim.active = true;
    aim.startX = ap.x;
    aim.startY = ap.y;
    aim.currentX = x;
    aim.currentY = y;
    return true;
  },
  onAimMove: (x, y) => {
    if (!aim.active) return;
    aim.currentX = x;
    aim.currentY = y;
  },
  onAimEnd: () => {
    if (!aim.active) return;
    aim.active = false;
    const dx = aim.startX - aim.currentX;
    const dy = aim.startY - aim.currentY;
    game.fireFromPull(dx, dy);
  },
  onAimCancel: () => {
    aim.active = false;
  },
});

// HUD
const hudTurn = document.getElementById("hud-turn")!;
const hudPhase = document.getElementById("hud-phase")!;
const hudEnemies = document.getElementById("hud-enemies")!;
const banner = document.getElementById("banner")!;

function updateHud(s: GameState) {
  hudTurn.textContent = `Turn ${s.turn}`;
  hudPhase.textContent = s.phase;
  const alive = s.bodies.filter((b) => b.kind === "enemy" && b.hp > 0).length;
  const total = s.bodies.filter((b) => b.kind === "enemy").length;
  hudEnemies.textContent = `enemies: ${alive}/${total}`;

  if (s.phase === "stageClear") {
    banner.textContent = "STAGE CLEAR";
    banner.classList.add("show");
  } else if (s.phase === "gameOver") {
    banner.textContent = "GAME OVER";
    banner.classList.add("show");
  } else {
    banner.classList.remove("show");
  }
}

game.subscribe((s, events) => {
  for (const e of events) {
    if (e.t === "phase" && e.to === "aiming") {
      refreshActivePlayer();
    }
  }
  updateHud(s);
});

// メインループ
let last = performance.now();
function loop(now: number) {
  const dt = (now - last) / 1000;
  last = now;
  game.advance(dt);
  render(ctx, game.getState(), { debug, aim, activePlayerId });
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// UIボタン
document.getElementById("btn-reset")!.addEventListener("click", () => {
  game.reset();
  refreshActivePlayer();
  banner.classList.remove("show");
});
document.getElementById("btn-debug")!.addEventListener("click", () => {
  debug = !debug;
});

// ---- AI / デバッグ用グローバルAPI ---------------------------------------
// ブラウザコンソールやヘッドレスドライバから操作する想定。
// 例:
//   __game.fire({ angleDeg: -90, power: 0.7 })
//   __game.snapshot()
//   __game.loadState(snap)
//   __game.events()
//   __game.step(0.5)
//   __game.setActivePlayer('P2')
const eventLog: GameEvent[] = [];
game.subscribe((_s, ev) => {
  for (const e of ev) eventLog.push(e);
});

declare global {
  interface Window {
    __game: {
      version: string;
      core: Game;
      getState(): GameState;
      snapshot(): GameState;
      loadState(s: GameState): void;
      fire(p: Parameters<Game["fire"]>[0]): boolean;
      pull(dx: number, dy: number, playerId?: string): boolean;
      step(seconds?: number): void;
      stepOnce(): GameEvent[];
      pause(): void;
      resume(): void;
      reset(seed?: number): void;
      events(): GameEvent[];
      clearEvents(): void;
      setActivePlayer(id: string): void;
      setDebug(v: boolean): void;
      activePlayerId(): string | null;
    };
  }
}

window.__game = {
  version: "0.1.0",
  core: game,
  getState: () => game.getState(),
  snapshot: () => game.snapshot(),
  loadState: (s) => {
    game.loadState(s);
    refreshActivePlayer();
  },
  fire: (p) => game.fire(p),
  pull: (dx, dy, playerId) => game.fireFromPull(dx, dy, playerId),
  step: (seconds = 1 / 60) => {
    game.advance(seconds);
  },
  stepOnce: () => game.stepOnce(),
  pause: () => game.pause(),
  resume: () => game.resume(),
  reset: (seed) => {
    game.reset(seed);
    refreshActivePlayer();
    banner.classList.remove("show");
  },
  events: () => eventLog.slice(),
  clearEvents: () => {
    eventLog.length = 0;
  },
  setActivePlayer: (id) => {
    const players = game.getState().bodies.filter((b) => b.kind === "player");
    const idx = players.findIndex((p) => p.id === id);
    if (idx >= 0) {
      // private アクセスを避け、loadState でインデックスのみ書き換え
      const snap = game.snapshot();
      snap.activePlayerIndex = idx;
      game.loadState(snap);
      refreshActivePlayer();
    }
  },
  setDebug: (v) => {
    debug = v;
  },
  activePlayerId: () => activePlayerId,
};

// デバッグの取っ掛かりとして起動メッセージを出す。
// AIから操作するときは window.__game を使う。
console.info(
  "[Pull Strike] ready. Try: __game.fire({ angleDeg: -90, power: 0.7 })",
);
