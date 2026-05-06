# 03 — AI Operation API

ブラウザ起動後、`window.__game` にゲーム操作 API がぶら下がる。
**Playwright MCP / Puppeteer / DevTools コンソール / 任意のスクレイパからすべて同じ API を叩ける**ことを前提とする。

実装: `src/main.ts` の末尾。

## 設計原則

- **副作用は最小限**: getter は state を変えない。setter は明示的に変える。
- **JSON シリアライズ可能**: `getState()` は構造化クローン可能なオブジェクトのみを返す。
- **戻り値で結果を伝える**: `fire()` は受理されたかを `boolean` で返す（aiming 以外なら false）。
- **観測は events 経由**: 何が起きたかは構造化イベント配列で取得する。例外/console を使わない。

## 一覧

| 関数 | 戻り値 | 役割 |
|---|---|---|
| `version` | string | API バージョン |
| `getState()` | `GameState` | 現在状態（読み取り）|
| `snapshot()` | `GameState` | ディープコピー（保存用） |
| `loadState(s)` | void | 任意の状態を復元（テスト用） |
| `fire({...})` | boolean | 発射。aiming のときだけ受理 |
| `pull(dx, dy, playerId?)` | boolean | ひっぱりベクトル → 発射 |
| `step(seconds?)` | void | 物理を `seconds` 進める。デフォルト 1/60 |
| `stepOnce()` | `GameEvent[]` | 1 ティックだけ進めて発火イベントを返す |
| `pause()` / `resume()` | void | RAF とは独立に物理を止める |
| `reset(seed?)` | void | 初期状態 + シードで再構築 |
| `events()` | `GameEvent[]` | 起動以降のイベント全件 |
| `clearEvents()` | void | イベントログを空にする |
| `setActivePlayer(id)` | void | アクティブな味方を切替 |
| `setDebug(v)` | void | 速度ベクトル等のオーバーレイ |
| `activePlayerId()` | string \| null | 現在のアクティブ味方 ID |

## 引数

### `fire(p)`

```ts
type FireParams = {
  // どちらかで方向を指定 (angleRad 優先)
  angleRad?: number;
  angleDeg?: number;
  // 0..1 の正規化パワー (× MAX_SPEED)
  power: number;
  // 直接速度を渡したい場合 (angle/power より優先)
  vx?: number;
  vy?: number;
  // 操作するプレイヤー ID (省略時は activePlayer)
  playerId?: string;
}
```

- 角度は **画面座標系**: 0° = +X (右), -90° = -Y (上), +90° = +Y (下)。
- `aiming` 以外で呼ぶと `false` を返して何もしない。

### `pull(dx, dy, playerId?)`

- `(dx, dy)` は「ひっぱった方向のベクトル」。実際の発射方向は **その逆**。
- 長さ `< 8 px` なら受理しない（誤タップ防止）。
- 内部的には `MAX_PULL` でクリップされる。

## 典型的な AI ループ

```ts
// 1. 現在状態を取る
const s = window.__game.getState();
const me = s.bodies.find(b => b.id === window.__game.activePlayerId());
const target = s.bodies.find(b => b.kind === "enemy" && b.hp > 0);

// 2. 角度を計算
const angle = Math.atan2(target.y - me.y, target.x - me.x);

// 3. 発射
window.__game.fire({ angleRad: angle, power: 0.85 });

// 4. 物理が落ち着くまで待つ (Playwright なら browser_wait_for)
await new Promise(r => setTimeout(r, 3000));

// 5. 結果観測
const evs = window.__game.events().filter(e => e.turn === s.turn);
const damage = evs.filter(e => e.t === "hit").reduce((a, e) => a + e.damage, 0);
```

## ヘッドレス進行 (`step` / `stepOnce`)

`requestAnimationFrame` を待たず、ティックを **手動で** 進められる。

```ts
window.__game.fire({ angleDeg: -90, power: 1.0 });
let safety = 0;
while (window.__game.getState().phase === "moving" && safety++ < 1000) {
  window.__game.stepOnce();
}
```

これで AI は「実時間を待たずに」何百ステージも回せる。

## スナップショット駆動テスト

```ts
const before = window.__game.snapshot();
window.__game.fire({ angleDeg: -90, power: 0.5 });
window.__game.step(2.0);
const after = window.__game.getState();
window.__game.loadState(before); // やり直し
```

- `snapshot()` は完全な deep copy。同じ `GameState` を別ブラウザに送って再現することもできる。
- `loadState()` は乱数の状態と tick もそのまま戻す。

## バージョニング

- 破壊的変更を入れたら `version` を上げ、CHANGELOG（このファイルの末尾）に書く。

## 変更履歴

- `0.1.0`: 初期 API（getState/fire/pull/step/snapshot/loadState/events/...）
