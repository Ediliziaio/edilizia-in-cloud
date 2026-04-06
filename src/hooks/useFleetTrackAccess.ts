import { useAuth } from "@/contexts/AuthContext";

/**
 * Restituisce se il modulo GPS FleetTrack è abilitato per l'azienda corrente.
 * Legge il flag `fleet_track_enabled` dall'oggetto `effectiveCompany`.
 */
export function useFleetTrackAccess(): boolean {
  const { effectiveCompany } = useAuth();
  return effectiveCompany?.fleet_track_enabled === true;
}
