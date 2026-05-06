export type EntityKind = "player" | "ally" | "enemy";

export type CircleBody = {
  id: string;
  kind: EntityKind;
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  pierce: boolean;
  attack: number;
};

export type GamePhase =
  | "aiming"
  | "moving"
  | "enemyTurn"
  | "stageClear"
  | "gameOver";

export type StageDef = {
  id: string;
  width: number;
  height: number;
  players: Array<{
    id: string;
    x: number;
    y: number;
    r: number;
    hp: number;
    pierce: boolean;
    attack: number;
  }>;
  enemies: Array<{
    id: string;
    x: number;
    y: number;
    r: number;
    hp: number;
  }>;
};

export type GameEvent =
  | { t: "fire"; turn: number; playerId: string; vx: number; vy: number }
  | { t: "wallBounce"; turn: number; bodyId: string; axis: "x" | "y" }
  | {
      t: "hit";
      turn: number;
      attackerId: string;
      targetId: string;
      damage: number;
      targetHpAfter: number;
    }
  | { t: "kill"; turn: number; targetId: string }
  | { t: "stop"; turn: number; bodyId: string }
  | { t: "phase"; turn: number; from: GamePhase; to: GamePhase }
  | { t: "stageClear"; turn: number }
  | { t: "gameOver"; turn: number };

export type GameState = {
  phase: GamePhase;
  turn: number;
  width: number;
  height: number;
  activePlayerIndex: number;
  bodies: CircleBody[];
  events: GameEvent[];
  rngSeed: number;
  tick: number;
};
