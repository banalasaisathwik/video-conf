import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type {
  DtlsParameters,
  IceCandidate,
  IceParameters,
  RtpCapabilities,
} from "mediasoup-client/types";
import type { Device, Consumer } from "mediasoup-client/types";
import { createDevice } from "../services/device";
import {
  leaveRoom,
  sendRequest,
  subscribe,
  unsubscribe,
} from "../services/socket";
import { RemoteVideo } from "../component/RemoteVideo";

interface CreateTransportResponse {
  id: string;
  iceParameters: IceParameters;
  iceCandidates: IceCandidate[];
  dtlsParameters: DtlsParameters;
}

interface ConsumeResponse {
  id: string;
  producerId: string;
  kind: "audio" | "video";
  rtpParameters: any;
}

interface RemoteStreamItem {
  id: string;
  stream: MediaStream;
}


const RoomPage = () => {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const name = location.state?.name;

  const [participants, setParticipants] = useState<string[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStreamItem[]>([]);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const handlerRef = useRef<((message: any) => void) | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const consumersRef = useRef<Consumer[]>([]);
  const peersRef = useRef<
  Map<string, { stream: MediaStream; producers: Set<string> }>
>(new Map());

  useEffect(() => {
    if (!roomId || !name) {
      return;
    }

async function consumeProducer(producerId: string, peerId: string) {
  if (!deviceRef.current || !recvTransportRef.current) return;

  try {
    const data = await sendRequest("consume", {
      producerId,
      rtpCapabilities: deviceRef.current.rtpCapabilities,
    }) as ConsumeResponse;

    const consumer = await recvTransportRef.current.consume({
      id: data.id,
      producerId: data.producerId,
      kind: data.kind,
      rtpParameters: data.rtpParameters,
    }) ;

    consumersRef.current.push(consumer);

    if (!peersRef.current.has(peerId)) {
      peersRef.current.set(peerId, {
        stream: new MediaStream(),
        producers: new Set(),
      });
    }

    const peer = peersRef.current.get(peerId)!;

    if (peer.producers.has(producerId)) return;

    peer.producers.add(producerId);

    peer.stream.addTrack(consumer.track);

    setRemoteStreams((prev) => {
      const exists = prev.some((p) => p.id === peerId);
      if (exists) return prev;

      return [...prev, { id: peerId, stream: peer.stream }];
    });

  } catch (err) {
    console.error("consume failed", err);
  }
}
    async function setupRoom() {
      const joinData = (await sendRequest("JOIN_ROOM", {
        roomId,
        username: name,
      })) as { participants: string[] };

      setParticipants(joinData.participants || []);

      const routerRtpCapabilities = (await sendRequest(
        "getRouterRtpCapabilities",
      )) as RtpCapabilities;

      const device = await createDevice(routerRtpCapabilities);
      deviceRef.current = device;

      const sendTransportData = (await sendRequest("createTransport", {
        direction: "send",
      })) as CreateTransportResponse;

      const sendTransport = device.createSendTransport(sendTransportData);
      sendTransportRef.current = sendTransport;

      sendTransport.on("connect", async ({ dtlsParameters }, callback, errback) => {
        try {
          await sendRequest("connectTransport", {
            transportId: sendTransport.id,
            dtlsParameters,
          });
          callback();
        } catch (error) {
          errback(error as Error);
        }
      });

      sendTransport.on("produce", async ({ kind, rtpParameters }, callback, errback) => {
        try {
          const response = (await sendRequest("produce", {
            transportId: sendTransport.id,
            kind,
            rtpParameters,
          })) as { id: string };

          callback({ id: response.id });
        } catch (error) {
          errback(error as Error);
        }
      });

      const localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      localStreamRef.current = localStream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }

      const videoTrack = localStream.getVideoTracks()[0];
      const audioTrack = localStream.getAudioTracks()[0];

      if (videoTrack) {
        await sendTransport.produce({ track: videoTrack });
      }

      if (audioTrack) {
        await sendTransport.produce({ track: audioTrack });
      }

      const recvTransportData = (await sendRequest("createTransport", {
        direction: "recv",
      })) as CreateTransportResponse;

      const recvTransport = device.createRecvTransport(recvTransportData);
      recvTransportRef.current = recvTransport;

      recvTransport.on("connect", async ({ dtlsParameters }, callback, errback) => {
        try {
          await sendRequest("connectTransport", {
            transportId: recvTransport.id,
            dtlsParameters,
          });
          callback();
        } catch (error) {
          errback(error as Error);
        }
      });

      const producerData = (await sendRequest("getProducers")) as {
        producers: {producerId : string ,peerId : string}[];
      };

      for (const { producerId, peerId } of producerData.producers) {
  await consumeProducer(producerId, peerId);
}
    }

    const handler = async (message: any) => {
      if (message.type === "NEW_PARTICIPANT") {
        const username = message.data?.username;
        if (!username) {
          return;
        }

        setParticipants((prev) => {
          if (prev.includes(username)) {
            return prev;
          }

          return [...prev, username];
        });
      }

      if (message.type === "PARTICIPANT_LEFT") {
  const { username, peerId } = message.data;

  if (!username || !peerId) return;

  const peer = peersRef.current.get(peerId);

  if (peer) {
    peer.stream.getTracks().forEach((track) => track.stop());

    consumersRef.current = consumersRef.current.filter((consumer) => {
      if (peer.producers.has(consumer.producerId)) {
        consumer.close();
        return false;
      }
      return true;
    });

    peersRef.current.delete(peerId);
  }

  setRemoteStreams((prev) =>
    prev.filter((item) => item.id !== peerId)
  );

  setParticipants((prev) =>
    prev.filter((item) => item !== username)
  );
}

      if (message.type === "NEW_PRODUCER") {
        const {producerId ,peerId} = message.data;
        if (!producerId || !peerId) {
          return;
        }

        await consumeProducer(producerId,peerId);
      }
    };

    handlerRef.current = handler;
    subscribe(handler);

    setupRoom().catch((error) => {
      console.error("room setup failed", error);
    });

    return () => {
      if (handlerRef.current) {
        unsubscribe(handlerRef.current);
        handlerRef.current = null;
      }

      consumersRef.current.forEach((consumer) => consumer.close());
      consumersRef.current = [];

      if (sendTransportRef.current) {
        sendTransportRef.current.close();
        sendTransportRef.current = null;
      }

      if (recvTransportRef.current) {
        recvTransportRef.current.close();
        recvTransportRef.current = null;
      }

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }

      peersRef.current.clear();
      setRemoteStreams([]);
    };
  }, [roomId, name]);

  async function handleLeave() {
    if (!roomId) {
      return;
    }

    await leaveRoom(roomId);
    navigate("/");
  }

  if (!roomId || !name) {
    return null;
  }

  return (
    <div style={{ padding: "24px" }}>
      <h1>
        {name} in room {roomId}
      </h1>

      <p>Participants: {participants.join(", ") || "No other participants"}</p>

      <div
        style={{
          display: "grid",
          gap: "16px",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          marginTop: "24px",
        }}
      >
        <div>
          <h3>Local Video</h3>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            style={{ width: "100%", background: "#000" }}
          />
        </div>

        {remoteStreams.map((item) => (
          <div key={item.id}>
            <h3>Remote Video</h3>
            <RemoteVideo stream={item.stream} />
          </div>
        ))}
      </div>

      <button onClick={handleLeave} style={{ marginTop: "24px" }}>
        Leave
      </button>
    </div>
  );
};

export { RoomPage };
