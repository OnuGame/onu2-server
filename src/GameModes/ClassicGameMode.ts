import {
    Card,
    CardColor,
    CardColorType,
    ColorWishEvent,
    UpdateColorEvent,
    UpdateDeckEvent,
} from "@lebogo/onu2-shared";
import { CardGenerator } from "../CardGenerator";
import { CardPreset } from "../CardPreset";
import { ACTION_PRESET } from "../CardPresets/ActionPreset";
import { CLASSIC_PRESET } from "../CardPresets/ClassicPreset";
import { WISH_PRESET } from "../CardPresets/WishPreset";
import { Game } from "../Game";
import { Player } from "../Player";
import { GameMode } from "./GameMode";

export class ClassicGameMode extends GameMode {
    name: string = "Classic";
    description: string = "The classic Onu game mode.";
    cardGenerator!: CardGenerator;
    wishingPlayer: Player | null = null;
    presets: CardPreset[] = [CLASSIC_PRESET, WISH_PRESET, ACTION_PRESET];

    constructor(game: Game) {
        super(game);
        this.cardGenerator = new CardGenerator(this);
    }

    start(): void {
        this.game.placeTopCard(this.cardGenerator.generate(1)[0]);
        for (let player of this.game.players) {
            const cards = this.cardGenerator.generate(
                parseInt(this.game.settings.cardAmount.value || "7")
            );
            player.deck = cards;
            player.connection.send(new UpdateDeckEvent(player.deck));

            player.connection.registerEvent<ColorWishEvent>("ColorWishEvent", (event) => {
                this.colorWished(player, event.color);
            });
        }
    }

    colorWished(player: Player, color?: CardColorType): void {
        if (!this.game.isPlayersTurn(player)) return;
        this.wishingPlayer = null;

        if (player.deck.length == 0) this.game.playerDone(player);

        // If no color was specified, the next player can choose the color
        if (!color) return this.game.nextPlayer(1);

        this.game.topCard.color.color = color;

        // Update top card of all players
        this.game.broadcastEvent(new UpdateColorEvent(new CardColor(color)));

        // Increment player since the player who wished the color is done.
        this.game.nextPlayer(1);
    }

    cleanup(): void {
        for (let player of this.game.players) {
            player.deck = [];
            player.connection.send(new UpdateDeckEvent(player.deck));
            player.connection.events.delete("ColorWishEvent");
        }
    }

    cardPlaced(card: Card, player: Player) {
        if (!this.game.isPlayersTurn(player)) return;
        if (this.wishingPlayer) return;

        // Check if the card is in the players deck
        const deckCard = player.deck.find((deckCard) => deckCard.id == card.id);
        if (!deckCard) return;

        // Check if the played card is valid
        const validTurn = this.game.topCard.compare(card);
        if (!validTurn) return;

        // Check if the player has to draw cards and can't play a draw card
        if (this.game.drawAmount > 1 && !(card.type == "p2" || card.type == "p4")) return;

        this.game.placeTopCard(deckCard);

        // Remove the card from the players deck
        player.deck = player.deck.filter((card) => card.id != deckCard.id);

        // Handle special cards
        switch (deckCard.type) {
            case "p4":
                this.game.addDrawAmount(4);
            case "w":
                this.wishingPlayer = player;
                player.connection.send(new ColorWishEvent());
                // Don't skip the player. Only skip after the player has chosen a color.
                return;

            case "p2": // Add 2 to the draw amount
                this.game.addDrawAmount(2);
                break;

            case "sk": // Skip next player -> advance twice
                if (player.deck.length == 0) this.game.playerDone(player);
                this.game.nextPlayer(2);
                return;

            case "sw": // Reverse the player order
                this.game.players.reverse();
                this.game.activePlayer = this.game.players.length - this.game.activePlayer - 1;
                break;

            default:
                break;
        }

        if (player.deck.length == 0) this.game.playerDone(player);

        this.game.nextPlayer(1);
    }
}
