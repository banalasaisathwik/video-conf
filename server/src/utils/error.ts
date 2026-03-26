import type { ExtendedWebSocket } from "../types/socket.js";


function sendError(ws: ExtendedWebSocket, description: string, msgId?: string) {
    ws.send(JSON.stringify({
        type: "ERROR",
        msgId,
        description
    }))
}

export {sendError}
