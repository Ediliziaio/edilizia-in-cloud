/**
 * DistanceFromBase — badge "🚗 12 km · 18 min dalla sede" per la scheda cliente.
 *
 * Geocodifica l'indirizzo del cliente (HERE con cache globale) e calcola la
 * distanza/tempo su strada dalla sede operativa dell'azienda. Non renderizza
 * nulla se mancano l'indirizzo del cliente o le coordinate della sede —
 * nessun errore visibile, il badge semplicemente non appare.
 */
import { useQuery } from "@tanstack/react-query";
import { Car } from "lucide-react";
import { forwardGeocode } from "@/lib/geocoding";
import { getRoute, formatDurationText, formatDistanceText } from "@/lib/routing";
import { useCompanyBase } from "@/hooks/useCompanyBase";

interface DistanceFromBaseProps {
  address?: string | null;
  city?: string | null;
  province?: string | null;
  className?: string;
}

export default function DistanceFromBase({
  address,
  city,
  province,
  className,
}: DistanceFromBaseProps) {
  const base = useCompanyBase();
  const fullAddress = [address, city, province].filter(Boolean).join(", ");

  const { data } = useQuery({
    queryKey: ["distance-from-base", base?.lat, base?.lng, fullAddress],
    queryFn: async (): Promise<{ distanceText: string; durationText: string } | null> => {
      if (!base || !fullAddress) return null;
      const coords = await forwardGeocode(fullAddress);
      if (!coords) return null;
      const route = await getRoute([base, coords]);
      if (!route) return null;
      return {
        distanceText: formatDistanceText(route.distanceMeters),
        durationText: formatDurationText(route.durationSec),
      };
    },
    enabled: !!base && !!fullAddress,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  if (!data) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs text-muted-foreground ${className ?? ""}`}
      title="Distanza e tempo di viaggio in auto dalla sede operativa"
    >
      <Car className="h-3.5 w-3.5" aria-hidden="true" />
      {data.distanceText} · {data.durationText} dalla sede
    </span>
  );
}
