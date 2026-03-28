import { useEffect, useRef } from "react";

interface RemoteVideoProps {
  stream: MediaStream;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
}

export function RemoteVideo({
  stream,
  isVideoEnabled,
  isAudioEnabled,
}: RemoteVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, isVideoEnabled]);

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{
          background: "#111827",
          borderRadius: "12px",
          display: isVideoEnabled ? "block" : "none",
          height: "220px",
          objectFit: "cover",
          width: "100%",
        }}
      />

      {!isVideoEnabled && (
        <div
          style={{
            alignItems: "center",
            background: "#111827",
            borderRadius: "12px",
            color: "#f9fafb",
            display: "flex",
            height: "220px",
            justifyContent: "center",
            width: "100%",
          }}
        >
          Video stopped
        </div>
      )}

      <p style={{ color: "#4b5563", margin: "8px 0 0" }}>
        {isAudioEnabled ? "Audio on" : "Audio stopped"}
      </p>
    </>
  );
}
