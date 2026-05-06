# 04 — Stage Definition

実装: `src/game/types.ts` の `StageDef`、`src/stages/*.ts` または `src/stages/*.json`。

## スキーマ

```ts
type StageDef = {
  id: string;            // ステージID。ファイル名と一致させる
  width: number;         // ステージの幅 (px)
  height: number;        // ステージの高さ (px)
  players: Array<{
    id: string;          // ステージ内ユニーク
    x: number;
    y: number;
    r: number;           // 半径
    hp: number;          // 最大HP兼初期HP
    pierce: boolean;     // true なら貫通タイプ、false なら反射タイプ
    attack: number;      // 速度補正前の攻撃基礎値
  }>;
  enemies: Array<{
    id: string;
    x: number;
    y: number;
    r: number;
    hp: number;
  }>;
};
```

## JSON 例

```json
{
  "id": "stage001",
  "width": 540,
  "height": 960,
  "players": [
    { "id": "P1", "x": 200, "y": 800, "r": 26, "hp": 200, "pierce": false, "attack": 24 },
    { "id": "P2", "x": 340, "y": 800, "r": 26, "hp": 200, "pierce": true,  "attack": 18 }
  ],
  "enemies": [
    { "id": "E1", "x": 150, "y": 240, "r": 36, "hp": 120 },
    { "id": "E2", "x": 390, "y": 240, "r": 36, "hp": 120 },
    { "id": "E3", "x": 270, "y": 380, "r": 44, "hp": 220 }
  ]
}
```

## 配置ガイドライン

- 内部解像度は **540 × 960 px**（縦 9:16）を基準とする。
- プレイヤー: 通常下段 (`y >= 700`) に並べる。`r = 24〜32`。
- 敵: 上半分 (`y <= 500`) に配置。`r = 32〜60`。
- どの 2 つの円も**初期状態で重ならない**こと。`distance(a, b) > a.r + b.r` を満たす。

## 検証ルール（後続フェーズで追加予定）

ステージロード時のバリデーション:
1. `players.length >= 1`
2. `enemies.length >= 1`
3. すべての ID がユニーク
4. すべての円が `0 < x - r` かつ `x + r < width`（同じく y）
5. 円同士が重なっていない

## 命名規則

- ID 接頭辞: 味方 `P*`、敵 `E*`、後続フェーズで召喚物 `S*`。
- ステージ ID: `stage{NNN}`。
- ファイル名はステージ ID と一致させる。`stage001.ts` / `stage001.json`。

## 拡張予定（追加フィールド）

| Phase | フィールド | 用途 |
|---|---|---|
| 3 | `players[].friendship: FriendshipDef` | 友情コンボ |
| 4 | `enemies[].attackInterval` `attackPattern` | 敵ターン |
| 5 | `players[].skill: SkillDef` `skillCooldown` | スキル |
| 1 | `turnLimit: number` | ターン上限 |
| 1 | `obstacles: Array<...>` | 静的な壁 / ブロック |

これらは追加時に新規フィールドとして拡張し、**既存ステージの後方互換は保つ**こと（未指定なら無効化）。
