import { App } from "./app/App";
import { TitleScene } from "./app/scenes/TitleScene";
import { OutGameScene } from "./app/scenes/OutGameScene";
import { InGameScene } from "./app/scenes/InGameScene";
import { ScreenId } from "./app/types";

const app = new App();

const titleRoot = document.querySelector('[data-scene="title"]') as HTMLElement;
const outgameRoot = document.querySelector('[data-scene="outgame"]') as HTMLElement;
const ingameRoot = document.querySelector('[data-scene="ingame"]') as HTMLElement;

app.register(new TitleScene(titleRoot, app));
app.register(new OutGameScene(outgameRoot, app));
app.register(new InGameScene(ingameRoot, app));

app.start("title");

declare global {
  interface Window {
    __app: {
      version: string;
      core: App;
      getScene(): ScreenId;
      goTo(id: ScreenId, opts?: unknown): void;
      game(): unknown;
      events(): ReturnType<App["getEvents"]>;
    };
  }
}

window.__app = {
  version: "0.1.0",
  core: app,
  getScene: () => app.getScene(),
  goTo: (id, opts) => app.goTo(id, opts),
  game: () => (window as unknown as { __game?: unknown }).__game ?? null,
  events: () => app.getEvents(),
};

console.info(
  "[Pull Strike] ready. __app.goTo('ingame') to skip title.",
);
