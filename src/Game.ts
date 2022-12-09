import { BaseEvent, EventSystem } from "@lebogo/eventsystem";
import {
    Card,
    CardColor,
    CardColorType,
    CardPlacedEvent,
    CardRequestEvent,
    ColorWishEvent,
    GameOverEvent,
    GameStartEvent,
    getGameMode,
    JoinedLobbyEvent,
    OnuSettings,
    PlayerDoneEvent,
    PlayerJoinedEvent,
    PlayerLeftEvent,
    PlayerlistPlayer,
    PlayerTurnEvent,
    SettingsChangedEvent,
    UpdateAdminEvent,
    UpdateDeckEvent,
    UpdateDrawAmountEvent,
    UpdatePlayerlistEvent,
} from "@lebogo/onu2-shared";
import { CardGenerator } from "./CardGenerator";
import { ClientConnection } from "./ClientConnection";
import { Player } from "./Player";

export class Game extends EventSystem {
    players: Player[] = [];
    spectators: Player[] = [];
    activePlayer: number = -1;
    startingPlayerCount: number = 0;
    topCard: Card = new Card("w", new CardColor("c"));
    drawAmount: number = 1;
    cardGenerator?: CardGenerator;
    started: boolean = false;
    admin: Player | undefined;
    settings: OnuSettings = {
        cardAmount: {
            name: "Card amount",
            value: "7",
            defaults: ["5", "7", "10", "15", "20"],
        },
        gameMode: {
            name: "Gamemode",
            value: "Classic",
            defaults: ["Classic", "Lite", "Special"],
        },
    };
    constructor(public lobbyCode: string) {
        super();
    }

    addDrawAmount(amount: number) {
        this.drawAmount = (this.drawAmount == 1 ? 0 : this.drawAmount) + amount;
        this.broadcastEvent(new UpdateDrawAmountEvent(this.drawAmount));
    }

    resetDrawAmount() {
        this.drawAmount = 1;
    }

    join(username: string, connection: ClientConnection) {
        const player = new Player(this, connection, username);

        if (!this.admin) this.admin = player;

        this.spectators.push(player);
        connection.send(new JoinedLobbyEvent(player.uuid));

        // Send current settings and the lobby admin to the new player
        connection.send(new SettingsChangedEvent(this.settings));
        connection.send(new UpdateAdminEvent(this.admin.uuid));

        // Update playerlist for all clients
        // TODO: This may be redundant because of the playerleft event.
        // This needs to be fixed on the client side.
        this.broadcastPlayerlist();

        // Send playerjoined event to all clients and internally
        const playerJoinedEvent = new PlayerJoinedEvent(username, player.uuid);
        this.broadcastEvent(playerJoinedEvent);
        this.emit(playerJoinedEvent);

        if (this.started) {
            connection.send(new GameStartEvent());
        }
    }

    broadcastPlayerlist() {
        let playerlist: PlayerlistPlayer[] = this.players
            .map((player, index) => {
                return {
                    username: player.username,
                    uuid: player.uuid,
                    cardCount: player.deck.length,
                    active: index == this.activePlayer,
                    spectating: false,
                };
            })
            .concat(
                this.spectators.map((player) => {
                    return {
                        username: player.username,
                        uuid: player.uuid,
                        cardCount: player.deck.length,
                        active: false,
                        spectating: true,
                    };
                })
            );

        new UpdatePlayerlistEvent(playerlist);

        this.broadcastEvent(new UpdatePlayerlistEvent(playerlist));
    }

    leave(leftPlayer: Player) {
        if (this.isPlayersTurn(leftPlayer)) {
            this.activePlayer--;
            this.nextPlayer(1);
        }

        this.players = this.players.filter((player) => player.username != leftPlayer.username);
        this.spectators = this.spectators.filter(
            (player) => player.username != leftPlayer.username
        );

        // Update playerlist for all clients
        // TODO: This may be redundant because of the playerleft event.
        // This needs to be fixed on the client side.
        this.broadcastPlayerlist();

        // Send playerleft event to all clients and internally
        const playerLeftEvent = new PlayerLeftEvent(leftPlayer.uuid);
        this.broadcastEvent(playerLeftEvent);
        this.emit(playerLeftEvent);

        if ([...this.players, ...this.spectators].length != 0) {
            if (this.admin == leftPlayer) {
                this.admin = [...this.players, ...this.spectators][0];
                this.broadcastEvent(new UpdateAdminEvent(this.admin.uuid));
            }
        } else {
            this.broadcastEvent(new GameOverEvent());
            this.started = false;
        }
    }

    isAdmin(player: Player): boolean {
        return this.admin == player;
    }

