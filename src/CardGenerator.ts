import { Card, CardColor, CardColorType, CardType } from "../../OnuShared/src/Card";
import { GameMode } from "../../OnuShared/src/GameMode";

export class CardGenerator {
    constructor(public mode: GameMode) {}

    generate(size: number) {
        const cards: Card[] = [];
        const { presets } = this.mode;
        for (let i = 0; i < size; i++) {
            const { colors, types } = presets[Math.floor(Math.random() * presets.length)];

            const color: CardColorType = colors[Math.floor(Math.random() * colors.length)];
            const type: CardType = types[Math.floor(Math.random() * types.length)];

            const card = new Card(type, new CardColor(color));
            cards.push(card);
        }
        return cards;
    }
}
