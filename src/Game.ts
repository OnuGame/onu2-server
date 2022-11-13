import { BaseEvent, EventSystem } from "@lebogo/eventsystem";
import {
    Card,
    CardColor,
    GameStartEvent,
    getGameMode,
    JoinedLobbyEvent,
    OnuSettings,
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
        const cardGenerator = new CardGenerator(
            getGameMode(this.settings.gameMode.value || "classic")
        );

        for (let player of this.players) {
            const cards = cardGenerator.generate(parseInt(this.settings.cardAmount.value || "7"));
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

    broadcastEvent(event: BaseEvent) {
        this.players.forEach((player) => {
            player.connection.send(event);
        });
    }
}
