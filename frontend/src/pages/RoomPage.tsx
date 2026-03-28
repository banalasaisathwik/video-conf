import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type {
  DtlsParameters,
  IceCandidate,
  IceParameters,
  Producer,
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
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
}

const RoomPage = () => {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const name = location.state?.name;

  const [participants, setParticipants] = useState<string[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStreamItem[]>([]);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

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
  const videoProducerRef = useRef<Producer | null>(null);
  const audioProducerRef = useRef<Producer | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const isVideoEnabledRef = useRef(true);

  useEffect(() => {
    isVideoEnabledRef.current = isVideoEnabled;
  }, [isVideoEnabled]);

  useEffect(() => {
    if (!roomId || !name) {
      return;
    }

    function updateRemotePeerMediaState(
      peerId: string,
      kind: "audio" | "video",
      enabled: boolean,
    ) {
      setRemoteStreams((prev) =>
        prev.map((item) =>
          item.id === peerId
            ? {
                ...item,
                isAudioEnabled:
                  kind === "audio" ? enabled : item.isAudioEnabled,
                isVideoEnabled:
                  kind === "video" ? enabled : item.isVideoEnabled,
              }
            : item,
        ),
      );
    }

    async function consumeProducer(producerId: string, peerId: string) {
      if (!deviceRef.current || !recvTransportRef.current) return;

      try {
        const data = (await sendRequest("consume", {
          producerId,
          rtpCapabilities: deviceRef.current.rtpCapabilities,
        })) as ConsumeResponse;

        const consumer = await recvTransportRef.current.consume({
          id: data.id,
          producerId: data.producerId,
          kind: data.kind,
          rtpParameters: data.rtpParameters,
        });

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
          const existingItem = prev.find((item) => item.id === peerId);

          if (existingItem) {
            return prev.map((item) =>
              item.id === peerId ? { ...item, stream: peer.stream } : item,
            );
          }

          return [
            ...prev,
            {
              id: peerId,
              stream: peer.stream,
              isAudioEnabled: true,
              isVideoEnabled: true,
            },
          ];
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

      sendTransport.on(
        "connect",
        async ({ dtlsParameters }, callback, errback) => {
          try {
            await sendRequest("connectTransport", {
              transportId: sendTransport.id,
              dtlsParameters,
            });
            callback();
          } catch (error) {
            errback(error as Error);
          }
        },
      );

      sendTransport.on(
        "produce",
        async ({ kind, rtpParameters }, callback, errback) => {
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
        },
      );

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
        cameraTrackRef.current = videoTrack;
        videoProducerRef.current = await sendTransport.produce({
          track: videoTrack,
        });
      }

      if (audioTrack) {
        audioProducerRef.current = await sendTransport.produce({
          track: audioTrack,
        });
      }

      const recvTransportData = (await sendRequest("createTransport", {
        direction: "recv",
      })) as CreateTransportResponse;

      const recvTransport = device.createRecvTransport(recvTransportData);
      recvTransportRef.current = recvTransport;

      recvTransport.on(
        "connect",
        async ({ dtlsParameters }, callback, errback) => {
          try {
            await sendRequest("connectTransport", {
              transportId: recvTransport.id,
              dtlsParameters,
            });
            callback();
          } catch (error) {
            errback(error as Error);
          }
        },
      );

      const producerData = (await sendRequest("getProducers")) as {
        producers: { producerId: string; peerId: string }[];
        peerMediaStates: Record<
          string,
          { audioEnabled: boolean; videoEnabled: boolean }
        >;
      };

      for (const { producerId, peerId } of producerData.producers) {
        await consumeProducer(producerId, peerId);
      }

      setRemoteStreams((prev) =>
        prev.map((item) => {
          const mediaState = producerData.peerMediaStates?.[item.id];
          if (!mediaState) {
            return item;
          }

          return {
            ...item,
            isAudioEnabled: mediaState.audioEnabled,
            isVideoEnabled: mediaState.videoEnabled,
          };
        }),
      );
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

        setRemoteStreams((prev) => prev.filter((item) => item.id !== peerId));
        setParticipants((prev) => prev.filter((item) => item !== username));
      }

      if (message.type === "NEW_PRODUCER") {
        const { producerId, peerId } = message.data;
        if (!producerId || !peerId) {
          return;
        }

        await consumeProducer(producerId, peerId);
      }

      if (message.type === "MEDIA_STATE_UPDATED") {
        const { peerId, kind, enabled } = message.data;
        if (!peerId || (kind !== "audio" && kind !== "video")) {
          return;
        }

        updateRemotePeerMediaState(peerId, kind, enabled);
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

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
      }

      peersRef.current.clear();
      setRemoteStreams([]);
    };
  }, [roomId, name]);

  async function handleToggleVideo() {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (!videoTrack || !videoProducerRef.current) {
      return;
    }

    const nextEnabled = !isVideoEnabled;
    videoTrack.enabled = nextEnabled;
    setIsVideoEnabled(nextEnabled);

    await sendRequest("updateMediaState", {
      kind: "video",
      enabled: nextEnabled,
    });
  }

  async function handleToggleAudio() {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (!audioTrack || !audioProducerRef.current) {
      return;
    }

    const nextEnabled = !isAudioEnabled;
    audioTrack.enabled = nextEnabled;
    setIsAudioEnabled(nextEnabled);

    await sendRequest("updateMediaState", {
      kind: "audio",
      enabled: nextEnabled,
    });
  }

  async function restartCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const cameraTrack = stream.getVideoTracks()[0];
    cameraTrackRef.current = cameraTrack;
    if (!cameraTrack) return;
    cameraTrack.enabled = isVideoEnabledRef.current;
    await videoProducerRef.current?.replaceTrack({
      track: cameraTrack,
    });

    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        localStreamRef.current?.removeTrack(track);
      });
      localStreamRef.current.addTrack(cameraTrack);
    }

    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    setIsScreenSharing(false);
    return;
  }

  async function handleScreenShare() {
    if (!videoProducerRef.current) return;

    if (isScreenSharing) {
      restartCamera();
    } else {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      screenStreamRef.current = screenStream;
      const screenTrack = screenStreamRef.current.getVideoTracks()[0];
      if (!screenTrack) return;
      screenTrack.onended = () => {
        restartCamera();
      };
      await videoProducerRef.current.replaceTrack({ track: screenTrack });
      setIsScreenSharing(true);
    }
  }

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
    <div
      style={{
        background: "#f3f4f6",
        minHeight: "100vh",
        padding: "24px",
      }}
    >
      <div
        style={{
          margin: "0 auto",
          maxWidth: "1200px",
        }}
      >
        <div style={{ marginBottom: "20px" }}>
          <h1 style={{ color: "#111827", margin: 0 }}>
            {name} in room {roomId}
          </h1>
          <p style={{ color: "#6b7280", margin: "8px 0 0" }}>
            Participants: {participants.join(", ") || "No other participants"}
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gap: "16px",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "16px",
              padding: "12px",
            }}
          >
            <h3 style={{ color: "#111827", margin: "0 0 12px" }}>
              {name} (You)
            </h3>
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              style={{
                background: "#111827",
                borderRadius: "12px",
                height: "220px",
                objectFit: "cover",
                width: "100%",
              }}
            />
            <p style={{ color: "#4b5563", margin: "8px 0 0" }}>
              {isAudioEnabled ? "Audio on" : "Audio stopped"}
            </p>
          </div>

          {remoteStreams.map((item, index) => (
            <div
              key={item.id}
              style={{
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: "16px",
                padding: "12px",
              }}
            >
              <h3 style={{ color: "#111827", margin: "0 0 12px" }}>
                Participant {index + 1}
              </h3>
              <RemoteVideo
                stream={item.stream}
                isAudioEnabled={item.isAudioEnabled}
                isVideoEnabled={item.isVideoEnabled}
              />
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            marginTop: "20px",
          }}
        >
          <button onClick={handleToggleVideo}>
            {isVideoEnabled ? "Stop My Video" : "Start My Video"}
          </button>
          <button onClick={handleToggleAudio}>
            {isAudioEnabled ? "Stop My Audio" : "Start My Audio"}
          </button>
          <button onClick={handleScreenShare}>
            {isScreenSharing ? "Stop Screen Share" : "Screen Share"}
          </button>
          <button onClick={handleLeave}>Leave</button>
        </div>
      </div>
    </div>
  );
};

export { RoomPage };
