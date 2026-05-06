import { Game } from "../../game/Game";
import { AimState, attachPointerInput } from "../../game/input";
import { render } from "../../game/render";
import { stage001 } from "../../stages/stage001";
import { GameEvent, GameState, StageDef } from "../../game/types";
import { App } from "../App";
import { Scene } from "../types";

const STAGES: Record<string, StageDef> = {
  stage001,
};

export type InGameOpts = {
  stageId?: string;
  seed?: number;
};

export class InGameScene implements Scene {
  readonly id = "ingame" as const;
  root: HTMLElement;

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private hudTurn!: HTMLElement;
  private hudPhase!: HTMLElement;
  private hudEnemies!: HTMLElement;
  private banner!: HTMLElement;
  private resultButtons!: HTMLElement;

  private game: Game | null = null;
  private detachInput: (() => void) | null = null;
  private unsubscribe: (() => void) | null = null;
  private eventLog: GameEvent[] = [];

  private aim: AimState = {
    active: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  };
  private activePlayerId: string | null = null;
  private debug = false;

  constructor(root: HTMLElement, private app: App) {
    this.root = root;
    this.root.innerHTML = `
      <canvas id="game"></canvas>
      <div class="ui">
        <div class="hud">
          <span data-hud="turn">Turn 1</span>
          <span data-hud="phase">aiming</span>
          <span data-hud="enemies">enemies: -</span>
        </div>
        <div class="footer">
          <button data-action="reset">Reset</button>
          <button data-action="debug">Debug</button>
          <button data-action="title">TITLE</button>
        </div>
        <div class="banner" data-role="banner">
          <div class="banner-text" data-role="banner-text"></div>
          <div class="banner-buttons" data-role="banner-buttons" hidden>
            <button data-action="retry" class="primary">RETRY</button>
            <button data-action="title" class="secondary">TITLE</button>
          </div>
        </div>
      </div>
    `;

    this.canvas = root.querySelector("canvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d", { alpha: false })!;
    this.hudTurn = root.querySelector('[data-hud="turn"]') as HTMLElement;
    this.hudPhase = root.querySelector('[data-hud="phase"]') as HTMLElement;
    this.hudEnemies = root.querySelector('[data-hud="enemies"]') as HTMLElement;
    this.banner = root.querySelector('[data-role="banner"]') as HTMLElement;
    this.resultButtons = root.querySelector('[data-role="banner-buttons"]') as HTMLElement;

    root.addEventListener("click", this.onClick);
  }

  enter(opts?: unknown): void {
    const o = (opts ?? {}) as InGameOpts;
    const stage = STAGES[o.stageId ?? "stage001"] ?? stage001;
    this.canvas.width = stage.width;
    this.canvas.height = stage.height;

    this.game = new Game({ stage, seed: o.seed ?? 0xc0ffee });
    this.eventLog = [];
    this.activePlayerId =
      this.game.getState().bodies.find((b) => b.kind === "player")?.id ?? null;

    this.detachInput = attachPointerInput(this.canvas, {
      onAimStart: (x, y) => {
        if (!this.game || this.game.getState().phase !== "aiming") return false;
        const ap = this.game.getActivePlayer();
        if (!ap) return false;
        this.aim.active = true;
        this.aim.startX = ap.x;
        this.aim.startY = ap.y;
        this.aim.currentX = x;
        this.aim.currentY = y;
        return true;
      },
      onAimMove: (x, y) => {
        if (!this.aim.active) return;
        this.aim.currentX = x;
        this.aim.currentY = y;
      },
      onAimEnd: () => {
        if (!this.aim.active || !this.game) return;
        this.aim.active = false;
        const dx = this.aim.startX - this.aim.currentX;
        const dy = this.aim.startY - this.aim.currentY;
        this.game.fireFromPull(dx, dy);
      },
      onAimCancel: () => {
        this.aim.active = false;
      },
    });

    this.unsubscribe = this.game.subscribe((s, ev) => {
      for (const e of ev) {
        this.eventLog.push(e);
        if (e.t === "phase" && e.to === "aiming") {
          this.refreshActivePlayer();
        }
      }
      this.updateHud(s);
    });

    this.updateHud(this.game.getState());

    // ゲーム本体を window.__game に公開（ingame の間だけ）
    (window as any).__game = this.buildGameApi();
  }

