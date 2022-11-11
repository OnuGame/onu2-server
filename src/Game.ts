import { Card, CardColor } from "../../OnuShared/src/Card";
import { GameStartEvent } from "../../OnuShared/src/events/GameStartEvent";
import { JoinedLobbyEvent } from "../../OnuShared/src/events/JoinedLobbyEvent";
import { OnuEvent } from "../../OnuShared/src/events/OnuEvent";
import { SettingsChangedEvent } from "../../OnuShared/src/events/SettingsChangedEvent";
import { UpdateDeckEvent } from "../../OnuShared/src/events/UpdateDeckEvent";
import { UpdatePlayerlistEvent } from "../../OnuShared/src/events/UpdatePlayerlistEvent";
import { getGameMode } from "../../OnuShared/src/GameMode";
import { OnuSettings } from "../../OnuShared/src/OnuSettings";
import { PlayerlistPlayer } from "../../OnuShared/src/PlayerlistPlayer";
import { CardGenerator } from "./CardGenerator";
import { ClientConnection } from "./ClientConnection";
import { Player } from "./Player";

export class Game {
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
    constructor(public lobbyCode: string) {}

    join(username: string, connection: ClientConnection) {
        const player = new Player(this, connection, username);

        this.players.push(player);
        connection.send(new JoinedLobbyEvent(player.uuid, player.hash));

        this.broadcastPlayerlist();
        player.connection.send(new SettingsChangedEvent(this.settings));
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
        this.broadcastPlayerlist();
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

    broadcastEvent(event: OnuEvent) {
        this.players.forEach((player) => {
            player.connection.send(event);
        });
    }
}
