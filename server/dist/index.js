import { WebSocketServer } from "ws";
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
    const port = Number(process.env.PORT || 8080);
    const host = "0.0.0.0";
    app.get("/", (_req, res) => {
        res.status(200).send("ok");
    });
    const wss = new WebSocketServer({ server });
    wss.on("connection", (ws) => {
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
            handleLeave(ws);
            console.log("client left");
        });
    });
    server.listen(port, host, () => {
        console.log(`Server listening on ${host}:${port}`);
    });
}
main().catch((error) => {
    console.error("server startup failed", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map