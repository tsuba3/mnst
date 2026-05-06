import { App } from "../App";
import { Scene } from "../types";

export class TitleScene implements Scene {
  readonly id = "title" as const;
  root: HTMLElement;

  constructor(root: HTMLElement, private app: App) {
    this.root = root;
    this.root.innerHTML = `
      <div class="title-inner">
        <h1 class="title-logo">Pull Strike</h1>
        <p class="title-sub">ひっぱって、弾いて、敵を撃ち抜け。</p>
        <div class="title-buttons">
          <button data-action="start" class="primary">START</button>
        </div>
        <p class="title-hint">勝手に動く敵もスキルもまだ無い。最小コアだけのプロトタイプ。</p>
      </div>
    `;
    this.root.addEventListener("click", this.onClick);
  }

  private onClick = (e: Event) => {
    const target = e.target as HTMLElement;
    const action = target.dataset.action;
    if (action === "start") {
      this.app.goTo("ingame", { stageId: "stage001" });
    }
  };

  enter(): void {}
  exit(): void {}
}
