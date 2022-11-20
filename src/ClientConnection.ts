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
            this.parse('{"name":"DisconnectedEvent"}');
            clearInterval(this.pingInterval);
        });

        this.pingInterval = setInterval(() => {
            if (this.lastPing != -1) {
                // ping timed out -> disconnect
                clearInterval(this.pingInterval);
                this.connected = false;
                socket.close();
                this.parse('{"name":"DisconnectedEvent"}');
            }
            this.lastPing = Date.now();
            this.send(new PingEvent(this.lastPing));
        }, 10000);

        this.registerEvent("PingEvent", (event: PingEvent) => {
            // ping received. reset last ping.
            this.lastPing = -1;
        });
    }

    send(event: BaseEvent) {
        this.socket.send(event.stringify());
    }

    private messageReceived(message: Buffer) {
        this.parse(message.toString());
    }
}
