import { io } from "socket.io-client";

const configuredSocketUrl = String(import.meta.env.VITE_SOCKET_URL || "").trim().replace(/\/+$/, "");
const configuredApiUrl = String(import.meta.env.VITE_API_URL || "").trim();
const socketUrl = configuredSocketUrl
  || (configuredApiUrl ? new URL(configuredApiUrl, window.location.origin).origin : window.location.origin);

let sharedSocket = null;
let subscriberCount = 0;
let sharedSocketEverConnected = false;

export function connectRealtime() {
  if (!sharedSocket) {
    sharedSocket = io(socketUrl, {
      path: "/socket.io",
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    sharedSocket.on("connect", () => {
      sharedSocketEverConnected = true;
    });
  } else {
    if (sharedSocket.disconnected && !sharedSocket.active) sharedSocket.connect();
  }

  subscriberCount += 1;
  const listeners = [];
  let released = false;

  return {
    on(eventName, listener) {
      sharedSocket.on(eventName, listener);
      listeners.push([eventName, listener]);
      return this;
    },
    get connected() {
      return Boolean(sharedSocket?.connected);
    },
    get everConnected() {
      return sharedSocketEverConnected;
    },
    disconnect() {
      if (released) return;
      released = true;
      listeners.forEach(([eventName, listener]) => sharedSocket?.off(eventName, listener));
      subscriberCount = Math.max(0, subscriberCount - 1);
      if (subscriberCount === 0) sharedSocket?.disconnect();
    },
  };
}
