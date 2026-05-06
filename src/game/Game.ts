import { FIXED_DT, MAX_SPEED, clamp, stepPhysics } from "./physics";
import { RNG } from "./rng";
import { CircleBody, GameEvent, GamePhase, GameState, StageDef } from "./types";

export type FireParams = {
  // 飛ぶ方向 (ラジアン or 度数)
  angleRad?: number;
  angleDeg?: number;
  // 0..1 の正規化パワー(MAX_SPEED が上限)
  power: number;
  // 直接速度を指定したい場合
  vx?: number;
  vy?: number;
  // 操作するプレイヤーID(省略時はアクティブ)
  playerId?: string;
};

export type GameOptions = {
  stage: StageDef;
  seed?: number;
};

// ひっぱり -> 速度 の変換係数。ピクセル/秒。
export const PULL_TO_SPEED = 6;
export const MAX_PULL = 220;

export class Game {
  private state: GameState;
  private rng: RNG;
  private stage: StageDef;
  private listeners = new Set<(s: GameState, e: GameEvent[]) => void>();
  private accumulator = 0;
  private paused = false;

  constructor(opts: GameOptions) {
    this.stage = opts.stage;
    this.rng = new RNG(opts.seed ?? 0xc0ffee);
    this.state = this.buildInitialState(this.stage, this.rng.getSeed());
  }

  // ---- ライフサイクル ----------------------------------------------------

  reset(seed?: number): void {
    if (seed !== undefined) this.rng.setSeed(seed);
    this.state = this.buildInitialState(this.stage, this.rng.getSeed());
    this.accumulator = 0;
    this.emit([]);
  }

  private buildInitialState(stage: StageDef, seed: number): GameState {
    const bodies: CircleBody[] = [];
    for (const p of stage.players) {
      bodies.push({
        id: p.id,
        kind: "player",
        x: p.x,
        y: p.y,
        r: p.r,
        vx: 0,
        vy: 0,
        hp: p.hp,
        maxHp: p.hp,
        pierce: p.pierce,
        attack: p.attack,
      });
    }
    for (const e of stage.enemies) {
      bodies.push({
        id: e.id,
        kind: "enemy",
        x: e.x,
        y: e.y,
        r: e.r,
        vx: 0,
        vy: 0,
        hp: e.hp,
        maxHp: e.hp,
        pierce: false,
        attack: 0,
      });
    }
    return {
      phase: "aiming",
      turn: 1,
      width: stage.width,
      height: stage.height,
      activePlayerIndex: 0,
      bodies,
      events: [],
      rngSeed: seed,
      tick: 0,
    };
  }

  // ---- フレーム進行 ------------------------------------------------------

  // dt 秒分のシミュレーションを進める。固定タイムステップで内部累算する。
  // requestAnimationFrame からも、テストからも呼べる。
  advance(dt: number): void {
    if (this.paused) return;
    this.accumulator += Math.min(dt, 0.1);
    let stepped = 0;
    while (this.accumulator >= FIXED_DT && stepped < 8) {
      this.stepOnce();
      this.accumulator -= FIXED_DT;
      stepped++;
    }
  }

  // 強制的に1ステップだけ進める(AI/テスト用)
  stepOnce(): GameEvent[] {
    const newEvents: GameEvent[] = [];
    this.state.tick++;

    if (this.state.phase === "moving") {
      const allStopped = stepPhysics(
        this.state.bodies,
        this.state.width,
        this.state.height,
        FIXED_DT,
        this.state.turn,
        newEvents,
      );

      if (this.checkStageClear()) {
        this.transitionTo("stageClear", newEvents);
      } else if (allStopped) {
        this.transitionTo("enemyTurn", newEvents);
        // 今は敵が何もしないのですぐ次のターンへ
        this.advanceTurn(newEvents);
      }
    }

    if (newEvents.length > 0) {
      this.state.events.push(...newEvents);
    }
    this.emit(newEvents);
    return newEvents;
  }

