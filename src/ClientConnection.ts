import { BaseEvent, EventSystem } from "@lebogo/eventsystem";
import { PingEvent } from "@lebogo/onu2-shared";
import { WebSocket } from "ws";

export class ClientConnection extends EventSystem {
    listeners: Map<string, Function[]> = new Map();
    connected: boolean = true;
    lastPing: number = -1;
    pingInterval: NodeJS.Timer;

    constructor(private socket: WebSocket) {
        super();

        socket.on("message", this.messageReceived.bind(this));
        socket.on("close", () => {
            console.log("Connection closed");

            this.connected = false;
            this.close();
        });

        this.pingInterval = setInterval(() => {
            if (this.lastPing != -1) {
                // ping timed out -> disconnect
                clearInterval(this.pingInterval);
                this.connected = false;
                socket.close();
                this.parse('{"n":"Disconnected"}');
            }
            this.lastPing = Math.floor(Math.random() * 100) + 1;
            this.send(new PingEvent(this.lastPing));
        }, 10000);

        this.registerEvent("Ping", (event: PingEvent) => {
            // ping received. reset last ping.
            if (event.ping == this.lastPing) this.lastPing = -1;
            else this.close();
        });
    }

    close() {
        this.parse('{"n":"Disconnected"}');
        this.socket.close();
    }

    send(event: BaseEvent) {
        // replace name field with n to save some bytes
        let json: { [key: string]: any } = { n: event.name, ...event };
        delete json.name;

        this.socket.send(JSON.stringify(json));
    }

    private messageReceived(message: Buffer) {
        this.parse(message.toString());
    }
}
