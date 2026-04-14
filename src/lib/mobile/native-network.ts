import { Network, type ConnectionStatus } from "@capacitor/network";
import { isNative } from "./platform";

export type NetworkState = { connected: boolean; connectionType: string };
let currentState: NetworkState = { connected: navigator.onLine, connectionType: "unknown" };
const listeners = new Set<(state: NetworkState) => void>();

export async function initNetworkMonitor() {
  if (isNative) {
    const status: ConnectionStatus = await Network.getStatus();
    currentState = { connected: status.connected, connectionType: status.connectionType };
    Network.addListener("networkStatusChange", (s) => {
      currentState = { connected: s.connected, connectionType: s.connectionType };
      listeners.forEach((fn) => fn(currentState));
    });
  } else {
    window.addEventListener("online", () => { currentState = { connected: true, connectionType: "unknown" }; listeners.forEach((fn) => fn(currentState)); });
    window.addEventListener("offline", () => { currentState = { connected: false, connectionType: "none" }; listeners.forEach((fn) => fn(currentState)); });
  }
}

export function getNetworkState(): NetworkState { return { ...currentState }; }
export function onNetworkChange(cb: (s: NetworkState) => void): () => void { listeners.add(cb); return () => listeners.delete(cb); }
export function isOnline(): boolean { return currentState.connected; }
