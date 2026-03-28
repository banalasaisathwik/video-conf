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
import { Chat } from "../component/Chat";

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

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  isOwnMessage: boolean;
}

const RoomPage = () => {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const name = location.state?.name;

  const [, setParticipants] = useState<string[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStreamItem[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
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

      if (message.type === "CHAT_MESSAGE") {
        const { messageId, sender, text, peerId } = message.data ?? {};
        if (
          typeof messageId !== "string" ||
          typeof sender !== "string" ||
          typeof text !== "string"
        ) {
          return;
        }

        setChatMessages((prev) => [
          ...prev,
          {
            id: messageId,
            sender,
            text,
            isOwnMessage: peerId === undefined || peerId === null,
          },
        ]);
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
      setChatMessages([]);
    };
  }, [roomId, name]);

  async function handleSendChatMessage(text: string) {
    if (!text.trim()) {
      return;
    }

    const response = (await sendRequest("SEND_CHAT_MESSAGE", {
      text,
    })) as {
      messageId: string;
      sender: string;
      text: string;
    };

    setChatMessages((prev) => [
      ...prev,
      {
        id: response.messageId,
        sender: response.sender,
        text: response.text,
        isOwnMessage: true,
      },
    ]);
  }

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
    localStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    localStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    localStreamRef.current = null;
    screenStreamRef.current = null;
    videoProducerRef.current = null;
    audioProducerRef.current = null;
    await leaveRoom(roomId);
    navigate("/");
  }

  if (!roomId || !name) {
    return null;
  }

  
  function getGridCols(count: number) {
    if (count <= 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-2";
    if (count <= 4) return "grid-cols-2";
    if (count <= 6) return "grid-cols-3";
    return "grid-cols-4";
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 p-4 overflow-auto">
          <div
            className={`grid gap-4 h-full ${getGridCols(remoteStreams.length)}`}
          >
            {remoteStreams.map((item, index) => (
              <div
                key={item.id}
                className="bg-white border rounded p-2 flex flex-col"
              >
                <p className="text-sm mb-2">
                  getName(item.id) user-{index + 1}
                </p>

                <div className="flex-1 bg-black rounded overflow-hidden">
                  <RemoteVideo
                    stream={item.stream}
                    isAudioEnabled={item.isAudioEnabled}
                    isVideoEnabled={item.isVideoEnabled}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="w-[35%] border-l bg-white p-4 flex flex-col">
          <div className="h-[40%] mb-4">
            <p className="text-sm mb-2">You</p>

            <div className="h-full bg-black rounded overflow-hidden relative">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-cover ${
                  !isVideoEnabled || isScreenSharing ? "hidden" : ""
                }`}
              />

              {!isVideoEnabled && (
                <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
                  Video Off
                </div>
              )}
              {isScreenSharing && (
                <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
                  Screen Sharing
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <Chat
              messages={chatMessages}
              onSendMessage={handleSendChatMessage}
            />
          </div>
        </div>
      </div>

      <div className="h-[60px] bg-white border-t flex items-center justify-center gap-4">
        <button
          onClick={handleToggleVideo}
          className="px-4 py-1 border rounded"
        >
          {isVideoEnabled ? "Stop Video" : "Start Video"}
        </button>

        <button
          onClick={handleToggleAudio}
          className="px-4 py-1 border rounded"
        >
          {isAudioEnabled ? "Mute" : "Unmute"}
        </button>

        <button
          onClick={handleScreenShare}
          className="px-4 py-1 border rounded"
        >
          {isScreenSharing ? "Stop Share" : "Share Screen"}
        </button>

        <button
          onClick={handleLeave}
          className="px-4 py-1 border rounded text-red-500"
        >
          Leave
        </button>
      </div>
    </div>
  );
};

export { RoomPage };
