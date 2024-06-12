import { JoinLobbyEvent, PlayerLeftEvent, ReconnectEvent } from "@lebogo/onu2-shared";
import cors from "cors";
import express from "express";
import httpProxy from "express-http-proxy";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { Server } from "ws";
import { ClientConnection } from "./ClientConnection";
import { Config } from "./Config";
import { Game } from "./Game";
import { Logger } from "./Logger";

const { port, proxy, logs } = JSON.parse(readFileSync("./config.json", "utf-8")) as Config;

Logger.setLogDirectory(path.resolve(path.join(logs.directory, "server")));

const app = express();
app.use(cors());
app.use(express.text());

const games: Map<string, Game> = new Map();

const wsServer = new Server({ noServer: true });

// Serves static files. You need to create a client build first and put it into the public folder.
app.use(express.static("./public"));

wsServer.on("connection", (socket) => {
    const connection = new ClientConnection(socket);
    let game: Game | undefined;

    Logger.log("New connection");

    connection.registerEvent<JoinLobbyEvent>("JoinLobbyEvent", ({ username, lobbyCode }) => {
        if (!username.length) username = "Player" + Math.floor(Math.random() * 1000);
        username = username.trim().substring(0, 20);

        game = games.get(lobbyCode);
        if (!game) {
            Logger.log(`Creating game ${lobbyCode}`);
            game = new Game(lobbyCode);
            games.set(lobbyCode, game);

            game.registerEvent<PlayerLeftEvent>("PlayerLeftEvent", (event) => {
                if (game && game.players.length == 0) {
                    games.delete(lobbyCode);
                    Logger.log("Deleting game " + lobbyCode);
                }
            });
        }

        Logger.log(`Adding Player ${username} to ${lobbyCode}`);
        game.join(username, connection);
    });

    connection.registerEvent<ReconnectEvent>("ReconnectEvent", ({ lobbyCode, uuid }) => {
        if (!game) return;
        let player = game.players.find((player) => player.uuid == uuid);
        if (!player) return;
        Logger.log(`Reconnecting Player ${player.username} to ${lobbyCode}`);

        player.reconnect(connection);
    });
});

if (proxy && proxy.enabled && proxy.url) {
    app.use(httpProxy(proxy.url));
}

app.get("/ping", (req, res) => {
    res.status(200).send("ok");
});

app.post("/report", (req, res) => {
    if (!logs?.client?.allow) return res.status(409).send("feature disabled on server");

    const filename = `onu-log-${Date.now()}.log`;
    const logContent = req.body;

    const logDirectory = path.resolve(path.join(logs.directory, "client"));
    if (!existsSync(logDirectory)) mkdirSync(logDirectory, { recursive: true });

    writeFileSync(path.join(logDirectory, filename), logContent);

    res.send("saved");
});

const server = app.listen(port, () => {
    Logger.log(`Listening on port ${port}`);
});

server.on("upgrade", (request, socket, head) => {
    wsServer.handleUpgrade(request, socket, head, (socket) => {
        wsServer.emit("connection", socket, request);
    });
});
