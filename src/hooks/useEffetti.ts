import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { queryKeys } from "@/lib/queryKeys";

// NB: le RPC degli effetti non sono ancora in types.ts: non si può rigenerare finché le altre sessioni
// non pubblicano le loro migrazioni (la rigenerazione romperebbe altri file). Per questo il cast.
export type TipoEffetto = "assegno" | "riba" | "rid";
export type EsitoEffetto = "pagato" | "insoluto" | "annullato";

export interface Effetto {
  id: string;
  tipo: TipoEffetto;
  direzione: "emesso" | "ricevuto";
  numero: string | null;
  banca: string | null;
  importo: number;
  data_emissione: string | null;
  data_scadenza: string;
  stato: string;
  data_esito: string | null;
  scadenza_id: string | null;
  company_cost_id: string | null;
  rata_fornitore_id: string | null;
  documento_id: string | null;
  riga_scadenzario_id: string | null;
  descrizione_fonte: string | null;
  controparte: string | null;
  da_confermare: boolean | null;
}

export interface RegistraEffettoParams {
  fonteTipo: "scadenza" | "costo" | "documento";
  fonteId: string;
  rataFornitoreId?: string | null;
  tipo: TipoEffetto;
  direzione: "emesso" | "ricevuto";
  numero?: string | null;
  banca?: string | null;
  importo: number;
  dataEmissione?: string | null;
  dataScadenza: string;
  note?: string | null;
}

export interface ChiudiEffettoParams {
  effettoId: string;
  esito: EsitoEffetto;
  data: string;
  contoBanca?: string | null;
  contoLiquidita?: string | null;
}

export const metodiConEffetto = (metodo: string): metodo is TipoEffetto | "ri.ba" =>
  metodo === "assegno" || metodo === "riba" || metodo === "ri.ba" || metodo === "rid";

export const tipoEffettoDaMetodo = (metodo: string): TipoEffetto =>
  metodo === "assegno" ? "assegno" : metodo === "rid" ? "rid" : "riba";

const arrotonda = (n: number) => Math.round(n * 100) / 100;

/** Residuo libero = residuo meno quanto già coperto da effetti in attesa. Mai negativo. */
export function residuoLibero(residuo: number, coperto: number): number {
  return Math.max(0, arrotonda(residuo - coperto));
}

export function sommaCoperto(effetti: Pick<Effetto, "importo">[]): number {
  return arrotonda(effetti.reduce((s, e) => s + Number(e.importo || 0), 0));
}

export const effettiKey = (companyId: string | undefined, stati: string[] = ["in_attesa"]) =>
  ["effetti", companyId, stati.join(",")] as const;

export function useEffettiElenco(companyId: string | undefined, stati: string[] = ["in_attesa"], enabled = true) {
  return useQuery({
    queryKey: effettiKey(companyId, stati),
    enabled: enabled && !!companyId,
    queryFn: async (): Promise<Effetto[]> => {
      const { data, error } = await (supabase as any).rpc("effetti_elenco", { p_company_id: companyId, p_stati: stati });
      if (error) throw error;
      return (data ?? []) as Effetto[];
    },
  });
}

/** Effetti in attesa di una sola fonte (scadenza o costo), con il totale già coperto. */
export function useEffettiFonte(companyId: string | undefined, fonte: { scadenzaId?: string | null; costId?: string | null }, enabled = true) {
  const q = useEffettiElenco(companyId, ["in_attesa"], enabled && !!(fonte.scadenzaId || fonte.costId));
  const effetti = (q.data ?? []).filter(e => (fonte.scadenzaId && e.scadenza_id === fonte.scadenzaId) || (fonte.costId && e.company_cost_id === fonte.costId));
  return { ...q, effetti, coperto: sommaCoperto(effetti) };
}

function invalida(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["effetti"] });
  void qc.invalidateQueries({ queryKey: queryKeys.scadenzario.all });
  void qc.invalidateQueries({ queryKey: queryKeys.primaNota.all });
  void qc.invalidateQueries({ queryKey: queryKeys.cashflow.all });
  refreshFinancialQueries(qc);
}

export function useRegistraEffetto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: RegistraEffettoParams) => {
      const { data, error } = await (supabase as any).rpc("registra_effetto", {
        p_fonte_tipo: p.fonteTipo,
        p_fonte_id: p.fonteId,
        p_rata_fornitore_id: p.rataFornitoreId ?? null,
        p_tipo: p.tipo,
        p_direzione: p.direzione,
        p_numero: p.numero?.trim() || null,
        p_banca: p.banca?.trim() || null,
        p_importo: p.importo,
        p_data_emissione: p.dataEmissione || null,
        p_data_scadenza: p.dataScadenza,
        p_note: p.note || null,
      });
      if (error) throw error;
      return data as { id: string; coperto: number; residuo_libero: number };
    },
    onSuccess: () => invalida(qc),
  });
}

/**
 * La `p_richiesta` resta la stessa per tutti i tentativi dello stesso salvataggio (stessi parametri):
 * si rigenera solo se l'utente cambia esito, data o conti. Dopo un esito riuscito si azzera.
 */
export function useChiudiEffetto() {
  const qc = useQueryClient();
  const richiesta = useRef<{ firma: string; id: string }>({ firma: "", id: "" });
  return useMutation({
    mutationFn: async (p: ChiudiEffettoParams) => {
      const firma = JSON.stringify([p.effettoId, p.esito, p.data, p.contoBanca ?? null, p.contoLiquidita ?? null]);
      if (richiesta.current.firma !== firma) richiesta.current = { firma, id: crypto.randomUUID() };
      const { data, error } = await (supabase as any).rpc("chiudi_effetto", {
        p_effetto: p.effettoId,
        p_esito: p.esito,
        p_data: p.data,
        p_richiesta: richiesta.current.id,
        p_conto_banca: p.contoBanca ?? null,
        p_conto_liquidita: p.contoLiquidita ?? null,
      });
      if (error) throw error;
      return data as { stato: string; prima_nota_entry_id: string | null; gia_chiuso: boolean };
    },
    onSuccess: () => { richiesta.current = { firma: "", id: "" }; invalida(qc); },
  });
}

export interface RataCosto { id: string; numero: number; importo: number | null; scadenza: string | null; stato: string }

/** Rate di un costo (non stornate). Vuoto = costo senza rate. */
export function useRateCosto(costId: string, enabled = true) {
  return useQuery({
    queryKey: ["effetti", "rate-costo", costId] as const,
    enabled,
    queryFn: async (): Promise<RataCosto[]> => {
      const { data, error } = await supabase.from("rate_fornitori").select("id, numero, importo, scadenza, stato").eq("company_cost_id", costId).neq("stato", "stornata").order("numero");
      if (error) throw error;
      return (data ?? []) as RataCosto[];
    },
  });
}
