import { getRoom, removeUserFromRoom } from "../data/space.js";
import { WebSocket } from "ws";
import { sendError } from "./error.js";
function handleLeave(ws) {
    if (ws.connectionState != "JOINED") {
        sendError(ws, "not joined in the room");
        return;
    }
    const roomId = ws.roomId;
    if (!roomId)
        return;
    const username = ws.username;
    const room = getRoom(ws, roomId);
    room?.peers.forEach((otherPeer) => {
        if (otherPeer.id !== ws.peerId &&
            otherPeer.ws.readyState === WebSocket.OPEN) {
            otherPeer.ws.send(JSON.stringify({
                type: "PARTICIPANT_LEFT",
                data: {
                    peerId: ws.peerId,
                    username: username,
                },
            }));
        }
    });
    const peerId = ws.peerId;
    ws.connectionState = "LEFT";
    ws.username = undefined;
    ws.roomId = undefined;
    ws.peerId = undefined;
    if (!peerId)
        return;
    removeUserFromRoom(ws, roomId, peerId);
}
function generatePeerId() {
    return Math.random().toString(36).substring(2, 10);
}
export { generatePeerId, handleLeave };
//# sourceMappingURL=helpers.js.map