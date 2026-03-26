let ws: WebSocket | null = null;

let isInitialized = false; 

const listeners = new Set<(data: any) => void>();
const pendingRequests = new Map<string, (data: any) => void>();

export function connect() {
  if (isInitialized) {
    console.log("Already connected");
    return;
  }

  isInitialized = true;

  console.log("CONNECT CALLED");

  ws = new WebSocket("ws://localhost:8080");

  ws.onopen = () => {
    console.log("websocket connected");
  };


ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  console.log("RAW MESSAGE:", message);

  if (message.msgId && pendingRequests.has(message.msgId)) {
    const resolve = pendingRequests.get(message.msgId);
    resolve?.(message.data);
    pendingRequests.delete(message.msgId);
  } 
  else {
    console.log("Listeners count:",  listeners.size);

    listeners.forEach((cb: any) => cb(message));
  }
};
  ws.onclose = () => {
    console.log("connection closed");
    ws = null;
    isInitialized = false;
  };
}
export function sendRequest(type: string, data = {}) {
  const msgId = Math.random().toString(36).substring(2, 10);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(msgId);
      reject(new Error(`Request ${type} timed out`));
    }, 10000);

    pendingRequests.set(msgId, (response: any) => {
      clearTimeout(timeout);
      resolve(response);
    });

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error("WebSocket not connected"));
      return;
    }

    ws.send(
      JSON.stringify({
        type,
        msgId,
        data,
      })
    );
  });
}

export function subscribe(cb: (data: any) => void) {
  console.log("Subscribing listener");
  listeners.add(cb);
}

export function unsubscribe(cb: (data: any) => void) {
  listeners.delete(cb);
}

export function leaveRoom(roomId: string) {
  return sendRequest("LEAVE_ROOM", { roomId });
}
