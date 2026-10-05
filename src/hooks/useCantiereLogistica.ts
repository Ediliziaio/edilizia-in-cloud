/**
 * «Il cantiere» in cima a «Lavori e squadre» (26/09/2026): indirizzo, strada
 * dalla sede (km e tempo) e i mezzi e gli attrezzi legati al cantiere — quelli
 * che ci stanno e quelli in carico a chi ci lavora, per fase.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface IndirizzoCantiere {
  indirizzo: string | null;
  lat: number | null;
  lng: number | null;
}

export function useIndirizzoCantiere(orderId: string) {
  return useQuery<IndirizzoCantiere>({
    queryKey: ["cantiere-indirizzo", orderId],
    enabled: !!orderId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("indirizzo_lavori, work_lat, work_lng")
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return {
        indirizzo: data?.indirizzo_lavori?.trim() || null,
        lat: data?.work_lat == null ? null : Number(data.work_lat),
        lng: data?.work_lng == null ? null : Number(data.work_lng),
      };
    },
  });
}

export interface MezzoDelCantiere {
  id: string;
  nome: string;
  tipo: string;
  targa: string | null;
  /** Chi ce l'ha in carico, se qualcuno. */
  con?: string | null;
}

export interface MezzoDellaPersona extends MezzoDelCantiere {
  persona: string;
  /** Fasi di chi lo ha in carico; null = lavora su tutta la commessa. */
  fasi: string[] | null;
  a_bordo: string[];
  /** Codice dell'altro cantiere dove risulta il furgone, se c'è. */
  altrove: string | null;
}

/** Una parte di un ponteggio (o altra attrezzatura a quantità) montata sul cantiere. */
export interface MontaggioDelCantiere {
  /** L'id del montaggio (mezzi_allocazioni). */
  id: string;
  mezzo_id: string;
  nome: string;
  codice: string | null;
  quantita: number;
  unita: string | null;
  dal: string;
}

export interface MezziLavoro {
  sul_cantiere: MezzoDelCantiere[];
  /** Ponteggi e attrezzature a quantità montati qui (dal 05/10/2026). */
  montati?: MontaggioDelCantiere[];
  con_le_persone: MezzoDellaPersona[];
}

export const mezziLavoroKey = (orderId: string) => ["commessa-mezzi-lavoro", orderId] as const;

export function useMezziLavoro(orderId: string) {
  return useQuery<MezziLavoro>({
    queryKey: mezziLavoroKey(orderId),
    enabled: !!orderId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("commessa_mezzi_lavoro", { p_order_id: orderId });
      if (error) throw error;
      return (data ?? { sul_cantiere: [], con_le_persone: [] }) as unknown as MezziLavoro;
    },
  });
}

/** «40 min», «1 h 15 min». */
export function durataViaggio(minuti: number | null | undefined): string | null {
  if (minuti == null || !Number.isFinite(minuti)) return null;
  const m = Math.max(1, Math.round(minuti));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Indicazioni stradali dalla sede al cantiere (o solo il cantiere, senza sede). */
export function linkIndicazioni(
  sede: { lat: number; lng: number } | null,
  cantiere: IndirizzoCantiere | undefined,
): string | null {
  const dest = cantiere?.indirizzo
    ?? (cantiere?.lat != null && cantiere?.lng != null ? `${cantiere.lat},${cantiere.lng}` : null);
  if (!dest) return null;
  if (!sede) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest)}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${sede.lat},${sede.lng}&destination=${encodeURIComponent(dest)}&travelmode=driving`;
}
