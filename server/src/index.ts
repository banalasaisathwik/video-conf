import { WebSocketServer } from "ws";
import type { ExtendedWebSocket } from "./types/socket.js";
import { safeParse } from "./utils/validate.js";
import { handleMessage } from "./handler/messageHandler.js";
import { handleLeave } from "./utils/helpers.js";
import { startWorker } from "./utils/mediaSoup.js";
import http from "http";
import express from "express";

async function main() {
  await startWorker();

const app = express();
const server = http.createServer(app);

const wss = new WebSocketServer({ server });

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
