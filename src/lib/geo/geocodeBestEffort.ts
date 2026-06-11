/**
 * geocodeBestEffort — geocoding "fire-and-forget" per i form di salvataggio.
 *
 * Compone l'indirizzo dalle parti disponibili e lo geocodifica via HERE
 * (cache globale cross-company) con fallback Nominatim. Non lancia mai:
 * restituisce null su qualsiasi errore — il salvataggio del form non deve
 * mai fallire per colpa del geocoding.
 */
import { forwardGeocode } from "@/lib/geocoding";

export async function geocodeBestEffort(
  parts: Array<string | null | undefined>,
): Promise<{ lat: number; lng: number } | null> {
  const address = parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(", ");
  if (address.length < 8) return null;
  try {
    return await forwardGeocode(address);
  } catch {
    return null;
  }
}
