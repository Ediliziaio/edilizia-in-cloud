// src/hooks/useGeneraleUnita.ts
// Modulo «Unità e vendite» della commessa generale: una lettura (generale_unita_elenco) e le
// scritture, tutte via RPC (migrazione 20281031120000). Ogni scrittura può cambiare l'importo
// delle commesse figlie (il prezzo dell'unità), quindi rilegge anche il riepilogo della generale.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { chiaviGenerali } from "@/hooks/useCommesseGenerali";
import { caricaVarianti } from "@/hooks/useGeneraleVarianti";
import { conVarianti } from "@/lib/orders/generali/varianti";
import { leggiElencoUnita, type DatiCambioStato, type ElencoUnita, type StatoVendita, type TipoMovimento } from "@/lib/orders/generali/unita";
import type { ParteCalcolata } from "@/lib/orders/generali/unitaConti";
import type { UnitaDaCreare } from "@/lib/orders/generali/unitaSerie";

// Tabelle e RPC non sono ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const chiaviUnita = {
  elenco: (generaleId: string | undefined) => ["generale-unita", generaleId] as const,
};

/** Le unità di una generale, con pagamenti, costi e varianti degli acquirenti (che entrano nel prezzo). */
export function useUnitaGenerale(generaleId: string | undefined) {
  return useQuery({
    queryKey: chiaviUnita.elenco(generaleId),
    enabled: !!generaleId,
    staleTime: 30_000,
    queryFn: async (): Promise<ElencoUnita> => {
      const [{ data, error }, varianti] = await Promise.all([
        db.rpc("generale_unita_elenco", { p_generale_id: generaleId }),
        caricaVarianti(generaleId!),
      ]);
      if (error) throw error;
      const e = leggiElencoUnita(data);
      if (!e) throw new Error("Unità non trovate.");
      return conVarianti(e, varianti);
    },
  });
}

function useRileggi(generaleId: string) {
  const qc = useQueryClient();
  return (nuoveCommesse = false) => {
    void qc.invalidateQueries({ queryKey: chiaviUnita.elenco(generaleId) });
    void qc.invalidateQueries({ queryKey: chiaviGenerali.riepilogo(generaleId) });
    if (nuoveCommesse) {
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["mappa-commesse-generali"] });
    }
  };
}

export interface DatiUnita {
  sigla?: string;
  edificio?: string | null;
  piano?: string | null;
  tipologia?: string | null;
  mq_commerciali?: number | null;
  millesimi?: number | null;
  prezzo_listino?: number | null;
  prezzo_trattato?: number | null;
  prezzo_rogito?: number | null;
  agenzia?: string | null;
  provvigione_agenzia?: number | null;
  note?: string | null;
}

/** Salva solo i campi passati (il database lascia gli altri come sono). */
export function useSalvaUnita(generaleId: string) {
  const rileggi = useRileggi(generaleId);
  return useMutation({
    mutationFn: async ({ orderId, dati }: { orderId: string; dati: DatiUnita }) => {
      const { error } = await db.rpc("generale_unita_salva", { p_order_id: orderId, p_dati: dati });
      if (error) throw error;
    },
    onSuccess: () => rileggi(),
  });
}

export function useCambiaStatoUnita(generaleId: string) {
  const rileggi = useRileggi(generaleId);
  return useMutation({
    mutationFn: async ({ orderId, stato, dati }: { orderId: string; stato: StatoVendita; dati: Partial<DatiCambioStato> }) => {
      // Solo le chiavi scritte: un prezzo non scritto lo decide il database (trattato, poi listino).
      const p: Record<string, unknown> = {};
      if (dati.acquirenteId !== undefined) p.acquirente_id = dati.acquirenteId;
      if (dati.data) p.data = dati.data;
      if (dati.prezzo !== undefined && dati.prezzo !== null) p.prezzo = dati.prezzo;
      if (dati.caparra) p.caparra = dati.caparra;
      if (dati.saldo) p.saldo = dati.saldo;
      if (dati.rogitoPrevisto !== undefined) p.rogito_previsto = dati.rogitoPrevisto;
      const { error } = await db.rpc("generale_unita_stato", { p_order_id: orderId, p_stato: stato, p_dati: p });
      if (error) throw error;
    },
    onSuccess: () => rileggi(),
  });
}

export function useAggiungiMovimento(generaleId: string) {
  const rileggi = useRileggi(generaleId);
  return useMutation({
    mutationFn: async (v: { orderId: string; tipo: TipoMovimento; importo: number; data: string | null; descrizione: string | null }) => {
      const { error } = await db.rpc("generale_unita_movimento_aggiungi", {
        p_order_id: v.orderId, p_tipo: v.tipo, p_importo: v.importo, p_data: v.data, p_descrizione: v.descrizione,
      });
      if (error) throw error;
    },
    onSuccess: () => rileggi(),
  });
}

export function useEliminaMovimento(generaleId: string) {
  const rileggi = useRileggi(generaleId);
  return useMutation({
    mutationFn: async (movimentoId: string) => {
      const { error } = await db.rpc("generale_unita_movimento_elimina", { p_movimento_id: movimentoId });
      if (error) throw error;
    },
    onSuccess: () => rileggi(),
  });
}

/** Le commesse figlie e le loro unità, tutte insieme. Restituisce quante ne ha create. */
export function useCreaUnitaInSerie(generaleId: string) {
  const rileggi = useRileggi(generaleId);
  return useMutation({
    mutationFn: async (unita: UnitaDaCreare[]): Promise<number> => {
      const { data, error } = await db.rpc("generale_unita_serie", { p_generale_id: generaleId, p_righe: unita });
      if (error) throw error;
      return typeof data === "number" ? data : unita.length;
    },
    onSuccess: () => rileggi(true),
  });
}

export function useDividiUnita(generaleId: string) {
  const rileggi = useRileggi(generaleId);
  return useMutation({
    mutationFn: async ({ orderId, parti }: { orderId: string; parti: ParteCalcolata[] }): Promise<number> => {
      const { data, error } = await db.rpc("generale_unita_dividi", {
        p_order_id: orderId,
        p_parti: parti.map((p) => ({
          sigla: p.sigla, tipologia: p.tipologia, mq_commerciali: p.mq, millesimi: p.millesimi, prezzo_listino: p.listino,
        })),
      });
      if (error) throw error;
      return typeof data === "number" ? data : parti.length;
    },
    onSuccess: () => rileggi(true),
  });
}
