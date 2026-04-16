import { io, type Socket } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || `http://${window.location.hostname}:5000`;

// ✅ Create ONE singleton socket instance
export const socket: Socket = io(SOCKET_URL, {
  auth: { token: localStorage.getItem("sentinel_token") || null },
  transports: ["websocket", "polling"], // websocket first, fallback to polling
  withCredentials: true,
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 500,
});

// ✅ Debug logs (so you can SEE it working)
socket.on("connect", () => {
  console.log("🟢 socket connected:", socket.id, "->", SOCKET_URL);
});

socket.on("disconnect", (reason) => {
  console.log("🔴 socket disconnected:", reason);
});

socket.on("connect_error", (err) => {
  console.log("❌ socket connect_error:", err.message);
});

// Update auth token (call after login/logout)
export function setSocketToken(token: string | null) {
  try {
    (socket as any).auth = { token };
    if (socket.connected) socket.disconnect();
    socket.connect();
  } catch {
    // ignore
  }
}
