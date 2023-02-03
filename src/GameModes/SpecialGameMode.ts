import {
    Card,
    CardColor,
    ColorWishEvent,
    UpdateColorEvent,
    UpdateDeckEvent,
} from "@lebogo/onu2-shared";
import { CardGenerator } from "../CardGenerator";
import { CardPreset } from "../CardPreset";
import { EXTENDED_ACTION_PRESET } from "../CardPresets/ExtendedActionPreset";
import { EXTENDED_CLASSIC_PRESET } from "../CardPresets/ExtendedClassicPreset";
import { RANDOM_COLOR_PRESET } from "../CardPresets/RandomColorPreset";
import { RANDOM_CYCLE_PRESET } from "../CardPresets/RandomCyclePreset";
import { WISH_PRESET } from "../CardPresets/WishPreset";
import { Game } from "../Game";
import { Player } from "../Player";
import { ClassicGameMode } from "./ClassicGameMode";

export class SpecialGameMode extends ClassicGameMode {
    name: string = "Special";
    description: string = `An extended version of the classic gamemode. It adds three additional cards and two additional colors.
                    Cyan can be placed on blue and green cards and Purple can be placed on red and blue cards (and vice versa).
                    The three additional cards are the 'Random', 'Cycle' and 'Random Color' cards. The 'Random' card shuffles the decks of all player together and distributes them evenly. The 'Cycle' card cycles the cards of each player. Player 1 gets the cards of player 2, player 2 gets the cards of player 3, etc. The 'Random Color'card can be placed on any color and takes a random color when placed.`;

    presets: CardPreset[] = [
        EXTENDED_CLASSIC_PRESET,
        WISH_PRESET,
        EXTENDED_ACTION_PRESET,
        RANDOM_CYCLE_PRESET,
        RANDOM_COLOR_PRESET,
    ];

    constructor(game: Game) {
        super(game);
        this.cardGenerator = new CardGenerator(this);
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
                this.game.nextPlayer(2);
                return;

            case "sw": // Reverse the player order
                this.game.players.reverse();
                this.game.activePlayer = this.game.players.length - this.game.activePlayer - 1;
                break;

            case "rd": // Collect all cards from the players and distribute them evenly
                let cards: Card[] = [];
                for (let player of this.game.players) {
                    cards.push(...player.deck);
                    player.deck = [];
                }

                // Shuffle the cards
                cards = cards.sort(() => Math.random() - 0.5);

                // loop over all players and give them a card until there are no cards left
                while (cards.length > 0) {
                    for (let player of this.game.players.filter(
                        (player) => player.spectating == false
                    )) {
                        if (cards.length == 0) break;
                        player.deck.push(cards.pop()!);
                    }
                }

                // Update the decks of all players
                for (let player of this.game.players) {
                    player.connection.send(new UpdateDeckEvent(player.deck));
                }
                break;

            case "cy": // Cycle the cards of each player. Player 1 gets the cards of player 2, player 2 gets the cards of player 3, etc.
                const lastPlayer = [...this.game.players].pop();
                if (lastPlayer) [...this.game.players].unshift(lastPlayer);

                // Update the decks of all players
                var previousDeck = this.game.players[this.game.players.length - 1].deck;
                for (let player of this.game.players) {
                    const currentDeck = player.deck;
                    player.deck = previousDeck;
                    previousDeck = currentDeck;
                    player.connection.send(new UpdateDeckEvent(player.deck));
                }

                break;
            case "rc":
                let allColors = this.cardGenerator.getAllColors();
                while (!allColors) allColors = this.cardGenerator.getAllColors();
                let color = allColors[Math.floor(Math.random() * allColors.length)];
                this.game.topCard.color = new CardColor(color);
                this.game.broadcastEvent(new UpdateColorEvent(this.game.topCard.color));

                break;
            default:
                break;
        }

        this.game.nextPlayer(1);
    }
}
