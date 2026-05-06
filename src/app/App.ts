import { AppEvent, Scene, ScreenId } from "./types";

export class App {
  private scenes = new Map<ScreenId, Scene>();
  private currentId: ScreenId | null = null;
  private events: AppEvent[] = [];
  private rafId: number | null = null;
  private lastTime = 0;

  register(scene: Scene): void {
    this.scenes.set(scene.id, scene);
    scene.root.hidden = true;
  }

  start(initial: ScreenId, opts?: unknown): void {
    this.goTo(initial, opts);
    this.lastTime = performance.now();
    const loop = (now: number) => {
      const dt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      const cur = this.currentScene();
      cur?.tick?.(dt);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  goTo(id: ScreenId, opts?: unknown): void {
    const next = this.scenes.get(id);
    if (!next) {
      throw new Error(`unknown scene: ${id}`);
    }
    const prev = this.currentScene();
    if (prev) {
      prev.exit();
      prev.root.hidden = true;
    }
    const fromId = this.currentId;
    this.currentId = id;
    next.root.hidden = false;
    next.enter(opts);
    // 初期エントリ (fromId === null) はイベント発火しない。getScene() で取れる。
    if (fromId !== null) {
      this.events.push({ t: "scene", from: fromId, to: id, at: performance.now() });
    }
  }

  getScene(): ScreenId {
    if (!this.currentId) throw new Error("App not started");
    return this.currentId;
  }

  currentScene(): Scene | null {
    return this.currentId ? this.scenes.get(this.currentId) ?? null : null;
  }

  getEvents(): AppEvent[] {
    return this.events.slice();
  }
}
