import { WebSocket } from "ws";
import mediasoup from "mediasoup";
interface Peer {
    id: string;
    ws: ExtendedWebSocket;
    sendTransport?: mediasoup.types.WebRtcTransport;
    recvTransport?: mediasoup.types.WebRtcTransport;
    producers: Map<string, mediasoup.types.Producer>;
    consumers: Map<string, mediasoup.types.Consumer>;
    mediaState: {
        audioEnabled: boolean;
        videoEnabled: boolean;
    };
}
interface ExtendedWebSocket extends WebSocket {
    peerId: string | undefined;
    username?: string | undefined;
    roomId?: string | undefined;
    connectionState?: "JOINED" | "CONNECTED" | "LEFT";
    isAlive?: boolean;
}
type BaseMessage = {
    type: string;
    [key: string]: any;
};
interface Room {
    router: mediasoup.types.Router;
    peers: Map<string, Peer>;
}
export type { Peer, Room, ExtendedWebSocket, BaseMessage };
//# sourceMappingURL=socket.d.ts.map