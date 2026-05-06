import { App } from "../App";
import { Scene } from "../types";

// 現状はプレースホルダ。Phase 1 でステージ選択 / 育成を実装する。
export class OutGameScene implements Scene {
  readonly id = "outgame" as const;
  root: HTMLElement;

  constructor(root: HTMLElement, private app: App) {
    this.root = root;
    this.root.innerHTML = `
      <div class="outgame-inner">
        <h2>HOME</h2>
        <p class="muted">Coming soon — ステージ選択・育成・所持キャラ</p>
        <button data-action="back" class="secondary">TITLE に戻る</button>
      </div>
    `;
    this.root.addEventListener("click", this.onClick);
  }

  private onClick = (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.dataset.action === "back") {
      this.app.goTo("title");
    }
  };

  enter(): void {}
  exit(): void {}
}