  private transitionTo(to: GamePhase, events: GameEvent[]): void {
    if (this.state.phase === to) return;
    events.push({ t: "phase", turn: this.state.turn, from: this.state.phase, to });
    this.state.phase = to;
    if (to === "stageClear") {
      events.push({ t: "stageClear", turn: this.state.turn });
    } else if (to === "gameOver") {
      events.push({ t: "gameOver", turn: this.state.turn });
    }
  }

  private advanceTurn(events: GameEvent[]): void {
    this.state.turn++;
    // 次のアクティブプレイヤーを決定(生きてるやつだけ)
    const players = this.state.bodies.filter((b) => b.kind === "player");
    const livingCount = players.filter((p) => p.hp > 0).length;
    if (livingCount === 0) {
      this.transitionTo("gameOver", events);
      return;
    }
    let idx = this.state.activePlayerIndex;
    for (let i = 0; i < players.length; i++) {
      idx = (idx + 1) % players.length;
      if (players[idx].hp > 0) break;
    }
    this.state.activePlayerIndex = idx;
    this.transitionTo("aiming", events);
  }

  private checkStageClear(): boolean {
    return this.state.bodies.filter((b) => b.kind === "enemy" && b.hp > 0).length === 0;
  }

  // ---- 入力API ----------------------------------------------------------

  // ひっぱりベクトル(プレイヤー位置から見たドラッグ移動量)から発射
  // pullDx, pullDy はキャラから引いた方向のベクトル。逆方向に飛ぶ。
  fireFromPull(pullDx: number, pullDy: number, playerId?: string): boolean {
    const len = Math.hypot(pullDx, pullDy);
    if (len < 8) return false;
    const clipped = Math.min(len, MAX_PULL);
    const ux = pullDx / len;
    const uy = pullDy / len;
    const speed = clipped * PULL_TO_SPEED;
    return this.fire({
      vx: -ux * speed,
      vy: -uy * speed,
      power: speed / MAX_SPEED,
      playerId,
    });
  }

  // 汎用発射API。AI/テストはここを直接叩く。
  fire(p: FireParams): boolean {
    if (this.state.phase !== "aiming") return false;
    const target = this.getActivePlayer(p.playerId);
    if (!target || target.hp <= 0) return false;

    let vx: number;
    let vy: number;
    if (p.vx !== undefined && p.vy !== undefined) {
      vx = p.vx;
      vy = p.vy;
    } else {
      const angle =
        p.angleRad !== undefined
          ? p.angleRad
          : ((p.angleDeg ?? 0) * Math.PI) / 180;
      const speed = clamp(p.power, 0, 1) * MAX_SPEED;
      vx = Math.cos(angle) * speed;
      vy = Math.sin(angle) * speed;
    }
    target.vx = vx;
    target.vy = vy;

    const ev: GameEvent[] = [];
    ev.push({ t: "fire", turn: this.state.turn, playerId: target.id, vx, vy });
    this.transitionTo("moving", ev);
    this.state.events.push(...ev);
    this.emit(ev);
    return true;
  }

  // ---- 状態アクセス -----------------------------------------------------

  getState(): GameState {
    return this.state;
  }

  getActivePlayer(id?: string): CircleBody | null {
    if (id) return this.state.bodies.find((b) => b.id === id) ?? null;
    const players = this.state.bodies.filter((b) => b.kind === "player");
    return players[this.state.activePlayerIndex] ?? null;
  }

  // 状態のスナップショットを取る(JSONシリアライズ可能)
  snapshot(): GameState {
    return JSON.parse(JSON.stringify(this.state));
  }

  // 任意の状態をロード(リプレイ・テスト・AI用)
  loadState(snap: GameState): void {
    this.state = JSON.parse(JSON.stringify(snap));
    this.accumulator = 0;
  }

  // ---- 観測・購読 -------------------------------------------------------

  subscribe(fn: (s: GameState, e: GameEvent[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(events: GameEvent[]): void {
    for (const fn of this.listeners) fn(this.state, events);
  }

  // ---- 一時停止 ---------------------------------------------------------

  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }
  isPaused(): boolean { return this.paused; }
}
