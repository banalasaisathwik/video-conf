import type { ExtendedWebSocket, Room } from "../types/socket.js";
declare function addToRoom(ws: ExtendedWebSocket, roomId: string): Promise<void>;
declare function removeUserFromRoom(ws: ExtendedWebSocket, roomId: string, peerId: string): void;
declare function getRoom(ws: ExtendedWebSocket, roomId: string): Room | undefined;
export { addToRoom, removeUserFromRoom, getRoom };
//# sourceMappingURL=space.d.ts.map