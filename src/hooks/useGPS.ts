import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface GPSResult {
  lat: number;
  lng: number;
  accuracy: number;
  address?: string;
  in_sede: boolean;
  sede_nome?: string;
  sede_id?: string;
  status: "loading" | "success" | "error" | "denied" | "idle";
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useGPS(companyId: string | null) {
  const [result, setResult] = useState<GPSResult>({
    lat: 0,
    lng: 0,
    accuracy: 0,
    in_sede: false,
    status: "idle",
  });

  const requestPosition = useCallback(async () => {
    if (!companyId) return;
    if (!navigator.geolocation) {
      setResult((r) => ({ ...r, status: "error" }));
      return;
    }

    setResult((r) => ({ ...r, status: "loading" }));

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;

        // Match against company sedi
        const { data: sedi } = await supabase
          .from("hr_sedi")
          .select("id, nome, lat, lng, raggio_mt")
          .eq("company_id", companyId)
          .eq("attiva", true);

        let in_sede = false;
        let sede_nome: string | undefined;
        let sede_id: string | undefined;

        if (sedi) {
          for (const sede of sedi) {
            if (sede.lat && sede.lng) {
              const dist = haversineDistance(lat, lng, Number(sede.lat), Number(sede.lng));
              if (dist <= (sede.raggio_mt || 200)) {
                in_sede = true;
                sede_nome = sede.nome;
                sede_id = sede.id;
                break;
              }
            }
          }
        }

        // Try reverse geocoding
        let address: string | undefined;
        try {
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            { headers: { "Accept-Language": "it" } }
          );
          if (resp.ok) {
            const data = await resp.json();
            const a = data.address;
            if (a) {
              address = [a.road, a.house_number, a.city || a.town || a.village]
                .filter(Boolean)
                .join(" ");
            }
          }
        } catch {
          // geocoding is best-effort
        }

        setResult({ lat, lng, accuracy, address, in_sede, sede_nome, sede_id, status: "success" });
      },
      (err) => {
        setResult((r) => ({
          ...r,
          status: err.code === 1 ? "denied" : "error",
        }));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [companyId]);

  return { ...result, requestPosition };
}
