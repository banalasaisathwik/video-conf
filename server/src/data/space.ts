import type { Peer, ExtendedWebSocket, Room } from "../types/socket.js";
import { generatePeerId } from "../utils/helpers.js";
import { worker } from "../utils/mediaSoup.js";

const rooms: Map<string, Room> = new Map();

function cleanupPeer(peer: Peer) {
  peer.producers.forEach((producer) => producer.close());
  peer.consumers.forEach((consumer) => consumer.close());
  peer.sendTransport?.close();
  peer.recvTransport?.close();
}

function removeExistingSocketEntries(ws: ExtendedWebSocket) {
  rooms.forEach((room) => {
    room.peers.forEach((peer, peerId) => {
      if (peer.ws !== ws) {
        return;
      }

      cleanupPeer(peer);
      room.peers.delete(peerId);
    });
  });
}

async function addToRoom(ws: ExtendedWebSocket, roomId: string) {
  removeExistingSocketEntries(ws);

  if (!rooms.has(roomId)) {
    const router = await worker.createRouter({
      mediaCodecs: [
        {
          kind: "audio",
          mimeType: "audio/opus",
          clockRate: 48000,
          channels: 2,
        },
        {
          kind: "video",
          mimeType: "video/VP8",
          clockRate: 90000,
        },
      ],
    });

    const newRoom = {
      router: router,
      peers: new Map(),
    };
    rooms.set(roomId, newRoom);
  }

  const room = rooms.get(roomId)!;
  const peerId = generatePeerId();

  const newPeer: Peer = {
    id: peerId,
    ws: ws,
    producers: new Map(),
    consumers: new Map(),
    mediaState: {
      audioEnabled: true,
      videoEnabled: true,
    },
  };

  room.peers.set(peerId, newPeer);

  ws.roomId = roomId;
  ws.peerId = peerId;
}

function removeUserFromRoom(
  ws: ExtendedWebSocket,
  roomId: string,
  peerId: string,
) {
  const hasRoom = rooms.has(roomId);
  if (!hasRoom) {
    return;
  }

  if (!peerId) return;

  const room = rooms.get(roomId);
  room?.peers.delete(peerId);
}

function getRoom(ws: ExtendedWebSocket, roomId: string) {
  const hasRoom = rooms.has(roomId);
  if (!hasRoom) {
    return;
  }
  const room = rooms.get(roomId);
  return room;
}
export { addToRoom, removeUserFromRoom, getRoom };
