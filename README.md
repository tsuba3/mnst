# Pull Strike

ブラウザで動く縦画面の **「ひっぱってぶつける」2D 物理ゲーム**。
モンスターストライクのコア体験 — *ひっぱって弾く / 壁で反射 / 敵に当たる / ターン制で次へ* — だけを抽出した最小実装からスタートします。

- マウスでもタッチでも操作可能（Pointer Events）
- スマホ向け縦画面（9:16 ステージ）
- **AI / 自動テストから操作・観測しやすい構成**
- 物理は自前実装（円同士の衝突 + 反射 / 貫通の切替）

---

## クイックスタート

```bash
npm install
npm run dev
```

ブラウザで http://127.0.0.1:5173 を開く。
味方キャラ（緑）の周辺をドラッグ→離すと、ひっぱった**逆方向**に発射される。

```bash
npm run typecheck   # 型チェック
npm run build       # 本番ビルド
npm run preview     # ビルド後をローカル確認
```

---

## ディレクトリ構成

```
spec/                     # 仕様書（spec ファースト運用、実装より優先）
  README.md               # 目次
  00-overview.md          # ゲーム全体像
  01-physics.md           # 物理仕様（数値含む一次情報）
  02-game-flow.md         # フェーズ遷移
  03-ai-api.md            # window.__game の API
  04-stages.md            # ステージ定義
  05-events.md            # GameEvent 構造化ログ
  06-screens.md           # 画面構成（title / outgame / ingame）

src/
  main.ts                 # ブラウザのエントリ。App をブートして window.__app を公開
  app/                    # シーン管理レイヤー
    App.ts                # 各 scene を register/goTo する軽量マネージャ
    types.ts              # ScreenId / Scene / AppEvent
    scenes/
      TitleScene.ts       # タイトル画面
      OutGameScene.ts     # アウトゲーム（プレースホルダ）
      InGameScene.ts      # インゲーム。enter で window.__game を生やす
  game/                   # ゲーム本体（DOM/RAF を知らない）
    Game.ts               # ゲーム本体クラス（fire/step/snapshot/loadState）
    types.ts              # GameState / CircleBody / GameEvent 型
    physics.ts            # 衝突・反射・減速・停止判定（純関数寄り）
    input.ts              # Pointer Events のハンドリングのみ
    render.ts             # Canvas 2D 描画（読み取り専用）
    rng.ts                # 決定論的 PRNG (Mulberry32)
  stages/
    stage001.ts           # ステージ定義
index.html                # 3 つの scene root と CSS

CLAUDE.md                 # AI エージェント向けのガイド
.playwright-screenshot/   # Playwright で撮った画像 (gitignore)
.playwright-mcp/          # Playwright MCP の作業領域 (gitignore)
```

> **spec ファースト**: 仕様変更が必要なら、まず `spec/` を直してからコードを直す。
> 詳細は [`spec/README.md`](spec/README.md) と [`CLAUDE.md`](CLAUDE.md) を参照。

設計のポイントは **「ロジック / 入力 / 描画を分離する」** こと。
- `Game` は描画も DOM も知らない。`requestAnimationFrame` も持たない。
- 描画は `GameState` を読むだけ。書き戻さない。
- 入力は薄いラッパで、最終的に `Game.fireFromPull(...)` を呼ぶだけ。

これにより、AI / テスト / リプレイから `Game` を単独で動かせます。

---

## AI / デバッグ用 API

`window.__game` がブラウザコンソールに公開される（`src/main.ts` の末尾）。
Playwright / Puppeteer / DevTools Protocol などでそのまま叩けます。

> 完全なリファレンスは [`spec/03-ai-api.md`](spec/03-ai-api.md) を参照。以下は典型的な使い方の抜粋。

