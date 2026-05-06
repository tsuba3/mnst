# 01 — Physics

物理ステップは **固定タイムステップ** で進める。`Game.advance(dt)` が実時間 dt を累算し、`FIXED_DT` 単位で `stepOnce()` を呼ぶ。

実装: `src/game/physics.ts`

## 定数（一次情報）

| 名前 | 値 | 単位 | 意味 |
|---|---|---|---|
| `FIXED_DT` | `1 / 60` | 秒 | 1 ティックの時間 |
| `STOP_SPEED` | `18` | px/s | これ未満で停止扱い |
| `DAMPING_PER_SEC` | `1.6` | 1/s | 減衰係数（`exp(-DAMPING_PER_SEC * dt)` を毎ティック乗算） |
| `MAX_SPEED` | `1400` | px/s | 速度上限（超えたら正規化して再スケール） |
| `PULL_TO_SPEED` | `6` | (px/px)·(1/s) | ひっぱり px → 速度 px/s 変換係数（`Game.ts` 側） |
| `MAX_PULL` | `220` | px | ひっぱり長さ上限 |

## 1 ティックの順序

毎ティックで以下を**この順番**に実行する:

```
1. 移動 + 速度上限クランプ
2. 壁反射 (player/ally のみ)
3. プレイヤー × 敵 衝突 (反射/貫通/ダメージ)
4. 減速 + 停止判定
```

順序が重要: 「移動 → 壁反射 → 衝突 → 減速」を変えると、めり込み補正の位置や反射ベクトルの方向が変わる。

## 1. 移動

```ts
b.x += b.vx * dt;
b.y += b.vy * dt;
```

その前に `|v| > MAX_SPEED` ならベクトルを正規化して `MAX_SPEED` にクランプする。

## 2. 壁反射

`player` と `ally` のみ反射する。`enemy` は今は静止している前提。

```ts
if (b.x - b.r < 0)        { b.x = b.r;          b.vx = -b.vx; emit("wallBounce", "x"); }
if (b.x + b.r > width)    { b.x = width - b.r;  b.vx = -b.vx; emit("wallBounce", "x"); }
if (b.y - b.r < 0)        { b.y = b.r;          b.vy = -b.vy; emit("wallBounce", "y"); }
if (b.y + b.r > height)   { b.y = height - b.r; b.vy = -b.vy; emit("wallBounce", "y"); }
```

## 3. プレイヤー × 敵 衝突

- 双方が円。距離が `aR + bR` 以下で衝突判定。
- `STOP_SPEED` 未満の player/ally は判定しない（停止しているものは攻撃しない）。
- 衝突したら次の処理を行う:

### 3.1. めり込み補正

衝突法線 `n = (a - b) / |a - b|` 方向に、重なり量 `overlap = (aR + bR) - |a - b|` だけ a を押し戻す。

### 3.2. ダメージ

```ts
damage = round(a.attack * (0.5 + speed / 600))
```

- `speed` は当たった瞬間の `|v|`。
- 最低でも `attack * 0.5`、`speed=600` で `attack * 1.5` のスケール。

### 3.3. 反射 / 貫通

- `a.pierce === true` のときは反射せず、ダメージのみ与える。**現状: 同一敵への連続ヒット抑制が無いため、貫通弾は重なっている間ティックごとにヒットする**（要改善 → Phase 2 でクールダウン導入予定）。
- それ以外は法線で速度を反射:
  ```ts
  v' = v - 2 * (v · n) * n
  ```
- 敵 HP が 0 になったら `kill` イベント。

## 4. 減速 + 停止判定

```ts
const damping = exp(-DAMPING_PER_SEC * dt);
b.vx *= damping;
b.vy *= damping;
if (|v| < STOP_SPEED) { v = 0; emit("stop"); }
```

すべての player/ally が停止したら、`Game` 側でフェーズ遷移 (`moving → enemyTurn → aiming`) を発火する。

## 既知の課題（Phase 2 で対応）

- **同一敵への連続ヒット抑制**: pierce が極端に強い。`attackerId × targetId` ごとに 0.05〜0.10 秒のクールダウン。
- **角コーナーでの嵌まり**: 壁2軸同時反射で速度が 0 に近い場合の挙動。要観察。
- **トンネリング**: 高速かつ小半径の敵を追加した場合に発生する可能性。今のサイズ感では問題なし。
