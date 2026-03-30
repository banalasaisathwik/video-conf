import { useEffect, useRef } from "react";

interface Props {
  stream: MediaStream;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  label: string;
}

function getInitials(label: string) {
  return label
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

const RemoteVideo = ({ stream, isAudioEnabled, isVideoEnabled, label }: Props) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[1.5rem] bg-slate-950">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-cover ${
          !isVideoEnabled ? "hidden" : ""
        }`}
      />

      {!isVideoEnabled && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 text-white">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-xl font-semibold">
            {getInitials(label)}
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-slate-300">Camera is off</p>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-transparent px-4 py-3">
        <p className="text-sm font-medium text-white">{label}</p>
        {!isAudioEnabled && (
          <div className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur">
            Muted
          </div>
        )}
      </div>

      {!isVideoEnabled && (
        <div className="pointer-events-none absolute inset-0 rounded-[1.5rem] ring-1 ring-white/10" />
      )}

      {isVideoEnabled && !isAudioEnabled && (
        <div className="absolute right-4 top-4 rounded-full bg-slate-950/70 px-3 py-1 text-xs font-medium text-white backdrop-blur">
          Mic off
        </div>
      )}
    </div>
  );
};

export { RemoteVideo };
