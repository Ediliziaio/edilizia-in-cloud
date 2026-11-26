/**
 * La Programmazione nel Calendario (26/11/2026): un riepilogo per giorno
 * (stato, interventi, chi va), letto una volta sola per il periodo visibile
 * con programmazione_riepilogo e condiviso dalle viste del Calendario.
 * Senza permesso «Commesse» (o senza la funzione) è semplicemente vuoto.
 */
import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { spostaGiorno } from "@/lib/programmazione/giornata";

export interface InterventoRiepilogo {
  id: string;
  tipo: string;
  orderId: string | null;
  titolo: string;
  indirizzo: string | null;
  inizio: string | null;
  fine: string | null;
  momento: "prima" | "dopo" | null;
  capo: string | null;
  persone: string[];
  esterni: string[];
  mezzi: string[];
}

export interface RiepilogoGiorno {
  giorno: string;
  stato: "bozza" | "pubblicata";
  modificata_dopo: boolean;
  completa: boolean;
  interventi: InterventoRiepilogo[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const chiaveRiepilogo = (companyId: string | null | undefined) => ["programmazione", "riepilogo", companyId] as const;

export function useRiepilogoProgrammazione(companyId: string | null | undefined, dal: Date | string, al: Date | string, attivo = true) {
  const da = typeof dal === "string" ? dal : format(dal, "yyyy-MM-dd");
  let a = typeof al === "string" ? al : format(al, "yyyy-MM-dd");
  // La funzione accetta al massimo 62 giorni: il Gantt lungo vede solo i primi.
  if (a > spostaGiorno(da, 62)) a = spostaGiorno(da, 62);
  return useQuery({
    queryKey: [...chiaveRiepilogo(companyId), da, a],
    enabled: !!companyId && attivo && a >= da,
    staleTime: 60_000,
    retry: false,
    meta: { silent: true },
    queryFn: async (): Promise<Map<string, RiepilogoGiorno>> => {
      const { data, error } = await db.rpc("programmazione_riepilogo", { p_company_id: companyId, p_dal: da, p_al: a });
      const out = new Map<string, RiepilogoGiorno>();
      if (error) return out;
      for (const g of (data ?? []) as RiepilogoGiorno[]) out.set(g.giorno, g);
      return out;
    },
  });
}

/** Il riepilogo del periodo, messo a disposizione dalla pagina Calendario. */
export const ProgrammazioneCalendarioContext = createContext<Map<string, RiepilogoGiorno> | null>(null);

export function useProgrammaDelGiorno(giorno: Date | string): RiepilogoGiorno | null {
  const mappa = useContext(ProgrammazioneCalendarioContext);
  if (!mappa) return null;
  const chiave = typeof giorno === "string" ? giorno.slice(0, 10) : format(giorno, "yyyy-MM-dd");
  return mappa.get(chiave) ?? null;
}

/** C'è la Programmazione in questa pagina (permesso e dati caricati)? */
export function useConProgrammazione(): boolean {
  return useContext(ProgrammazioneCalendarioContext) !== null;
}

/** Link alla Programmazione su un giorno. */
export const linkProgrammazione = (giorno: string) => `/azienda/ordini?tab=programmazione&giorno=${giorno}`;
