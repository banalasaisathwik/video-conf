import WebSocket from "ws";
import { addToRoom, getRoom } from "../data/space.js";
import { sendError } from "../utils/error.js";
import { handleLeave } from "../utils/helpers.js";
export const handleMessage = async (message, ws) => {
    const { type, msgId, data } = message;
    switch (type) {
        case "JOIN_ROOM": {
            console.log("JOIN_ROOM received", message);
            const { roomId, username } = data || {};
            if (typeof username !== "string" || username.length === 0) {
                sendError(ws, "pls give username", msgId);
                return;
            }
            if (typeof roomId !== "string" || roomId.length === 0) {
                sendError(ws, "roomId missing", msgId);
                return;
            }
            await addToRoom(ws, roomId);
            const room = getRoom(ws, roomId);
            ws.username = username;
            ws.connectionState = "JOINED";
            ws.roomId = roomId;
            const participants = [];
            room?.peers.forEach((otherPeer) => {
                console.log("Broadcasting NEW_PARTICIPANT to:", otherPeer.ws.username);
                if (otherPeer.id !== ws.peerId &&
                    otherPeer.ws.readyState === WebSocket.OPEN) {
                    otherPeer.ws.send(JSON.stringify({
                        type: "NEW_PARTICIPANT",
                        data: {
                            username: ws.username,
                        },
                    }));
                    if (otherPeer.ws.username) {
                        participants.push(otherPeer.ws.username);
                    }
                }
            });
            ws.send(JSON.stringify({
                type: "YOU_JOINED",
                msgId,
                data: {
                    roomId,
                    participants,
                },
            }));
            break;
        }
        case "getRouterRtpCapabilities": {
            console.log("getRouterRtpCapabilities called");
            const roomId = ws.roomId;
            if (!roomId) {
                console.log("No roomId on ws");
                return;
            }
            const room = getRoom(ws, roomId);
            const router = room?.router;
            ws.send(JSON.stringify({
                type: "routerRtpCapabilities",
                msgId,
                data: router?.rtpCapabilities,
            }));
            break;
        }
        case "createTransport": {
            const { direction } = data || {};
            const roomId = ws.roomId;
            if (!roomId)
                return;
            const room = getRoom(ws, roomId);
            const router = room?.router;
            const transport = await router?.createWebRtcTransport({
                listenIps: [{ ip: "127.0.0.1", announcedIp: "127.0.0.1" }],
                enableUdp: true,
                enableTcp: true,
                preferUdp: true,
            });
            if (!ws.peerId)
                return;
            const peer = room?.peers.get(ws.peerId);
            if (!peer || !transport)
                return;
            if (direction === "send") {
                peer.sendTransport = transport;
            }
            else {
                peer.recvTransport = transport;
            }
            ws.send(JSON.stringify({
                type: "transportCreated",
                msgId,
                data: {
                    id: transport.id,
                    iceParameters: transport.iceParameters,
                    iceCandidates: transport.iceCandidates,
                    dtlsParameters: transport.dtlsParameters,
                },
            }));
            break;
        }
        case "connectTransport": {
            const { transportId, dtlsParameters } = data;
            const roomId = ws.roomId;
            if (!roomId)
                return;
            const room = getRoom(ws, roomId);
            if (!ws.peerId)
                return;
            const peer = room?.peers.get(ws.peerId);
            if (!peer)
                return;
            const transport = peer.sendTransport?.id === transportId
                ? peer.sendTransport
                : peer.recvTransport;
            await transport?.connect({
                dtlsParameters,
            });
            ws.send(JSON.stringify({
                type: "connected",
                msgId,
            }));
            break;
        }
        case "produce": {
            const { transportId, kind, rtpParameters } = data;
            const roomId = ws.roomId;
            if (!roomId)
                return;
            const room = getRoom(ws, roomId);
            if (!ws.peerId)
                return;
            const peer = room?.peers.get(ws.peerId);
            if (!peer)
                return;
            const transport = peer.sendTransport?.id === transportId
                ? peer.sendTransport
                : peer.recvTransport;
            const producer = await transport?.produce({
                kind,
                rtpParameters,
            });
            if (!producer || !producer.id)
                return;
            peer.producers.set(producer.id, producer);
            ws.send(JSON.stringify({
                type: "producerCreated",
                msgId,
                data: {
                    id: producer.id,
                    kind: producer.kind,
                },
            }));
            room?.peers.forEach((otherPeer) => {
                if (otherPeer.id !== ws.peerId &&
                    otherPeer.ws.readyState === WebSocket.OPEN) {
                    otherPeer.ws.send(JSON.stringify({
                        type: "NEW_PRODUCER",
                        data: {
                            peerId: peer.id,
                            producerId: producer.id,
                            kind: producer.kind,
                        },
                    }));
                }
            });
            break;
        }
        case "getProducers": {
            const roomId = ws.roomId;
            if (!roomId)
                return;
            const room = getRoom(ws, roomId);
            if (!ws.peerId)
                return;
            const producerIds = [];
            const peerMediaStates = {};
            room?.peers.forEach((otherPeer) => {
                if (otherPeer.id === ws.peerId) {
                    return;
                }
                peerMediaStates[otherPeer.id] = {
                    audioEnabled: otherPeer.mediaState.audioEnabled,
                    videoEnabled: otherPeer.mediaState.videoEnabled,
                };
                otherPeer.producers.forEach((producer) => {
                    producerIds.push({
                        producerId: producer.id,
                        peerId: otherPeer.id,
                    });
                });
            });
            ws.send(JSON.stringify({
                type: "allProducers",
                msgId,
                data: {
                    producers: producerIds,
                    peerMediaStates,
                },
            }));
            break;
        }
        case "consume": {
            const { producerId, rtpCapabilities } = data;
            const roomId = ws.roomId;
            if (!roomId)
                return;
            const room = getRoom(ws, roomId);
            const router = room?.router;
            if (!ws.peerId)
                return;
            const peer = room?.peers.get(ws.peerId);
            if (!peer)
                return;
            if (!router?.canConsume({ producerId, rtpCapabilities })) {
                sendError(ws, "cannot consume this producer", msgId);
                return;
            }
            const recvTransport = peer.recvTransport;
            const consumer = await recvTransport?.consume({
                producerId,
                rtpCapabilities,
                paused: false,
            });
            if (!consumer) {
                sendError(ws, "consumer was not created", msgId);
                return;
            }
            peer.consumers.set(consumer.id, consumer);
            ws.send(JSON.stringify({
                type: "consumerCreated",
                msgId,
                data: {
                    id: consumer.id,
                    producerId,
                    kind: consumer.kind,
                    rtpParameters: consumer.rtpParameters,
                },
            }));
            break;
        }
        case "updateMediaState": {
            const { kind, enabled } = data || {};
            if ((kind !== "audio" && kind !== "video") || typeof enabled !== "boolean") {
                sendError(ws, "invalid media state payload", msgId);
                return;
            }
            const roomId = ws.roomId;
            if (!roomId || !ws.peerId) {
                return;
            }
            const room = getRoom(ws, roomId);
            if (!room)
                return;
            const peer = room.peers.get(ws.peerId);
            if (!peer)
                return;
            if (kind === "audio") {
                peer.mediaState.audioEnabled = enabled;
            }
            else {
                peer.mediaState.videoEnabled = enabled;
            }
            room.peers.forEach((otherPeer) => {
                if (otherPeer.id !== ws.peerId &&
                    otherPeer.ws.readyState === WebSocket.OPEN) {
                    otherPeer.ws.send(JSON.stringify({
                        type: "MEDIA_STATE_UPDATED",
                        data: {
                            peerId: peer.id,
                            kind,
                            enabled,
                        },
                    }));
                }
            });
            ws.send(JSON.stringify({
                type: "mediaStateUpdated",
                msgId,
                data: {
                    peerId: peer.id,
                    kind,
                    enabled,
                },
            }));
            break;
        }
        case "LEAVE_ROOM": {
            const { roomId } = data || {};
            if (typeof roomId !== "string" || roomId.length === 0) {
                sendError(ws, "roomId missing", msgId);
                return;
            }
            handleLeave(ws);
            ws.send(JSON.stringify({
                type: "LEFT_ROOM",
                msgId,
                data: {
                    roomId,
                },
            }));
            break;
        }
    }
};
//# sourceMappingURL=messageHandler.js.map