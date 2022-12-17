import { Card } from "@lebogo/onu2-shared";
import { CardGenerator } from "../CardGenerator";
import { CardPreset } from "../CardPreset";
import { Game } from "../Game";
import { Player } from "../Player";

export abstract class GameMode {
    name: string = "";
    description: string = "None";
    cardGenerator!: CardGenerator;
    game: Game;
    presets: CardPreset[] = [];

    constructor(game: Game) {
        this.game = game;
    }

    start() {}

    cleanup() {}

    cardPlaced(card: Card, player: Player) {}
}
