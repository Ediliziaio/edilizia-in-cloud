import { Network, type ConnectionStatus } from "@capacitor/network";
import { isNative } from "./platform";

export type NetworkState = { connected: boolean; connectionType: string };
let currentState: NetworkState = { connected: typeof navigator === "undefined" || navigator.onLine !== false, connectionType: "unknown" };
const listeners = new Set<(state: NetworkState) => void>();

export async function initNetworkMonitor() {
  if (isNative) {
    const aggiorna = (status: ConnectionStatus) => {
      if (currentState.connected === status.connected && currentState.connectionType === status.connectionType) return;
      currentState = { connected: status.connected, connectionType: status.connectionType };
      listeners.forEach((fn) => fn(currentState));
    };
    await Network.addListener("networkStatusChange", aggiorna);
    aggiorna(await Network.getStatus());
  } else {
    window.addEventListener("online", () => { currentState = { connected: true, connectionType: "unknown" }; listeners.forEach((fn) => fn(currentState)); });
    window.addEventListener("offline", () => { currentState = { connected: false, connectionType: "none" }; listeners.forEach((fn) => fn(currentState)); });
  }
}

export function getNetworkState(): NetworkState { return { ...currentState }; }
export function onNetworkChange(cb: (s: NetworkState) => void): () => void { listeners.add(cb); return () => listeners.delete(cb); }
export function isOnline(): boolean { return currentState.connected; }
