/**
 * App di cantiere: i miei giorni e con chi lavoro (26/09/2026).
 *
 * Dal database arrivano solo le cose che servono a chi lavora: dove va, le sue
 * fasi, la sua squadra coi nomi dei colleghi, caposquadra e capocantiere col
 * telefono di lavoro. Niente soldi, niente dati personali degli altri.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Contatto {
  nome: string;
  telefono: string | null;
}

export interface CantiereDelGiorno {
  order_id: string;
  codice: string | null;
  titolo: string | null;
  indirizzo: string | null;
  sono_capocantiere: boolean;
  /** Le mie fasi di quel giorno. */
  fasi: string[];
  squadra: { nome: string; colore: string | null; sono_caposquadra: boolean; caposquadra: Contatto | null } | null;
  capocantiere: Contatto | null;
}

export interface GiornoCampo {
  giorno: string;
  cantieri: CantiereDelGiorno[];
}

export interface MiaGiornata {
  giorni: GiornoCampo[];
  senza_date: { order_id: string; codice: string | null; titolo: string | null; indirizzo: string | null }[];
}

export function useMiaGiornata(giorni = 7) {
  const { user } = useAuth();
  return useQuery<MiaGiornata>({
    queryKey: ["campo-mia-giornata", user?.id, giorni],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("campo_mia_giornata", { p_giorni: giorni });
      if (error) throw error;
      return (data ?? { giorni: [], senza_date: [] }) as unknown as MiaGiornata;
    },
  });
}

export interface SquadraMia {
  id: string;
  nome: string;
  colore: string | null;
  sono_caposquadra: boolean;
  caposquadra: Contatto | null;
  oggi_qui: boolean;
  compagni: { nome: string; sei_tu: boolean }[];
}

export interface ChiLavora {
  giorno: string;
  sono_capocantiere: boolean;
  capocantiere: Contatto | null;
  mie_squadre: SquadraMia[];
  /** Nomi di altre squadre e ditte sul cantiere quel giorno. */
  anche_oggi: string[];
}

export function useChiLavora(orderId: string | undefined) {
  return useQuery<ChiLavora | null>({
    queryKey: ["campo-chi-lavora", orderId],
    enabled: !!orderId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("campo_chi_lavora", { p_order_id: orderId! });
      if (error) throw error;
      return (data ?? null) as unknown as ChiLavora | null;
    },
  });
}

/** «tel:» con le sole cifre e il più: niente spazi o trattini. */
export function linkTelefono(numero: string | null | undefined): string | null {
  const pulito = (numero ?? "").replace(/[^\d+]/g, "");
  return pulito.length >= 6 ? `tel:${pulito}` : null;
}

/** Maps sull'indirizzo del cantiere. */
export function linkMappa(indirizzo: string | null | undefined): string | null {
  const a = (indirizzo ?? "").trim();
  return a ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}` : null;
}
