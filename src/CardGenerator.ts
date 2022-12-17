import { Card, CardColor, CardColorType } from "@lebogo/onu2-shared";
import { GameMode } from "./GameModes/GameMode";

export class CardGenerator {
    constructor(public mode: GameMode) {}

    getAllColors(): CardColorType[] {
        const { presets } = this.mode;
        const colors = new Set();
        for (const preset of presets) {
            for (const color of preset.colors) {
                colors.add(color);
            }
        }
        return [...colors] as CardColorType[];
    }

    generate(size: number) {
        const cards: Card[] = [];
        const { presets } = this.mode;
        for (let i = 0; i < size; i++) {
            // TODO: Improve this algorithm for efficiency

            let presetCards = [];
            let colors = new Set();
            for (const preset of presets) {
                for (const color of preset.colors) {
                    colors.add(color);
                    for (const type of preset.types) {
                        presetCards.push({ color, type });
                    }
                }
            }

            // pick a random color
            const color = [...colors][Math.floor(Math.random() * colors.size)];

            // pick a random card with that color
            const pickedCard = presetCards
                .filter((c) => c.color === color)
                .sort(() => Math.random() - 0.5)[0];

            const card = new Card(pickedCard.type, new CardColor(pickedCard.color));

            cards.push(card);

            // const color: CardColorType = colors[Math.floor(Math.random() * colors.length)];
            // const type: CardType = types[Math.floor(Math.random() * types.length)];

            // const card = new Card(type, new CardColor(color));
            // cards.push(card);
        }
        return cards;
    }
}