```ts
// 現在の状態を取る
const s = window.__game.getState();

// アクティブな味方を真下に強めに発射
window.__game.fire({ angleDeg: 90, power: 0.7 });

// ひっぱり方向ベクトルから発射（ピクセル単位）
window.__game.pull(0, 200);   // 上にひっぱる → 下に飛ぶのではなく、ひっぱり逆 = 上方向

// 物理を 0.5 秒分だけ進める（ヘッドレス検証用）
window.__game.step(0.5);

// 1ティック (1/60 秒) ぶんだけ進めて、起きたイベントを確認
const events = window.__game.stepOnce();

// スナップショット → 任意の状態を再現可能
const snap = window.__game.snapshot();
window.__game.loadState(snap);

// イベントログ（fire / hit / kill / wallBounce / phase など）
window.__game.events();
window.__game.clearEvents();

// アクティブプレイヤー切替
window.__game.setActivePlayer("P2");

// デバッグオーバーレイ（速度ベクトル・座標）
window.__game.setDebug(true);

// シード固定でリセット → 再現可能なテスト
window.__game.reset(0xc0ffee);
```

### 決定論性

- 物理は **fixed timestep (1/60s)** で更新（`Game.advance` が累算する）。
- 乱数は `RNG` (Mulberry32) でシード固定可能。
- 描画は状態を変えない。

→ **同じシード + 同じ入力列 → 同じ結果**。AI からのリプレイ・回帰テストに使えます。

### イベントログ

`GameEvent` は構造化された配列として `state.events` と `__game.events()` の両方で取得できます。

```ts
type GameEvent =
  | { t: "fire"; turn; playerId; vx; vy }
  | { t: "wallBounce"; turn; bodyId; axis }
  | { t: "hit"; turn; attackerId; targetId; damage; targetHpAfter }
  | { t: "kill"; turn; targetId }
  | { t: "stop"; turn; bodyId }
  | { t: "phase"; turn; from; to }
  | { t: "stageClear"; turn }
  | { t: "gameOver"; turn };
```

AI が「壁で何回反射したか」「どの敵を倒したか」を**観測する**ためのチャンネル。
LLM へのフィードバック / 報酬計算 / 失敗時のトレースに使えます。

---

## 操作モデル

```
pointerdown → アクティブプレイヤーを起点にドラッグ開始
pointermove → 矢印（引いた方向の逆）を描画
pointerup   → 引っ張りベクトル × PULL_TO_SPEED で発射
              fireFromPull(dx, dy)
              GamePhase: aiming → moving
moving      → 物理ステップで更新。すべて停止したら enemyTurn
enemyTurn   → 今は何もせず即 advanceTurn（敵ターンは Phase 4 で実装）
aiming に戻る
```

- 引っ張り長さ: `clamp(len, 0, MAX_PULL=220)`
- 速度: `len * PULL_TO_SPEED(=6)` ピクセル/秒、`MAX_SPEED(=1400)` で上限
- 減速: `exp(-1.6 * dt)`
- 停止判定: `|v| < STOP_SPEED(=18)`

---

## Playwright MCP で AI に操作させる

Claude Code から Playwright MCP 経由で `window.__game` を叩けば、コードを 1 行も書かずに AI にプレイさせられます。

```js
// Claude が browser_evaluate で実行する想定
__game.setDebug(true);
__game.clearEvents();
__game.fire({ angleDeg: -75, power: 0.85 });
// ...物理が落ち着いたら
__game.events().filter(e => e.t === "hit");
```

### 運用ルール

- **スクショは `.playwright-screenshot/{yyyymmdd}/` に保存する**（gitignore 済み）
  - `browser_take_screenshot` の `filename` で明示的にパス指定する
  - ファイル名は内容が分かるもの（例: `turn5-after-fire.png`）
- console エラー / network ログは Playwright MCP の `browser_console_messages` / `browser_network_requests` で取れる
- 詳細は [`CLAUDE.md`](CLAUDE.md) §6 を参照

---

## ロードマップ

