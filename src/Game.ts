import { BaseEvent, EventSystem } from "@lebogo/eventsystem";
import {
    Card,
    CardColor,
    CardPlacedEvent,
    CardRequestEvent,
    ColorWishEvent,
    GameStartEvent,
    getGameMode,
    JoinedLobbyEvent,
    OnuSettings,
    PlayerDoneEvent,
    PlayerJoinedEvent,
    PlayerLeftEvent,
    PlayerlistPlayer,
    SettingsChangedEvent,
    UpdateDeckEvent,
    UpdatePlayerlistEvent,
} from "@lebogo/onu2-shared";
import { CardGenerator } from "./CardGenerator";
import { ClientConnection } from "./ClientConnection";
import { Player } from "./Player";

export class Game extends EventSystem {
    players: Player[] = [];
    lobbyPlayerlist: Player[] = [];
    activePlayer: number = -1;
    topCard: Card = new Card("w", new CardColor("c"));
    drawAmount: number = 0;
    cardGenerator?: CardGenerator;
    settings: OnuSettings = {
        cardAmount: {
            name: "Card amount",
            value: "7",
            defaults: ["5", "7", "10", "15", "20"],
        },
        gameMode: {
            name: "Gamemode",
            value: "Classic",
            defaults: ["Special", "Classic"],
        },
    };
    constructor(public lobbyCode: string) {
        super();
    }

    join(username: string, connection: ClientConnection) {
        const player = new Player(this, connection, username);

        this.players.push(player);
        connection.send(new JoinedLobbyEvent(player.uuid, player.hash));

        // Send current settings to the new player
        connection.send(new SettingsChangedEvent(this.settings));

        // Update playerlist for all clients
        // TODO: This may be redundant because of the playerleft event.
        // This needs to be fixed on the client side.
        this.broadcastPlayerlist();

        // Send playerjoined event to all clients and internally
        const playerJoinedEvent = new PlayerJoinedEvent(username, player.uuid);
        this.broadcastEvent(playerJoinedEvent);
        this.emit(playerJoinedEvent);
    }

    broadcastPlayerlist() {
        const playerlist: PlayerlistPlayer[] = this.players.map((player, index) => {
            return {
                username: player.username,
                hash: player.hash,
                cardCount: player.deck.length,
                active: index == this.activePlayer,
            };
        });
        this.broadcastEvent(new UpdatePlayerlistEvent(playerlist));
    }

    leave(leftPlayer: Player) {
        this.players = this.players.filter((player) => player.username != leftPlayer.username);

        // Update playerlist for all clients
        // TODO: This may be redundant because of the playerleft event.
        // This needs to be fixed on the client side.
        this.broadcastPlayerlist();

        // Send playerleft event to all clients and internally
        const playerLeftEvent = new PlayerLeftEvent(leftPlayer.uuid);
        this.broadcastEvent(playerLeftEvent);
        this.emit(playerLeftEvent);
    }

    isAdmin(player: Player): boolean {
        return this.players.indexOf(player) == 0;
    }

    start() {
        this.cardGenerator = new CardGenerator(
            getGameMode(this.settings.gameMode.value || "classic")
        );

        this.activePlayer = 0;

        for (let player of this.players) {
            const cards = this.cardGenerator.generate(
                parseInt(this.settings.cardAmount.value || "7")
            );
            player.deck.push(...cards);
            player.connection.send(new GameStartEvent());
            player.connection.send(new UpdateDeckEvent(player.deck));
        }
    }

    nextPlayer(skip: number = 1) {
        this.activePlayer += skip;
        if (this.activePlayer >= this.players.length) {
            console.log(this.players.length - this.activePlayer);

            this.activePlayer = 0;
        }
    }

    isPlayersTurn(player: Player): boolean {
        return this.players[this.activePlayer] == player;
    }

    drawCards(player: Player) {
        if (!this.isPlayersTurn(player)) return;

        const cards = this.cardGenerator!.generate(this.drawAmount);
        this.drawAmount = 1;
        player.deck.push(...cards);

        // Respond to the player -> play animation
        player.connection.send(new CardRequestEvent());
        // Update the deck for this player
        player.connection.send(new UpdateDeckEvent(player.deck));
    }

    placeCard(card: Card, player: Player) {
        if (!this.isPlayersTurn(player)) return;

        // Check if the card is in the players deck
        const deckCard = player.deck.find((deckCard) => deckCard.id == card.id);
        if (!deckCard) return;

        // Check if the played card is valid
        const validTurn = this.topCard.compare(card);
        if (!validTurn) return;

        // Check if the player has to draw cards and can't play a draw card
        if (this.drawAmount > 0 && !(card.type == "p2" || card.type == "p4")) return;

        this.topCard = deckCard;

        // Remove the card from the players deck
        player.deck = player.deck.filter((card) => card.id != deckCard.id);
        this.broadcastEvent(new CardPlacedEvent(deckCard));

        console.log(deckCard);

        // Check if the player has won
        if (player.deck.length == 0) {
            this.broadcastEvent(new PlayerDoneEvent(player.uuid));
            // TODO: Add player to spectators
        }

        // Handle special cards
        switch (deckCard.type) {
            case "w":
            case "p4":
                player.connection.send(new ColorWishEvent());
            case "p4":
                this.drawAmount += 4;
                // Don't skip the player. Only skip after the player has chosen a color.
                return;

            case "p2": // Add 2 to the draw amount
                this.drawAmount += 2;
                break;

            case "sk": // Skip next player -> advance twice
                this.nextPlayer(2);
                return;

            case "sw": // Reverse the player order
                this.players.reverse();
                this.activePlayer = this.players.length - this.activePlayer - 1;
                break;

            case "rd": // Collect all cards from the players and distribute them evenly
                let cards: Card[] = [];
                for (let player of this.players) {
                    cards.push(...player.deck);
                    player.deck = [];
                }

                // Shuffle the cards
                cards = cards.sort(() => Math.random() - 0.5);

                // loop over all players and give them a card until there are no cards left
                while (cards.length > 0) {
                    for (let player of this.players) {
                        if (cards.length == 0) break;
                        player.deck.push(cards.pop()!);
                    }
                }

                // Update the decks of all players
                for (let player of this.players) {
                    player.connection.send(new UpdateDeckEvent(player.deck));
                }
                break;

            case "cy": // Cycle the cards of each player. Player 1 gets the cards of player 2, player 2 gets the cards of player 3, etc.
                const lastPlayer = this.players.pop();
                if (lastPlayer) this.players.unshift(lastPlayer);

                // Update the decks of all players
                var previousDeck = this.players[this.players.length - 1].deck;
                for (let player of this.players) {
                    const currentDeck = player.deck;
                    player.deck = previousDeck;
                    previousDeck = currentDeck;
                    player.connection.send(new UpdateDeckEvent(player.deck));
                }

                break;

            default:
                break;
        }

        this.nextPlayer(1);
    }

    broadcastEvent(event: BaseEvent) {
        this.players.forEach((player) => {
            player.connection.send(event);
        });
    }
}
