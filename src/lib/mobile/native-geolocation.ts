import { Geolocation, type Position } from "@capacitor/geolocation";
import { isNative } from "./platform";

export interface GeoPosition {
  latitude: number; longitude: number; accuracy: number;
  altitude: number | null; speed: number | null; heading: number | null; timestamp: number;
}

export async function getCurrentPosition(): Promise<GeoPosition> {
  if (isNative) {
    const pos: Position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy,
      altitude: pos.coords.altitude, speed: pos.coords.speed, heading: pos.coords.heading, timestamp: pos.timestamp };
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("Geolocalizzazione non supportata")); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude, speed: pos.coords.speed, heading: pos.coords.heading, timestamp: pos.timestamp }),
      (err) => reject(new Error(`Errore GPS: ${err.message}`)),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

export function watchPosition(onPosition: (pos: GeoPosition) => void, onError?: (err: Error) => void): () => void {
  if (isNative) {
    let watchId: string | undefined;
    Geolocation.watchPosition({ enableHighAccuracy: true }, (pos, err) => {
      if (err) { onError?.(new Error(err.message)); return; }
      if (pos) { onPosition({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude, speed: pos.coords.speed, heading: pos.coords.heading, timestamp: pos.timestamp }); }
    }).then((id) => { watchId = id; });
    return () => { if (watchId) Geolocation.clearWatch({ id: watchId }); };
  }
  if (!navigator.geolocation) { onError?.(new Error("Geolocalizzazione non supportata")); return () => {}; }
  const watchId = navigator.geolocation.watchPosition(
    (pos) => onPosition({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy,
      altitude: pos.coords.altitude, speed: pos.coords.speed, heading: pos.coords.heading, timestamp: pos.timestamp }),
    (err) => onError?.(new Error(`Errore GPS: ${err.message}`)), { enableHighAccuracy: true }
  );
  return () => navigator.geolocation.clearWatch(watchId);
}

export async function requestPermissions(): Promise<boolean> {
  if (!isNative) return true;
  try { const s = await Geolocation.requestPermissions(); return s.location === "granted" || s.coarseLocation === "granted"; }
  catch { return false; }
}
