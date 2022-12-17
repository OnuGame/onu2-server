import {
    Card,
    CardPlacedEvent,
    CardRequestEvent,
    DisconnectedEvent,
    GameStartEvent,
    SettingsChangedEvent,
} from "@lebogo/onu2-shared";
import { randomUUID } from "crypto";
import { ClientConnection } from "./ClientConnection";

import { Game } from "./Game";

export class Player {
    uuid: string = randomUUID();
    deck: Card[] = [];
    disconnectedTimeout: NodeJS.Timeout | undefined;
    spectating: boolean = true;

    constructor(public game: Game, public connection: ClientConnection, public username: string) {
        this.registerEvents();
    }

    reconnect(connection: ClientConnection) {
        this.connection = connection;
        this.game.broadcastPlayerlist();

        if (this.disconnectedTimeout) {
            clearTimeout(this.disconnectedTimeout);
        }
    }

    registerEvents() {
        this.connection.registerEvent<DisconnectedEvent>("DisconnectedEvent", () => {
            console.log(`Player ${this.username} disconnected`);

            this.game.leave(this);
        });

        this.connection.registerEvent<CardRequestEvent>("CardRequestEvent", (event) => {
            this.game.drawCards(this);
        });

        this.connection.registerEvent<CardPlacedEvent>("CardPlacedEvent", (event) => {
            this.game.placeCard(event.card, this);
        });

        this.connection.registerEvent<SettingsChangedEvent>("SettingsChangedEvent", (event) => {
            if (this.game.started) return;
            if (!this.game.isAdmin(this)) return;

            this.game.settings = event.settings;
            this.game.gameMode =
                this.game.gameModes.find((gameMode) => {
                    return gameMode.name == event.settings.gameMode.value;
                }) || this.game.gameModes[0];

            this.game.broadcastEvent(event);
        });

        this.connection.registerEvent<GameStartEvent>("GameStartEvent", (event) => {
            if (this.game.started) return;
            if (!this.game.isAdmin(this)) return;

            this.game.start();
        });
    }
}
