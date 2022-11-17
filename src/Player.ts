import {
    Card,
    CardPlacedEvent,
    CardRequestEvent,
    DisconnectedEvent,
    GameStartEvent,
    SettingsChangedEvent,
} from "@lebogo/onu2-shared";
import { createHash, randomUUID } from "crypto";
import { ClientConnection } from "./ClientConnection";

import { Game } from "./Game";

export class Player {
    uuid: string = randomUUID();
    hash: string;
    deck: Card[] = [];
    disconnectedTimeout: NodeJS.Timeout | undefined;

    constructor(public game: Game, public connection: ClientConnection, public username: string) {
        this.hash = createHash("md5").update(this.uuid).digest("hex");
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

            this.game.broadcastPlayerlist();

            this.game.leave(this);
        });

        this.connection.registerEvent<CardRequestEvent>("CardRequestEvent", (event) => {
            this.game.drawCards(this);
        });

        this.connection.registerEvent<CardPlacedEvent>("CardPlacedEvent", (event) => {
            this.game.placeCard(event.card, this);
        });

        this.connection.registerEvent<SettingsChangedEvent>("SettingsChangedEvent", (event) => {
            if (!this.game.isAdmin(this)) return;

            this.game.settings = event.settings;

            this.game.broadcastEvent(event);
        });

        this.connection.registerEvent<GameStartEvent>("GameStartEvent", (event) => {
            if (!this.game.isAdmin(this)) return;

            this.game.start();
        });
    }
}
