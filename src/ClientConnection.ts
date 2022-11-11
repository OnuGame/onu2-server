import { WebSocket } from "ws";
import { OnuEvent } from "../../OnuShared/src/events/OnuEvent";
import { NetworkManager } from "../../OnuShared/src/NetworkManager";

export class ClientConnection implements NetworkManager {
    listeners: Map<string, Function[]> = new Map();
    connected: boolean = true;
    constructor(private socket: WebSocket) {
        socket.on("message", this.messageReceived.bind(this));
        socket.on("close", () => {
            this.connected = false;

            this.messageReceived(Buffer.from('{"name":"DisconnectedEvent"}'));
        });
    }

    registerEvent<Type extends OnuEvent>(eventName: string, callback: (event: Type) => void) {
        let events = this.listeners.get(eventName);
        if (!events) events = []; // set to empty array if not exist
        events.push(callback);
        this.listeners.set(eventName, events);
    }

    send(event: OnuEvent) {
        this.socket.send(JSON.stringify(event));
    }

    private messageReceived(message: Buffer) {
        const parsed: OnuEvent = JSON.parse(message.toString());
        let events = this.listeners.get(parsed.name);
        if (events) {
            events.forEach((event) => event(parsed));
        }
    }
}
