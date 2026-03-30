import mediasoup from "mediasoup";

let worker: mediasoup.types.Worker;
let webRtcServer: mediasoup.types.WebRtcServer;

function getNumberFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function getAnnouncedAddress() {
  return (
    process.env.MEDIASOUP_ANNOUNCED_ADDRESS ??
    (process.env.FLY_APP_NAME ? `${process.env.FLY_APP_NAME}.fly.dev` : undefined) ??
    "127.0.0.1"
  );
}

function isFlyRuntime() {
  return typeof process.env.FLY_APP_NAME === "string";
}

async function startWorker() {
  const announcedAddress = getAnnouncedAddress();
  const mediasoupPort = getNumberFromEnv("MEDIASOUP_PORT", 40000);
  const udpListenIp =
    process.env.MEDIASOUP_UDP_LISTEN_IP ??
    (isFlyRuntime() ? "0.0.0.0" : "0.0.0.0");
  const tcpListenIp = process.env.MEDIASOUP_TCP_LISTEN_IP ?? "0.0.0.0";

  worker = await mediasoup.createWorker({
    rtcMinPort: mediasoupPort,
    rtcMaxPort: mediasoupPort,
  });

  webRtcServer = await worker.createWebRtcServer({
    listenInfos: [
      {
        protocol: "udp",
        ip: udpListenIp,
        announcedAddress,
        port: mediasoupPort,
      },
      {
        protocol: "tcp",
        ip: tcpListenIp,
        announcedAddress,
        port: mediasoupPort,
      },
    ],
  });

  console.log("Mediasoup Worker started");
}

export { startWorker, worker, webRtcServer };
