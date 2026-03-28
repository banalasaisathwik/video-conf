import { useEffect, useRef } from "react";

interface Props {
  stream: MediaStream;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
}

const RemoteVideo = ({ stream, isAudioEnabled, isVideoEnabled }: Props) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="w-full h-full relative bg-black rounded overflow-hidden">

      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-cover ${
          !isVideoEnabled ? "hidden" : ""
        }`}
      />

      {!isVideoEnabled && (
        <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
          Video Off
        </div>
      )}

      {!isAudioEnabled && (
        <div className="absolute bottom-1 left-1 text-xs bg-white px-1 rounded">
          Muted
        </div>
      )}
    </div>
  );
};

export { RemoteVideo };