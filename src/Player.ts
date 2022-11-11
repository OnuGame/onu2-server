import { createHash, randomUUID } from "crypto";
import { Card } from "../../OnuShared/src/Card";
import { getGameMode } from "../../OnuShared/src/GameMode";
import { CardGenerator } from "./CardGenerator";
import { ClientConnection } from "./ClientConnection";

import { CardPlacedEvent } from "../../OnuShared/src/events/CardPlacedEvent";
import { CardRequestEvent } from "../../OnuShared/src/events/CardRequestEvent";
import { DisconnectedEvent } from "../../OnuShared/src/events/DisconnectedEvent";
import { SettingsChangedEvent } from "../../OnuShared/src/events/SettingsChangedEvent";
import { UpdateDeckEvent } from "../../OnuShared/src/events/UpdateDeckEvent";
import { GameStartEvent } from "../../OnuShared/src/events/GameStartEvent";

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
            // this.game.leave(this);
            console.log("Updated playerlist");

            this.game.broadcastPlayerlist();

            console.log("Set 10 second timeout.");

            this.disconnectedTimeout = setTimeout(() => {
                this.game.leave(this);
            }, 10000);
        });

        this.connection.registerEvent<CardRequestEvent>("CardRequestEvent", (event) => {
            let amount = 1;
            if (this.game.drawAmount != 0) amount = this.game.drawAmount;

            const cardGenerator = new CardGenerator(
                getGameMode(this.game.settings.gameMode.value || "classic")
            );
            const cards = cardGenerator.generate(amount);
            amount = 0;
            this.deck.push(...cards);
            this.connection.send(new UpdateDeckEvent(this.deck));
        });

        this.connection.registerEvent<CardPlacedEvent>("CardPlacedEvent", (event) => {
            const playerId = this.game!.players.indexOf(this);
            if (playerId != this.game!.activePlayer) return;

            const deckCard = this.deck.find((deckCard) => deckCard.id == event.card.id);

            if (!deckCard) return;

            const validTurn = this.game!.topCard.compare(event.card);
            if (!validTurn) return;
            this.game!.topCard = deckCard;
            this.deck = this.deck.filter((card) => card.id != deckCard.id);
            this.game!.broadcastEvent(new CardPlacedEvent(event.card, this.hash));

            this.game.nextPlayer(1);
        });

        this.connection.registerEvent<SettingsChangedEvent>("SettingsChangedEvent", (event) => {
            if (!this.game.isAdmin(this)) return;

            this.game.settings = event.settings;
            console.log(this.game.settings);

            this.game.broadcastEvent(event);
        });

        this.connection.registerEvent<GameStartEvent>("GameStartEvent", (event) => {
            if (!this.game.isAdmin(this)) return;

            this.game.start();
        });
    }
}
