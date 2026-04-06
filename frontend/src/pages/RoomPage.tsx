import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type {
  DtlsParameters,
  IceCandidate,
  IceParameters,
  Producer,
  RtpCapabilities,
} from "mediasoup-client/types";
import type { Consumer, Device } from "mediasoup-client/types";
import { Chat } from "../component/Chat";
import { RemoteVideo } from "../component/RemoteVideo";
import { createDevice } from "../services/device";
import {
  leaveRoom,
  sendRequest,
  subscribe,
  unsubscribe,
} from "../services/socket";

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

function getGridCols(count: number) {
  if (count <= 1) return "xl:grid-cols-1";
  if (count === 2) return "md:grid-cols-2";
  if (count <= 4) return "md:grid-cols-2";
  if (count <= 6) return "md:grid-cols-2 xl:grid-cols-3";
  return "md:grid-cols-2 xl:grid-cols-4";
}

const RoomPage = () => {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const name = location.state?.name;

  const [participants, setParticipants] = useState<string[]>([]);
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
  }

  async function handleScreenShare() {
    if (!videoProducerRef.current) return;

    if (isScreenSharing) {
      await restartCamera();
    } else {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      screenStreamRef.current = screenStream;
      const screenTrack = screenStreamRef.current.getVideoTracks()[0];
      if (!screenTrack) return;
      screenTrack.onended = () => {
        void restartCamera();
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

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    sendTransportRef.current = null
    recvTransportRef.current = null
    
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

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-3 py-3 sm:px-4 lg:px-6">
        <header className="mb-3 flex flex-col gap-3 rounded-[1.75rem] border border-white/10 bg-white/5 px-4 py-4 backdrop-blur lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
              Meeting room
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Room {roomId}
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              You are joined as {name}.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-100">
              {participants.length + 1} people in room
            </div>
            <div className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">
              {isScreenSharing ? "Screen sharing on" : "Camera video active"}
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_370px]">
          <section className="flex min-h-[320px] flex-col rounded-[2rem] border border-white/10 bg-slate-900/70 p-3 shadow-2xl shadow-slate-950/40">
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <h2 className="text-lg font-semibold text-white">Participants</h2>
              </div>
              <div className="rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
                {remoteStreams.length} remote streams
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              {remoteStreams.length === 0 ? (
                <div className="flex h-full min-h-[360px] flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-white/10 bg-slate-950/50 px-6 text-center">
                  <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
                    Waiting room
                  </div>
                  <h3 className="mt-5 text-2xl font-semibold text-white">
                    Waiting for others to join
                  </h3>
                  
                </div>
              ) : (
                <div className={`grid gap-3 ${getGridCols(remoteStreams.length)}`}>
                  {remoteStreams.map((item, index) => {
                    const participantLabel = `Participant ${index + 1}`;

                    return (
                      <article
                        key={item.id}
                        className="flex min-h-[240px] flex-col rounded-[1.75rem] border border-white/10 bg-white/5 p-3 backdrop-blur"
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {participantLabel}
                            </p>
                            <p className="text-xs text-slate-400">
                              {item.isVideoEnabled
                                ? "Video is on"
                                : "Video is off"}
                            </p>
                          </div>
                          <div className="rounded-full bg-slate-950/60 px-3 py-1 text-xs font-medium text-slate-300">
                            {item.isAudioEnabled ? "Mic on" : "Mic muted"}
                          </div>
                        </div>

                        <div className="flex-1">
                          <RemoteVideo
                            stream={item.stream}
                            isAudioEnabled={item.isAudioEnabled}
                            isVideoEnabled={item.isVideoEnabled}
                            label={participantLabel}
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <aside className="flex min-h-[320px] flex-col gap-3">
            <section className="rounded-[2rem] border border-white/10 bg-white p-4 text-slate-900 shadow-2xl shadow-slate-950/20">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">You</h2>
                
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  {isAudioEnabled ? "Mic on" : "Mic off"}
                </div>
              </div>

              <div className="relative h-[240px] overflow-hidden rounded-[1.75rem] bg-slate-950 sm:h-[280px]">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`h-full w-full object-cover ${
                    !isVideoEnabled || isScreenSharing ? "hidden" : ""
                  }`}
                />

                {!isVideoEnabled && !isScreenSharing && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-xl font-semibold">
                      {name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">{name}</p>
                      <p className="text-xs text-slate-300">Your camera is off</p>
                    </div>
                  </div>
                )}

                {isScreenSharing && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
                    <div className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
                      Sharing
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">Your screen is live</p>
                      <p className="text-xs text-slate-300">
                        Others can currently see the screen you selected.
                      </p>
                    </div>
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-transparent px-4 py-3 text-sm text-white">
                  <span>{name}</span>
                  <span>{isVideoEnabled ? "Camera on" : "Camera off"}</span>
                </div>
              </div>
            </section>

            <div className="min-h-[320px] flex-1">
              <Chat
                messages={chatMessages}
                onSendMessage={handleSendChatMessage}
              />
            </div>
          </aside>
        </div>

        <footer className="mt-3 rounded-[1.75rem] border border-white/10 bg-white/5 px-3 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            <button
              onClick={handleToggleVideo}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                isVideoEnabled
                  ? "bg-white text-slate-900 hover:bg-slate-100"
                  : "bg-amber-400 text-slate-950 hover:bg-amber-300"
              }`}
            >
              {isVideoEnabled ? "Turn camera off" : "Turn camera on"}
            </button>

            <button
              onClick={handleToggleAudio}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                isAudioEnabled
                  ? "bg-white text-slate-900 hover:bg-slate-100"
                  : "bg-amber-400 text-slate-950 hover:bg-amber-300"
              }`}
            >
              {isAudioEnabled ? "Mute microphone" : "Unmute microphone"}
            </button>

            <button
              onClick={handleScreenShare}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                isScreenSharing
                  ? "bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                  : "bg-slate-800 text-white hover:bg-slate-700"
              }`}
            >
              {isScreenSharing ? "Stop sharing" : "Share screen"}
            </button>

            <button
              onClick={handleLeave}
              className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400"
            >
              Leave room
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export { RoomPage };