参考: モンストの基本ルールは「ひっぱって弾く / 壁の反射 / 仲間にぶつけて友情コンボ / 反射タイプ・貫通タイプ」に分解できる。

### Phase 0 — MVP（実装済 ✅）

- [x] Vite + TS + Canvas 2D の最小ベース
- [x] 縦画面、Pointer Events でドラッグ発射
- [x] 円同士衝突・壁反射・減速・停止判定
- [x] 反射タイプ / 貫通タイプの切替
- [x] ターン制（味方が止まったら次のキャラ）
- [x] 敵 HP / ダメージ計算（速度比例）
- [x] ステージクリア / ゲームオーバー判定
- [x] **AI 操作用 `window.__game` API**
- [x] **決定論的 PRNG / fixed timestep / イベントログ**

### Phase 1 — ゲームとして成立させる

- [ ] ステージを JSON ファイルとして外出し（`/stages/*.json`）
- [ ] 複数ステージ + ステージセレクト
- [ ] 残りターン数 / ターン上限でゲームオーバー
- [ ] クリア演出・リザルト画面

### Phase 2 — モンスト風の気持ちよさ

- [ ] ヒットストップ（ヒット時 50–80ms フリーズ）
- [ ] ダメージ数字のフロート表示
- [ ] ヒット数カウンター
- [ ] 高速移動時の軌跡（過去フレームの円）
- [ ] 敵撃破エフェクト（パーティクル）
- [ ] 弱点判定（敵に弱点ヒットボックス）

### Phase 3 — 友情コンボ

- [ ] 味方とぶつかったとき発動（1ターン1回）
- [ ] 種類: 近距離レーザー / 全方向ショット / 単体追尾弾 / 範囲爆発
- [ ] `Player.friendship: FriendshipDef` をデータ駆動に

### Phase 4 — 敵ターン

- [ ] 敵ごとに `attackCountdown / attackInterval / attackPattern`
- [ ] 攻撃パターン: `single` / `area` / `laser`
- [ ] 味方 HP 表示 / 全滅でゲームオーバー

### Phase 5 — スキル・必殺技

- [ ] キャラごとの `skillCooldown`
- [ ] 種類: 速度アップ / ダメージブースト / メテオ
- [ ] スキル発動 UI（ボタン or キャラタップ）

### Phase 6 — UI / メタ

- [ ] React で UI レイヤー（HP バー / スキルボタン / リザルト）
- [ ] PWA 対応（オフライン起動）
- [ ] iOS Safe Area 対応の調整

### Phase 7 — AI トレーニング基盤（先取り）

- [ ] ヘッドレスモード（OffscreenCanvas + worker、`requestAnimationFrame` 不要）
- [ ] バルクシミュレーション API（同シードで N 回回す）
- [ ] 観測 → 行動空間の正規化（角度 [-π, π] / power [0, 1]）
- [ ] LLM プロンプトテンプレ（state JSON → 思考 → fire 引数）

---

## 実装上の方針

- **物理エンジンに任せすぎない**。気持ちいい嘘を入れる前提で自前実装。
  - めり込み補正、速度上限、停止直前の強い減速など。
- **状態を 1 か所に**。`GameState` だけが事実。描画も AI もここを読む。
- **副作用は端に寄せる**。`physics.ts` は基本的に `bodies / events` を変更するだけ。
- **テストは Game クラス単位で書ける**。`new Game({ stage }).fire(...)` → `stepOnce()` を回して `events` / `state` を assert。

---

## 公開時の注意

学習・実験目的のリポジトリです。**モンスターストライク／モンストの公式名称・キャラ・画像・音声・UI 等は一切使わない**こと。独自素材・独自名称（"Pull Strike" など）で公開してください。

---

## 参考

- [モンスト 公式: 遊び方](https://www.monster-strike.com/howto/)
- [MDN: Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [MDN: Pointer events](https://developer.mozilla.org/docs/Web/API/Pointer_events)
- [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