    start() {
        this.started = true;

        this.players = [...this.spectators];
        this.spectators = [];

        this.startingPlayerCount = this.players.length;
        console.log(`Starting game with ${this.players.length} players.`);

        this.cardGenerator = new CardGenerator(
            getGameMode(this.settings.gameMode.value || "classic")
        );

        this.activePlayer = 0;
        this.drawAmount = 1;

        this.broadcastEvent(new GameStartEvent());

        for (let player of this.players) {
            const cards = this.cardGenerator.generate(
                parseInt(this.settings.cardAmount.value || "7")
            );
            player.deck = cards;
            player.connection.send(new UpdateDeckEvent(player.deck));
        }

        this.broadcastEvent(new PlayerTurnEvent(this.players[this.activePlayer].uuid));
        this.topCard = this.cardGenerator.generate(1)[0];
        this.broadcastEvent(new CardPlacedEvent(this.topCard));
        this.broadcastEvent(new UpdateDrawAmountEvent(this.drawAmount));
        this.broadcastPlayerlist();
    }

    nextPlayer(skip: number = 1) {
        while (skip != 0) {
            this.activePlayer++;
            skip--;

            if (this.activePlayer >= this.players.length) {
                this.activePlayer = 0;
            }
        }

        if (this.players[this.activePlayer])
            this.broadcastEvent(new PlayerTurnEvent(this.players[this.activePlayer].uuid));

        this.broadcastPlayerlist();
    }

    isPlayersTurn(player: Player): boolean {
        return this.players[this.activePlayer] == player;
    }

    drawCards(player: Player) {
        if (!this.isPlayersTurn(player)) return;

        const cards = this.cardGenerator!.generate(this.drawAmount);
        this.resetDrawAmount();
        this.broadcastEvent(new UpdateDrawAmountEvent(this.drawAmount));
        player.deck.push(...cards);

        // Respond to the player -> play animation
        player.connection.send(new CardRequestEvent());
        // Update the deck for this player
        player.connection.send(new UpdateDeckEvent(player.deck));

        this.nextPlayer(1);
    }

    playerDone(player: Player) {
        // Check if the player has won
        if (player.deck.length == 0) {
            this.broadcastEvent(new PlayerDoneEvent(player.uuid));
            // Move player to spectators
            this.spectators.push(player);
            this.players = this.players.filter((p) => p.uuid != player.uuid);

            console.log("Player", player.username, "is done.");

            this.activePlayer--;
            console.log("Active player is now", this.activePlayer);
        }

        // Check if the game is over
        if (
            (this.players.length == 1 && this.startingPlayerCount > 1) ||
            this.players.length == 0
        ) {
            this.broadcastEvent(new GameOverEvent());
            this.started = false;
            return;
        }
    }

    colorWished(player: Player, color?: CardColorType) {
        player.wishing = false;
        if (!this.isPlayersTurn(player)) return;

        if (player.deck.length == 0) this.playerDone(player);

        // If no color was specified, the next player can choose the color
        if (!color) return this.nextPlayer(1);

        this.topCard.color.color = color;

        // Update top card of all players
        this.broadcastEvent(new CardPlacedEvent(this.topCard));

        // Increment player since the player who wished the color is done.
        this.nextPlayer(1);
    }

    placeCard(card: Card, player: Player) {
        if (player.wishing) return;
        if (!this.isPlayersTurn(player)) return;

        // Check if the card is in the players deck
        const deckCard = player.deck.find((deckCard) => deckCard.id == card.id);
        if (!deckCard) return;

        // Check if the played card is valid
        const validTurn = this.topCard.compare(card);
        if (!validTurn) return;

        // Check if the player has to draw cards and can't play a draw card
        if (this.drawAmount > 1 && !(card.type == "p2" || card.type == "p4")) return;

        this.topCard = deckCard;

        // Remove the card from the players deck
        player.deck = player.deck.filter((card) => card.id != deckCard.id);
        this.broadcastEvent(new CardPlacedEvent(deckCard));

        // Handle special cards
        switch (deckCard.type) {
            case "p4":
                this.addDrawAmount(4);
            case "w":
                player.wishing = true;
                player.connection.send(new ColorWishEvent());
                // Don't skip the player. Only skip after the player has chosen a color.
                return;

            case "p2": // Add 2 to the draw amount
                this.addDrawAmount(2);
                break;

            case "sk": // Skip next player -> advance twice
                if (player.deck.length == 0) this.playerDone(player);
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

        if (player.deck.length == 0) this.playerDone(player);

        this.nextPlayer(1);
    }

    broadcastEvent(event: BaseEvent) {
        [...this.players, ...this.spectators].forEach((player) => {
            player.connection.send(event);
        });
    }
}
