// ════════════════════════════════════════════════════════════════════════════
// GPS FleetTrack — shared TypeScript types
// ════════════════════════════════════════════════════════════════════════════

export interface GpsPosition {
  id: string;
  company_id: string;
  user_id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  battery_level: number | null;
  recorded_at: string;
  created_at: string;
}

export interface GpsPositionInsert {
  company_id: string;
  user_id: string;
  lat: number;
  lng: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  battery_level?: number | null;
  recorded_at?: string;
}

export interface CantiereGeofence {
  id: string;
  company_id: string;
  order_id: string | null;
  nome: string;
  center_lat: number;
  center_lng: number;
  radius_mt: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CantiereGeofenceInsert {
  company_id: string;
  order_id?: string | null;
  nome: string;
  center_lat: number;
  center_lng: number;
  radius_mt?: number;
  is_active?: boolean;
}

export interface TecnicoGpsConsent {
  id: string;
  user_id: string;
  company_id: string;
  version: string;
  consented_at: string;
  revoked_at: string | null;
}

/** Posizione live di un tecnico (arricchita con dati profilo) */
export interface TecnicoLivePosition {
  userId: string;
  fullName: string;
  avatarColor: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  battery_level: number | null;
  recorded_at: string;
  /** Secondi dall'ultimo aggiornamento */
  staleSec: number;
}

/** Batch di posizioni inviato all'edge function */
export interface BatchGpsPayload {
  positions: GpsPositionInsert[];
  company_id: string;
}

/** Risposta edge function batch-gps-positions */
export interface BatchGpsResponse {
  inserted: number;
}

/** Stato tracking tecnico lato app campo */
export type TrackingStatus = "idle" | "consent_pending" | "active" | "paused" | "denied" | "error";

/** Versione testo privacy GPS corrente */
export const GPS_CONSENT_VERSION = "1.0" as const;

/** Intervallo watchPosition (ms) */
export const GPS_WATCH_INTERVAL_MS = 15_000 as const;

/** Buffer massimo posizioni prima del flush */
export const GPS_BATCH_SIZE = 10 as const;

/** Flush forzato ogni N ms anche se buffer < GPS_BATCH_SIZE */
export const GPS_FLUSH_INTERVAL_MS = 30_000 as const;
