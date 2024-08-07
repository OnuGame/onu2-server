import { BaseEvent, EventSystem } from "@lebogo/eventsystem";
import {
    Card,
    CardColor,
    CardPlacedEvent,
    CardRequestEvent,
    DisconnectedEvent,
    GameOverEvent,
    GameStartEvent,
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
import { ClientConnection } from "./ClientConnection";
import { ClassicGameMode } from "./GameModes/ClassicGameMode";
import { GameMode } from "./GameModes/GameMode";
import { LiteGameMode } from "./GameModes/LiteGameMode";
import { SpecialGameMode } from "./GameModes/SpecialGameMode";
import { Logger } from "./Logger";
import { Player } from "./Player";

export class Game extends EventSystem {
    players: Player[] = [];
    spectators: ClientConnection[] = [];
    activePlayer: number = -1;
    startingPlayerCount: number = 0;
    topCard: Card = new Card("w", new CardColor("c"));
    drawAmount: number = 1;
    gameModes: GameMode[] = [
        new ClassicGameMode(this),
        new LiteGameMode(this),
        new SpecialGameMode(this),
    ];
    gameMode: GameMode = this.gameModes[0];
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
            value: this.gameMode.name,
            defaults: this.gameModes.map((gameMode) => gameMode.name),
        },
    };

    constructor(public lobbyCode: string) {
        super();
    }

    setDrawAmount(amount: number) {
        this.drawAmount = amount;
        this.broadcastEvent(new UpdateDrawAmountEvent(this.drawAmount));
    }

    addDrawAmount(amount: number) {
        let newAmount = (this.drawAmount == 1 ? 0 : this.drawAmount) + amount;
        this.setDrawAmount(newAmount);
    }

    resetDrawAmount() {
        this.drawAmount = 1;
    }

    addSpectator(connection: ClientConnection) {
        this.spectators.push(connection);
        connection.registerEvent<DisconnectedEvent>("DisconnectedEvent", () => {
            this.spectators = this.spectators.filter((spectator) => spectator != connection);
        });
    }

    join(username: string, connection: ClientConnection) {
        const player = new Player(this, connection, username);

        if (!this.admin) this.admin = player;

        this.players.push(player);
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
        let playerlist: PlayerlistPlayer[] = [];

        this.getNonSpectatingPlayers().forEach((player, index) => {
            playerlist.push({
                username: player.username,
                uuid: player.uuid,
                cardCount: player.deck.length,
                active: index == this.activePlayer,
                spectating: false,
            });
        });

        this.getSpecatingPlayers().forEach((player) => {
            playerlist.push({
                username: player.username,
                uuid: player.uuid,
                cardCount: player.deck.length,
                active: false,
                spectating: true,
            });
        });

        new UpdatePlayerlistEvent(playerlist);

        this.broadcastEvent(new UpdatePlayerlistEvent(playerlist));
    }

    leave(leftPlayer: Player) {
        if (this.isPlayersTurn(leftPlayer)) {
            this.activePlayer--;
            Logger.log(`Active Player ${leftPlayer.username} left the game. Skipping turn.`);

            this.players = this.players.filter((player) => player.username != leftPlayer.username);
            this.nextPlayer(1);
        } else {
            this.players = this.players.filter((player) => player.username != leftPlayer.username);
        }

        // Update playerlist for all clients
        // TODO: This may be redundant because of the playerleft event.
        // This needs to be fixed on the client side.
        this.broadcastPlayerlist();

        // Send playerleft event to all clients and internally
        const playerLeftEvent = new PlayerLeftEvent(leftPlayer.uuid);
        this.broadcastEvent(playerLeftEvent);
        this.emit(playerLeftEvent);

        if (this.players.length != 0) {
            if (this.admin == leftPlayer) {
                this.admin = this.players[0];
                this.broadcastEvent(new UpdateAdminEvent(this.admin.uuid));
            }
        }
    }

    isAdmin(player: Player): boolean {
        return this.admin == player;
    }

    start() {
        this.started = true;

        this.players.forEach((player) => {
            player.spectating = false;
        });

        this.startingPlayerCount = this.players.length;
        Logger.log(`Starting game with ${this.players.length} players.`);

        this.activePlayer = 0;
        this.drawAmount = 1;

        this.broadcastEvent(new GameStartEvent());

        this.gameMode.start();

        this.nextPlayer(0);

        this.broadcastEvent(new UpdateDrawAmountEvent(this.drawAmount));
        this.broadcastPlayerlist();
    }

    getNonSpectatingPlayers(): Player[] {
        return this.players.filter((player) => !player.spectating);
    }

    getSpecatingPlayers(): Player[] {
        return this.players.filter((player) => player.spectating);
    }

    nextPlayer(skip: number = 1) {
        // check if current player is done

        // TODO: Currently crashing the server when this is called. IMPORTANT TO FIX!
        const players = this.getNonSpectatingPlayers();

        if (players[this.activePlayer] && players[this.activePlayer].deck.length == 0) {
            this.playerDone(players[this.activePlayer]);
        }

        if (players.length == 0) {
            this.broadcastEvent(new GameOverEvent());
            this.started = false;
            return;
        }

        while (skip != 0 && players.length != 0) {
            this.activePlayer++;
            skip--;

            if (this.activePlayer >= this.getNonSpectatingPlayers().length) {
                this.activePlayer = 0;
            }
        }

        if (players[this.activePlayer]) {
            this.broadcastEvent(new PlayerTurnEvent(players[this.activePlayer].uuid));
        } else {
            this.broadcastEvent(new GameOverEvent());
        }

        this.broadcastPlayerlist();
    }

    isPlayersTurn(player: Player): boolean {
        return this.getNonSpectatingPlayers()[this.activePlayer] == player;
    }

    placeTopCard(card: Card) {
        this.topCard = card;
        this.broadcastEvent(new CardPlacedEvent(card));
    }

    drawCards(player: Player) {
        if (!this.isPlayersTurn(player)) return;

        const cards = this.gameMode.cardGenerator.generate(this.drawAmount);
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
        this.broadcastEvent(new PlayerDoneEvent(player.uuid));
        player.spectating = true;

        this.activePlayer--;

        // Check if the game is over
        let playerCount = this.getNonSpectatingPlayers().length;

        if ((playerCount == 1 && this.startingPlayerCount > 1) || playerCount == 0) {
            this.broadcastEvent(new GameOverEvent());
            this.gameMode.cleanup();
            this.started = false;
            return;
        }
    }

    placeCard(card: Card, player: Player) {
        this.gameMode.cardPlaced(card, player);
    }

    broadcastEvent(event: BaseEvent) {
        this.players.forEach((player) => {
            player.connection.send(event);
        });

        this.spectators.forEach((spectator) => {
            spectator.send(event);
        });
    }
}
