# 06 — Screens

アプリは **3 つの画面（シーン）** から構成される。
シーン管理は軽量な独自実装（React 不要）。各シーンは DOM の root 要素を 1 つ持ち、表示中のシーンの root だけが `display:flex` になる。

実装: `src/app/App.ts`、`src/app/scenes/*.ts`。

## シーン一覧

| ID | 役割 | 状態 |
|---|---|---|
| `title` | タイトル画面。STARTボタンでインゲームへ | 実装済 |
| `outgame` | ステージ選択・所持キャラ・育成などのメタ画面 | プレースホルダのみ |
| `ingame` | 実際にプレイする画面（Canvas + HUD） | 実装済 |

## 遷移

```
       [title]
       /     \
   START       (将来) HOME
      |          |
   [ingame] ← [outgame]
      |          |
      └──BACK───┘
```

現在のスコープ:

- `title → ingame`: タイトルの **START** ボタン
- `ingame → title`: リザルト（stageClear / gameOver）の **TITLE** ボタン、または HUD の HOME ボタン
- `title ↔ outgame`: 将来追加（ボタンは出さない）

将来（Phase 1〜）:

- `title → outgame`: タイトルの **HOME** / **STAGE SELECT** ボタン
- `outgame → ingame`: ステージ選択 → そのステージで開始
- `ingame → outgame`: リザルトの **STAGE SELECT** ボタン

## DOM 構造

```html
<div id="app">
  <div class="stage">
    <div class="scene scene-title"   data-scene="title">...</div>
    <div class="scene scene-outgame" data-scene="outgame" hidden>...</div>
    <div class="scene scene-ingame"  data-scene="ingame"  hidden>
      <canvas id="game"></canvas>
      <div class="ui">...</div>
    </div>
  </div>
</div>
```

- `data-scene` 属性で各 scene を特定可能。テスト・AI から CSS セレクタで参照する。
- `hidden` 属性で非アクティブなシーンを非表示にする。

## ライフサイクル

各シーンは次の関数を持つ（必須は `enter` / `exit`）。

```ts
type Scene = {
  id: ScreenId;
  enter(opts?: unknown): void;   // 表示時。初期化処理
  exit(): void;                  // 非表示時。後始末
  tick?(dt: number): void;       // RAF からの 1 フレーム更新（必要時のみ）
}
```

- 表示中は **常に 1 つの scene** だけがアクティブ。
- `App.goTo(id, opts?)` を呼ぶと、現 scene の `exit()` → 次の scene の `enter(opts)` の順で発火する。
- `tick` を実装した scene のみ毎フレーム更新を受ける。Title / OutGame は不要。

## App API（ブラウザのグローバル）

`window.__app` として公開する。`window.__game` はインゲーム中のみ生え、scene 切替で消える。

| API | 戻り値 | 用途 |
|---|---|---|
| `__app.version` | string | API バージョン |
| `__app.getScene()` | `ScreenId` | 現在のシーン |
| `__app.goTo(id, opts?)` | void | シーン切替 |
| `__app.game()` | `Game \| null` | インゲーム中なら Game、それ以外は null |
| `__app.events()` | `AppEvent[]` | シーン遷移の構造化ログ |

```ts
type AppEvent = { t: "scene"; from: ScreenId; to: ScreenId; at: number };
```

## ScreenId

```ts
type ScreenId = "title" | "outgame" | "ingame";
```

新規シーン（settings, gacha, etc.）を追加するときは:
1. このファイルにシーン名と遷移を追記。
2. `ScreenId` に追加。
3. `src/app/scenes/{id}.ts` を作成し、`Scene` インターフェースを実装。
4. `App.ts` の registry に追加。

## ingame の特例

- `ingame` は `enter(opts)` で `{ stageId: string; seed?: number }` を受け取る。
  - `stageId` は `src/stages/{id}.ts` のキーに対応（現状は `"stage001"` のみ）。
  - 省略時は `"stage001"`。
- `exit()` で Game インスタンスを破棄し、`window.__game` を削除する。

## title の現状仕様

- 中央にタイトル「Pull Strike」とサブテキスト
- **START** ボタン → `goTo("ingame", { stageId: "stage001" })`
- 背景はインゲームと統一（同じダーク基調）

## outgame の現状仕様

- 「Coming Soon」表示のみ
- **TITLE** ボタン → `goTo("title")`
- 将来ここにステージ選択・所持キャラ・育成 UI を実装する

## テスト観点

- Playwright MCP から `data-scene` 属性で対象シーンの root を取得し、表示状態を確認できる。
- `__app.goTo("ingame")` で AI が即インゲームに遷移できる（タイトル画面のクリックを介さない）。
- `__app.events()` でシーン遷移の履歴が読める。
