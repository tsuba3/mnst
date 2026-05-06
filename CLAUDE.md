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
  06-screens.md          画面構成（title / outgame / ingame）

src/
  main.ts                エントリ。App をブートして window.__app を公開
  app/
    App.ts               シーン管理（goTo / register / RAF ループ）
    types.ts             ScreenId / Scene / AppEvent
    scenes/
      TitleScene.ts      タイトル画面
      OutGameScene.ts    アウトゲーム（プレースホルダ）
      InGameScene.ts     インゲーム本体。enter で window.__game を生やす
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

シーン制御は `window.__app`、ゲーム本体は `window.__game`。

```ts
// 画面遷移（仕様: spec/06-screens.md）
__app.getScene()                           // "title" | "outgame" | "ingame"
__app.goTo("ingame", { stageId: "stage001" })
__app.events()                             // シーン遷移ログ

// インゲーム中のみ生える（仕様: spec/03-ai-api.md）
__game.getState()                          // 状態スナップショット
__game.fire({ angleDeg: -90, power: 0.7 }) // 発射
__game.events()                            // 構造化イベントログ
__game.stepOnce()                          // 1 ティックだけ進めて起きたイベントを返す
__game.snapshot() / loadState(s)           // 任意状態の保存・復元
__game.reset(seed)                         // シード固定で初期化
```

AI による操作は **すべて API 経由**。Pointer イベントを合成しないこと。
タイトル画面を経由したくないテストは `__app.goTo("ingame")` で直接インゲームに飛べる。

### 典型レシピ A: Playwright MCP からプレイする

`browser_evaluate` で `window.__game` / `window.__app` を直接叩く。物理が落ち着くまでは `browser_wait_for` で実時間を待つ。

```ts
// 1. ナビゲート + 直接インゲームへ
browser_navigate("http://127.0.0.1:5173")
browser_evaluate(`() => { window.__app.goTo("ingame"); window.__game.setDebug(true); window.__game.clearEvents(); }`)

// 2. アクティブ味方から目標までの角度を計算して発射
browser_evaluate(`() => {
  const s = window.__game.getState();
  const me = s.bodies.find(b => b.id === window.__game.activePlayerId());
  const target = s.bodies.find(b => b.kind === "enemy" && b.hp > 0);
  const angle = Math.atan2(target.y - me.y, target.x - me.x);
  return window.__game.fire({ angleRad: angle, power: 0.85 });
}`)

// 3. 物理が落ち着くまで実時間を待つ
browser_wait_for({ time: 4 })

// 4. 結果を構造化ログから取り出す（console.log は使わない）
browser_evaluate(`() => {
  const s = window.__game.getState();
  const ev = window.__game.events();
  return {
    phase: s.phase, turn: s.turn,
    enemies: s.bodies.filter(b => b.kind === "enemy").map(b => ({ id: b.id, hp: b.hp })),
    hits: ev.filter(e => e.t === "hit"),
  };
}`)

// 5. スクショ (.playwright-screenshot/{yyyymmdd}/<内容>.png)
browser_take_screenshot({ filename: ".playwright-screenshot/20260506/after-shot1.png" })
```

### 典型レシピ B: ヘッドレス・ステップ実行

`requestAnimationFrame` を待たず、AI が手動でティックを進める。実時間の何百倍も速く回せる。

```ts
browser_evaluate(`() => {
  window.__app.goTo("ingame");
  window.__game.fire({ angleDeg: -90, power: 1.0 });
  let safety = 0;
  while (window.__game.getState().phase === "moving" && safety++ < 1000) {
    window.__game.stepOnce();
  }
  return window.__game.events().filter(e => e.t === "hit" || e.t === "kill");
}`)
```

### 典型レシピ C: スナップショット駆動の再現テスト

`snapshot()` で状態を JSON 化、`loadState()` でそのまま戻せる。**バグ報告は JSON 1 つで再現可能**にする。

```ts
const before = await browser_evaluate(`() => window.__game.snapshot()`);
// ... 何かを起こす ...
await browser_evaluate(`(s) => window.__game.loadState(s)`, before); // 元に戻す
```

