# CLAUDE.md

Claude Code（および他の AI エージェント）がこのリポジトリで作業するときのガイド。

## 1. プロジェクトの目的

ブラウザで動く縦画面の「ひっぱって弾く」アクションゲーム。
**AI / 自動テストから操作・観測しやすい構成**を最重要要件として作っている。

詳細は [`spec/00-overview.md`](spec/00-overview.md) を参照。

## 2. 重要なディレクトリ

```
spec/                    仕様書（spec ファースト運用、実装より優先）
  README.md              目次
  00-overview.md         ゲーム全体像
  01-physics.md          物理仕様
  02-game-flow.md        フェーズ遷移
  03-ai-api.md           window.__game の API
  04-stages.md           ステージ定義
  05-events.md           GameEvent 構造化ログ

src/
  main.ts                エントリ。window.__game を公開
  game/
    Game.ts              コア（fire / step / snapshot / loadState）
    types.ts             状態・イベントの型定義
    physics.ts           衝突・反射・減速（純ロジック）
    input.ts             Pointer Events
    render.ts            Canvas 2D 描画（state を読むだけ）
    rng.ts               決定論的 PRNG
  stages/                ステージ定義

.playwright-screenshot/  Playwright で撮ったスクショ（gitignore）
.playwright-mcp/         Playwright MCP の作業ディレクトリ（gitignore）
```

## 3. コマンド

| コマンド | 用途 |
|---|---|
| `npm run dev` | Vite dev server（http://127.0.0.1:5173） |
| `npm run typecheck` | TypeScript の型チェックのみ |
| `npm run build` | 本番ビルド |
| `npm run preview` | ビルド済みをローカル確認 |

**作業前に必ず `npm run typecheck` が通る状態を保つこと**。コミット前にも実行する。

## 4. spec ファースト

- **仕様変更を伴う実装は、先に `spec/` を編集**してからコードを直す。
- spec とコードがズレていることに気付いたら、どちらが正しいかをユーザーに確認した上で必ず一方に揃える。
- 数値（`MAX_SPEED` / `DAMPING_PER_SEC` など）を変えたら、`spec/01-physics.md` の表も**同じコミット**で更新する。
- 新しいイベント / API / ステージフィールドを追加するときは、対応する spec を先に書いてから実装する。

## 5. AI が状態を見る・操作する方法

`window.__game` 経由（仕様: [`spec/03-ai-api.md`](spec/03-ai-api.md)）。

```ts
__game.getState()                          // 状態スナップショット
__game.fire({ angleDeg: -90, power: 0.7 }) // 発射
__game.events()                            // 構造化イベントログ
__game.stepOnce()                          // 1 ティックだけ進めて起きたイベントを返す
__game.snapshot() / loadState(s)           // 任意状態の保存・復元
__game.reset(seed)                         // シード固定で初期化
```

AI による操作は **すべて API 経由**。Pointer イベントを合成しないこと。

## 6. Playwright MCP の運用ルール

### スクリーンショットの保存先

- 必ず `.playwright-screenshot/{yyyymmdd}/` 以下に保存する。
- `browser_take_screenshot` の `filename` 引数で明示的にパスを指定する:
  ```
  filename: ".playwright-screenshot/20260506/turn5-after-fire.png"
  ```
- **ディレクトリは事前に `mkdir -p` する**（MCP は自動作成しない。撮ろうとすると ENOENT で落ちる）。
- ファイル名は **何が写っているか** が分かる名前にする（タイムスタンプだけにしない）。
- このディレクトリは gitignore されている。永続化したい証跡は別途 `docs/` に手動で移す。

### 典型的なデバッグループ

```
1. browser_navigate("http://127.0.0.1:5173")
2. browser_evaluate で __game.setDebug(true) と __game.clearEvents()
3. 仮説に基づいて __game.fire(...) または __game.stepOnce() を呼ぶ
4. browser_evaluate で __game.events() / getState() を読む
5. browser_take_screenshot を `.playwright-screenshot/{yyyymmdd}/` に保存
6. 結果を spec / 実装と照らし合わせ、不整合があれば spec を直すかコードを直す
```

### console / network のログ

- `browser_console_messages` で取得可能。**バグ調査の前に必ず一度確認する**。

## 7. やってほしくないこと

- **モンスト等の公式名称・キャラ・画像・音声を持ち込まない**（恒久的）。
- spec を更新せずに数値や API シグネチャを変えない。
- `requestAnimationFrame` を `Game` クラス内に持ち込まない（描画/RAF はすべて `main.ts`）。
- `physics.ts` から DOM や `window` を参照しない。
- `console.log` でゲーム結果を伝えない。観測は `GameEvent` で行う。
- コミット時、`.playwright-mcp/` `.playwright-screenshot/` `demo-*.png` 等を含めない。

## 8. コミット運用

- 1 PR / 1 コミットで「spec 更新 + 実装 + テスト追加」を揃える。
- コミットメッセージは `feat: / fix: / chore: / docs: / refactor:` のプレフィックスを使う。
- Co-Authored-By は維持する。

## 9. 困ったときの優先順位

1. **`spec/` を読む** — 仕様が定まっていればまず spec の通りに動くべき。
2. **`__game.events()` を読む** — 最後に何が起きたかを構造化データで把握。
3. **`__game.snapshot()` を保存** — 不可解な状態は JSON で保存して再現可能にする。
4. それでも分からなければユーザーに質問する（`spec/` のどこを参照したかも添える）。