  exit(): void {
    this.detachInput?.();
    this.detachInput = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.game?.pause();
    this.game = null;
    this.eventLog = [];
    delete (window as any).__game;
    this.banner.classList.remove("show");
    this.resultButtons.hidden = true;
  }

  tick(dt: number): void {
    if (!this.game) return;
    this.game.advance(dt);
    render(this.ctx, this.game.getState(), {
      debug: this.debug,
      aim: this.aim,
      activePlayerId: this.activePlayerId,
    });
  }

  private refreshActivePlayer() {
    const ap = this.game?.getActivePlayer();
    this.activePlayerId = ap?.id ?? null;
  }

  private updateHud(s: GameState) {
    this.hudTurn.textContent = `Turn ${s.turn}`;
    this.hudPhase.textContent = s.phase;
    const alive = s.bodies.filter((b) => b.kind === "enemy" && b.hp > 0).length;
    const total = s.bodies.filter((b) => b.kind === "enemy").length;
    this.hudEnemies.textContent = `enemies: ${alive}/${total}`;

    const bannerText = this.banner.querySelector(
      '[data-role="banner-text"]',
    ) as HTMLElement;
    if (s.phase === "stageClear") {
      bannerText.textContent = "STAGE CLEAR";
      this.banner.classList.add("show");
      this.resultButtons.hidden = false;
    } else if (s.phase === "gameOver") {
      bannerText.textContent = "GAME OVER";
      this.banner.classList.add("show");
      this.resultButtons.hidden = false;
    } else {
      this.banner.classList.remove("show");
      this.resultButtons.hidden = true;
    }
  }

  private onClick = (e: Event) => {
    const target = e.target as HTMLElement;
    const action = target.dataset.action;
    if (!action) return;
    switch (action) {
      case "reset":
        this.game?.reset();
        this.refreshActivePlayer();
        break;
      case "debug":
        this.debug = !this.debug;
        break;
      case "title":
        this.app.goTo("title");
        break;
      case "retry":
        this.game?.reset();
        this.refreshActivePlayer();
        break;
    }
  };

  // window.__game に公開する API（spec/03-ai-api.md と一致）
  private buildGameApi() {
    const self = this;
    return {
      version: "0.2.0",
      get core() { return self.game!; },
      getState: () => self.game!.getState(),
      snapshot: () => self.game!.snapshot(),
      loadState: (s: GameState) => {
        self.game!.loadState(s);
        self.refreshActivePlayer();
      },
      fire: (p: Parameters<Game["fire"]>[0]) => self.game!.fire(p),
      pull: (dx: number, dy: number, playerId?: string) =>
        self.game!.fireFromPull(dx, dy, playerId),
      step: (seconds = 1 / 60) => self.game!.advance(seconds),
      stepOnce: () => self.game!.stepOnce(),
      pause: () => self.game!.pause(),
      resume: () => self.game!.resume(),
      reset: (seed?: number) => {
        self.game!.reset(seed);
        self.refreshActivePlayer();
        self.banner.classList.remove("show");
        self.resultButtons.hidden = true;
      },
      events: () => self.eventLog.slice(),
      clearEvents: () => {
        self.eventLog.length = 0;
      },
      setActivePlayer: (id: string) => {
        const players = self.game!.getState().bodies.filter((b) => b.kind === "player");
        const idx = players.findIndex((p) => p.id === id);
        if (idx >= 0) {
          const snap = self.game!.snapshot();
          snap.activePlayerIndex = idx;
          self.game!.loadState(snap);
          self.refreshActivePlayer();
        }
      },
      setDebug: (v: boolean) => {
        self.debug = v;
      },
      activePlayerId: () => self.activePlayerId,
    };
  }
}
