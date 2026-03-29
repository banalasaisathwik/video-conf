import { createServer } from "http";
import { WebSocketServer } from "ws";
import type { ExtendedWebSocket } from "./types/socket.js";
import { safeParse } from "./utils/validate.js";
import { handleMessage } from "./handler/messageHandler.js";
import { handleLeave } from "./utils/helpers.js";
import { startWorker } from "./utils/mediaSoup.js";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 8080);

async function main() {
  await startWorker();

  const server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Zoom signaling server is running");
  });
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  server.listen(port, host, () => {
    console.log(`WebSocket server listening on ${host}:${port}`);
  });

  wss.on("connection", (ws: ExtendedWebSocket) => {
    console.log("ws connection created");

    ws.connectionState = "CONNECTED";
    ws.isAlive = true;
    let messageQueue = Promise.resolve();

    ws.on("message", (rawData) => {
      messageQueue = messageQueue
        .then(async () => {
          const data = rawData.toString();
          const parsed = safeParse(data);
          if (!parsed) {
            console.log("wrong structure");
            return;
          }

          await handleMessage(parsed, ws);
        })
        .catch((error) => {
          console.error("message handling failed", error);
        });
    });

    ws.on("close", () => {
      handleLeave(ws)
      console.log("client left");
    });

  });
}

main();
