# 02 — Game Flow

実装: `src/game/Game.ts`

## フェーズ

```
"aiming"      → ユーザー / AI の入力待ち。プレイヤーキャラ静止。
"moving"      → 物理が動いている最中。すべての player/ally が停止するまで継続。
"enemyTurn"   → 敵の行動。Phase 4 までは即座に次の aiming へ。
"stageClear"  → 全敵 HP=0 達成時の終端。
"gameOver"    → 全味方 HP=0 達成時の終端。
```

## 状態遷移図

```
[aiming] --fire--> [moving] --allStopped--> [enemyTurn]
                       |                       |
                       +---enemiesAllDead-->[stageClear]
                                              ^
                                              |
                       (allStopped) --enemyAct--> [aiming] (次のキャラへ)
                                                    |
                                              alliesAllDead
                                                    v
                                              [gameOver]
```

## ターン進行

- `state.turn` は **1 始まり**。`fire` ではなく `aiming → ... → 次の aiming` に戻ったタイミングで `+1` する。
- `state.activePlayerIndex` は `bodies` 内の `kind === "player"` の配列上のインデックス。
- 死亡したプレイヤーはスキップされる。全員死亡で `gameOver`。

## イベント発火

各遷移で `GameEvent` を発火する（詳細: [05-events.md](./05-events.md)）。

- `aiming → moving`: `phase` イベント、続けて `fire` イベントを 1 件
- 衝突発生: `hit` （撃破時 `kill` も）
- 壁ヒット: `wallBounce`
- プレイヤー停止: `stop`
- フェーズ変化: `phase` （from/to）
- 終端: `stageClear` / `gameOver`

## 公開 API（人間操作 + AI 操作）

詳細は [03-ai-api.md](./03-ai-api.md)。

```ts
// 人間: Pointer Events から
game.fireFromPull(pullDx, pullDy)

// AI / テスト: 角度 + パワーで直接発射
game.fire({ angleDeg: -90, power: 0.7 })
game.fire({ vx: 100, vy: -1200 })
```

両方とも、最終的には同じ `fire(...)` を経由するので、観測される `GameEvent` は同形式。

## 停止判定の方針

- `STOP_SPEED = 18 px/s` 未満で停止扱い。
- 1 体ずつではなく **「すべての player/ally が停止」** したら次フェーズへ。
- 友情コンボや味方ぶつかりが入ったら、衝突相手の速度が再注入されるので、停止判定は再チェックされる構造を維持する。