### 守ること

- 結果は **`__game.events()` / `getState()` から構造化データで取る**。`console.log` で文字列を眺めない。
- 同じシードを `reset(seed)` に渡せば物理は完全再現する。バグ調査は必ずシード固定で。
- スクショはあくまで人間向け。**判定ロジックは構造化ログから書く**。

詳細リファレンス: [`spec/03-ai-api.md`](spec/03-ai-api.md) / [`spec/06-screens.md`](spec/06-screens.md)。

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

## 8. PR ベースの開発フロー

このリポジトリの remote は `git@github.com:tsuba3/mnst.git`。**main への直接 push は禁止**で、すべての変更は PR を経由する。

### 8.1 ルール

- **main で作業しない**。新しい変更を始めるときは必ずブランチを切る。
- 1 ブランチ = 1 関心ごと。複数の独立した変更を 1 PR に混ぜない。
- ブランチ命名は `<type>/<短い要約>` 形式（kebab-case）:
  - `feat/...` 新機能
  - `fix/...` バグ修正
  - `docs/...` ドキュメントのみ
  - `chore/...` 雑務（依存更新・設定など）
  - `refactor/...` 振る舞いを変えないリファクタ
- 1 PR / 1 まとまり。「spec 更新 + 実装 + 動作確認」を 1 PR にそろえる。コミットは複数でもよい。
- コミットメッセージのプレフィックスは `feat: / fix: / docs: / chore: / refactor:`。
- `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` を維持する。

### 8.2 1 サイクルの流れ

```
1. git switch main && git pull
2. git switch -c feat/something
3. 必要なら spec/ を先に編集
4. 実装 → npm run typecheck && npm run build をパスさせる
5. Playwright MCP / 手動で動作確認 (golden path + edge cases)
6. git commit （複数コミットでもよい）
7. git push -u origin feat/something
8. gh pr create （下のテンプレートに従う）
9. ★ ユーザーの承認を待つ ★
10. 承認後: gh pr merge --merge --delete-branch
11. git switch main && git pull
```

**9 のユーザー承認が無いままマージしてはいけない**。レビュー指摘があったら同ブランチに追加コミットして push する（force-push 禁止）。

### 8.3 PR の本文テンプレート

PR タイトル: `<type>: <要約>`（70 文字以内）。本文は HEREDOC で `gh pr create --body "$(cat <<'EOF' ... EOF)"` のように渡す。

```
## Summary
1〜3 行で「何を、なぜ」。実装の背景や仕様変更の理由が分かるように。

## Changes
- 重要なファイル単位で何を変えたか（過剰な羅列は不要、要点だけ）
- 仕様変更があれば対応する spec/ ファイルへのリンク

## Test plan
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] Playwright MCP で http://127.0.0.1:5173 を開いて X / Y / Z を確認
- [ ] スクショ: .playwright-screenshot/{yyyymmdd}/<内容>.png を本文に貼付

## Screenshots / Notes
（任意。重要な挙動や視覚変更があれば貼る）

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### 8.4 やってはいけないこと

- `git push origin main`（main への直接 push は権限で止まる。止まったら必ずブランチ運用に戻る）
- `gh pr merge` をユーザー承認前に実行する
- `git push --force` / `git push --force-with-lease`（履歴を共有後は禁止。レビュー指摘は追加コミットで対応）
- 別の PR の変更を自分のブランチに rebase で取り込んで上書き push する
- `--no-verify` 等で hook を skip する（hook が失敗したら原因を直す）

### 8.5 マージ後の片付け

```
gh pr merge <PR番号> --merge --delete-branch
git switch main
git pull
git branch -d feat/something   # ローカルブランチも消す（既に消えていたらスキップ）
```

## 9. 困ったときの優先順位

1. **`spec/` を読む** — 仕様が定まっていればまず spec の通りに動くべき。
2. **`__game.events()` を読む** — 最後に何が起きたかを構造化データで把握。
3. **`__game.snapshot()` を保存** — 不可解な状態は JSON で保存して再現可能にする。
4. それでも分からなければユーザーに質問する（`spec/` のどこを参照したかも添える）。
