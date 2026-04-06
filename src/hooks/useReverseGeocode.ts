import { useState, useEffect } from "react";
import { reverseGeocode } from "@/lib/geocoding";

interface UseReverseGeocodeResult {
  address: string | null;
  isLoading: boolean;
}

/**
 * Hook React per reverse geocoding di una coordinata.
 * Chiama geocoding.ts (con rate limit + cache).
 * Restituisce l'indirizzo leggibile oppure null durante il caricamento.
 */
export function useReverseGeocode(
  lat: number | null | undefined,
  lng: number | null | undefined
): UseReverseGeocodeResult {
  const [address, setAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (lat == null || lng == null) {
      setAddress(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    reverseGeocode(lat, lng)
      .then((result) => {
        if (!cancelled) setAddress(result);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [lat, lng]);

  return { address, isLoading };
}
