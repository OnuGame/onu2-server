import { CardGenerator } from "../CardGenerator";
import { CardPreset } from "../CardPreset";
import { CLASSIC_PRESET } from "../CardPresets/ClassicPreset";
import { Game } from "../Game";
import { Player } from "../Player";
import { ClassicGameMode } from "./ClassicGameMode";

export class LiteGameMode extends ClassicGameMode {
    name: string = "Lite";
    description: string = "A lite version of the classic game mode. It removes all special cards.";
    cardGenerator!: CardGenerator;
    wishingPlayer: Player | null = null;
    presets: CardPreset[] = [CLASSIC_PRESET];

    constructor(game: Game) {
        super(game);
        this.cardGenerator = new CardGenerator(this);
    }
}
