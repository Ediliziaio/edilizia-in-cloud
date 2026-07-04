/**
 * useCrmMapViewport — sorgente dati SCALABILE per la Mappa CRM.
 *
 * Invece di caricare tutti i punti nel browser (non regge a 100k), interroga il
 * DB per il SOLO riquadro visibile (bbox) + zoom:
 *  • useCrmMapCells → cluster aggregati (RPC crm_map_cells): poche centinaia di
 *    celle con conteggio + split clienti/prospect. Usato quando ci sono tanti
 *    punti nel riquadro.
 *  • useCrmMapPointsBbox → punti singoli con dettaglio (RPC crm_map_points_bbox,
 *    cap 2000). Usato quando il riquadro contiene pochi punti (zoom alto) o per
 *    l'export della selezione.
 *
 * Così a qualsiasi zoom si scaricano ~centinaia di elementi: scala a 100k / 1M.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface CrmMapCell {
  gx: number;
  gy: number;
  n: number;
  n_clienti: number;
  n_prospect: number;
  clat: number;
  clng: number;
}

export interface CrmMapPoint {
  id: string;
  tipo: "cliente" | "prospect";
  nome: string;
  categoria: string | null;
  stato: string | null;
  temperatura: string | null;
  fatturato: number | null;
  email: string | null;
  telefono: string | null;
  citta: string | null;
  provincia: string | null;
  regione: string | null;
  indirizzo: string | null;
  lat: number;
  lng: number;
  precise: boolean;
}

/** Precisione della griglia (decimali di grado) in base allo zoom. */
export function precFromZoom(z: number): number {
  if (z <= 6) return 0; // ~110 km
  if (z <= 8) return 1; // ~11 km
  if (z <= 11) return 2; // ~1 km
  return 3; // ~110 m
}

/** Chiave stabile: arrotonda la bbox per non rifetchare a ogni pixel. */
function bboxKey(b: BBox | null): string {
  if (!b) return "none";
  const r = (n: number) => Math.round(n * 100) / 100;
  return `${r(b.minLat)},${r(b.minLng)},${r(b.maxLat)},${r(b.maxLng)}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export function useCrmMapCells(companyId: string | undefined, bbox: BBox | null, prec: number) {
  return useQuery<CrmMapCell[]>({
    queryKey: ["crm-map-cells", companyId ?? "*", bboxKey(bbox), prec],
    enabled: !!companyId && !!bbox,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("crm_map_cells", {
        p_company: companyId,
        p_min_lat: bbox!.minLat, p_min_lng: bbox!.minLng,
        p_max_lat: bbox!.maxLat, p_max_lng: bbox!.maxLng,
        p_prec: prec,
      });
      if (error) throw error;
      return (data ?? []) as CrmMapCell[];
    },
  });
}

export function useCrmMapPointsBbox(companyId: string | undefined, bbox: BBox | null, enabled: boolean) {
  return useQuery<CrmMapPoint[]>({
    queryKey: ["crm-map-points-bbox", companyId ?? "*", bboxKey(bbox)],
    enabled: !!companyId && !!bbox && enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("crm_map_points_bbox", {
        p_company: companyId,
        p_min_lat: bbox!.minLat, p_min_lng: bbox!.minLng,
        p_max_lat: bbox!.maxLat, p_max_lng: bbox!.maxLng,
        p_limit: 2000,
      });
      if (error) throw error;
      return (data ?? []) as CrmMapPoint[];
    },
  });
}
