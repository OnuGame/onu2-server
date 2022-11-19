import { JoinLobbyEvent, PlayerLeftEvent, ReconnectEvent } from "@lebogo/onu2-shared";
import express from "express";
import { Server } from "ws";
import { ClientConnection } from "./ClientConnection";
import { Game } from "./Game";

const app = express();

const games: Map<string, Game> = new Map();

const wsServer = new Server({ noServer: true });

wsServer.on("connection", (socket) => {
    const connection = new ClientConnection(socket);
    let game: Game | undefined;

    console.log("New connection");

    connection.registerEvent<JoinLobbyEvent>("JoinLobbyEvent", ({ username, lobbyCode }) => {
        game = games.get(lobbyCode);
        if (!game) {
            console.log(`Creating game ${lobbyCode}`);
            game = new Game(lobbyCode);
            games.set(lobbyCode, game);

            game.registerEvent<PlayerLeftEvent>("PlayerLeftEvent", (event) => {
                if (!game?.players.length) {
                    games.delete(lobbyCode);
                }
            });
        }

        console.log(`Adding Player ${username} to ${lobbyCode}`);
        game.join(username, connection);
    });

    connection.registerEvent<ReconnectEvent>("ReconnectEvent", ({ lobbyCode, uuid }) => {
        if (!game) return;
        let player = game.players.find((player) => player.uuid == uuid);
        if (!player) return;
        console.log(`Reconnecting Player ${player.username} to ${lobbyCode}`);

        player.reconnect(connection);
    });
});

const server = app.listen(3000);
server.on("upgrade", (request, socket, head) => {
    wsServer.handleUpgrade(request, socket, head, (socket) => {
        wsServer.emit("connection", socket, request);
    });
});
