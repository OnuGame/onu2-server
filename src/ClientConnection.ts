import { BaseEvent, EventSystem } from "@lebogo/eventsystem";
import { WebSocket } from "ws";

export class ClientConnection extends EventSystem {
    listeners: Map<string, Function[]> = new Map();
    connected: boolean = true;
    constructor(private socket: WebSocket) {
        super();

        socket.on("message", this.messageReceived.bind(this));
        socket.on("close", () => {
            this.connected = false;
            this.parse('{"name":"DisconnectedEvent"}');
        });
    }

    send(event: BaseEvent) {
        this.socket.send(event.stringify());
    }

    private messageReceived(message: Buffer) {
        this.parse(message.toString());
    }
}
