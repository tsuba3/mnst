import { StageDef } from "../game/types";

export const stage001: StageDef = {
  id: "stage001",
  width: 540,
  height: 960,
  players: [
    { id: "P1", x: 200, y: 800, r: 26, hp: 200, pierce: false, attack: 24 },
    { id: "P2", x: 340, y: 800, r: 26, hp: 200, pierce: true, attack: 18 },
  ],
  enemies: [
    { id: "E1", x: 150, y: 240, r: 36, hp: 120 },
    { id: "E2", x: 390, y: 240, r: 36, hp: 120 },
    { id: "E3", x: 270, y: 380, r: 44, hp: 220 },
  ],
};
