function sendError(ws, description, msgId) {
    ws.send(JSON.stringify({
        type: "ERROR",
        msgId,
        description
    }));
}
export { sendError };
//# sourceMappingURL=error.js.map