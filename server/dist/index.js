import { WebSocketServer } from "ws";
import { safeParse } from "./utils/validate.js";
import { handleMessage } from "./handler/messageHandler.js";
import { handleLeave } from "./utils/helpers.js";
import { startWorker } from "./utils/mediaSoup.js";
async function main() {
    await startWorker();
    const wss = new WebSocketServer({ port: 8080 });
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
}
main();
//# sourceMappingURL=index.js.map