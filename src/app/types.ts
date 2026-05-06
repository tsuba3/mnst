export type ScreenId = "title" | "outgame" | "ingame";

export type Scene = {
  id: ScreenId;
  // 各 scene の root DOM 要素 (登録時に App から渡す)
  root: HTMLElement;
  enter(opts?: unknown): void;
  exit(): void;
  tick?(dt: number): void;
};

export type AppEvent = {
  t: "scene";
  from: ScreenId;
  to: ScreenId;
  at: number; // ms (performance.now())
};
