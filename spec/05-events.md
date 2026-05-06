# 05 — GameEvent

ゲーム内で起きたことは **すべて `GameEvent` 配列に積む**。
人間も AI も、デバッグや回帰テストではこの配列を読む。例外や `console.log` で起きたことを伝える設計にしない。

実装: `src/game/types.ts`

## 共通フィールド

すべての GameEvent は次の 2 つを持つ。

| フィールド | 型 | 意味 |
|---|---|---|
| `t` | string | discriminant（イベント種別） |
| `turn` | number | 発火時の `state.turn` |

## 種別一覧

```ts
type GameEvent =
  | { t: "fire";        turn; playerId; vx; vy }
  | { t: "wallBounce";  turn; bodyId; axis: "x" | "y" }
  | { t: "hit";         turn; attackerId; targetId; damage; targetHpAfter }
  | { t: "kill";        turn; targetId }
  | { t: "stop";        turn; bodyId }
  | { t: "phase";       turn; from; to }
  | { t: "stageClear";  turn }
  | { t: "gameOver";    turn };
```

### `fire`
- 発射時に 1 回。`vx, vy` は実際にプレイヤーに付与された速度（クランプ後）。

### `wallBounce`
- 壁反射のたびに 1 回。`axis` は反射した軸。

### `hit`
- 衝突 1 回ごとに 1 回。**同一敵に複数ヒットすれば複数回出る**（pierce で頻発）。
- `damage` は実際に削れた量。`targetHpAfter` は適用後の HP。
- 注: 同一敵連続ヒット抑制が入ると、抑制された分はイベントが出ない（spec 01 参照）。

### `kill`
- 敵 HP が 0 になった瞬間に 1 回。`hit` イベントの直後に来る。
- 味方が死んだ場合は将来 `defeat` を別途追加予定。

### `stop`
- 速度 < `STOP_SPEED` で停止判定が入った瞬間に 1 回（プレイヤー1体ごと）。

### `phase`
- フェーズが変わるたびに 1 回。`from` と `to` を持つ。

### `stageClear` / `gameOver`
- 終端ステートに入った瞬間に 1 回。

## 集計のしかた

```ts
const evs = window.__game.events();

const totalDamage = evs.filter(e => e.t === "hit")
                       .reduce((a, e) => a + e.damage, 0);

const killsByPlayer = evs
  .filter(e => e.t === "kill")
  .map(k => evs.findLast(e => e.t === "hit" && e.targetId === k.targetId)?.attackerId);
```

## ロギング方針

- `Game` 内ではイベントを **追加するだけ**。決して既存要素を上書きしない。
- 配列が肥大化するため、長時間ランでは `clearEvents()` をターン境界で呼んでよい。
- 観測されないイベントを生やしてはいけない（仕様にない `t` を入れない）。

## 追加するときのルール

新しいイベントを追加するには:
1. このファイルに種別と意味を**先に**追記する。
2. `types.ts` の `GameEvent` に追加する。
3. `physics.ts` / `Game.ts` で発火させる。
4. AI 操作の典型ループ（`spec/03-ai-api.md`）に依存があれば更新する。
