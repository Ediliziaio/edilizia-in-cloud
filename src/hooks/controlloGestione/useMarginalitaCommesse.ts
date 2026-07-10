/**
 * Hook React Query — Marginalita per commessa/cantiere.
 */

import { useQuery } from "@tanstack/react-query";
import { cgRpc } from "@/hooks/controlloGestione/cgRpc";
import { supabase } from "@/integrations/supabase/client";

export type Semaforo = "verde" | "giallo" | "rosso" | "grigio";

export interface CommessaRiga {
  id: string;
  order_code: string | null;
  description: string;
  cliente: string | null;
  status: string | null;
  pct_avanzamento: number;
  work_start: string | null;
  work_end: string | null;
  preventivo: number;
  consuntivo: number;
  costo_acquisti: number;
  costo_errori: number;
  variazioni: number;
  /** Costo manodopera (squadra interna + squadre esterne) — soldi. */
  costo_manodopera: number;
  /** Ore lavorate dalla squadra interna (le squadre esterne sono a corpo → 0 ore). */
  ore_manodopera: number;
  margine: number;
  margine_perc: number;
  costo_atteso: number | null;
  margine_atteso: number | null;
  margine_atteso_perc: number | null;
  semaforo: Semaforo;
}

export interface CommesseKPI {
  n_commesse: number;
  n_in_corso: number;
  n_completate: number;
  preventivo_totale: number;
  consuntivo_totale: number;
  margine_totale: number;
  margine_atteso_totale: number;
  n_in_perdita: number;
}

export interface MarginalitaCommesseResult {
  meta: {
    company_id: string;
    anno: number | null;
    status_filter: string | null;
    generato_il: string;
  };
  kpi: CommesseKPI;
  righe: CommessaRiga[];
}

export function useMarginalitaCommesse(
  anno: number | null = null,
  statusFilter: string | null = null,
) {
  return useQuery({
    queryKey: ["cg", "commesse", anno, statusFilter] as const,
    queryFn: async (): Promise<MarginalitaCommesseResult> => {
      const { data, error } = await cgRpc("cg_get_marginalita_commesse_safe", { p_anno: anno, p_status_filter: statusFilter });
      if (error) throw error;
      const result = data as unknown as MarginalitaCommesseResult;
      const righe = result.righe ?? [];

      // La vista consuntivo INCLUDE già la manodopera, ma la RPC non ne espone
      // la componente. La ricaviamo per order_id (order_employees interni + squadre
      // esterne a corpo) per mostrare "dove la manodopera incide di più" in soldi e ore.
      const ids = righe.map((r) => r.id);
      const labById = new Map<string, { costo: number; ore: number }>();
      const bump = (orderId: string, costo: number, ore: number) => {
        const cur = labById.get(orderId) ?? { costo: 0, ore: 0 };
        cur.costo += costo;
        cur.ore += ore;
        labById.set(orderId, cur);
      };
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const [emp, ext] = await Promise.all([
          supabase.from("order_employees").select("order_id, total_cost, hours_worked").in("order_id", chunk),
          supabase.from("order_external_teams").select("order_id, total_cost").in("order_id", chunk),
        ]);
        if (emp.error) throw emp.error;
        if (ext.error) throw ext.error;
        for (const row of (emp.data ?? []) as Array<{ order_id: string; total_cost: number | null; hours_worked: number | null }>) {
          bump(row.order_id, Number(row.total_cost ?? 0), Number(row.hours_worked ?? 0));
        }
        for (const row of (ext.data ?? []) as Array<{ order_id: string; total_cost: number | null }>) {
          bump(row.order_id, Number(row.total_cost ?? 0), 0);
        }
      }
      for (const r of righe) {
        const l = labById.get(r.id);
        r.costo_manodopera = l?.costo ?? 0;
        r.ore_manodopera = l?.ore ?? 0;

        // FIX conteggi: `percentuale_avanzamento` è 0–100 in tutta l'app (SalTab,
        // Campo, PDF), ma la RPC la tratta come frazione 0–1 → `pct_avanz >= 1` è
        // vero per QUALSIASI commessa avviata, quindi la proiezione di costo/margine
        // a fine lavori non estrapola mai (mostra il margine attuale come fosse
        // finale). Normalizziamo a 0–1 e ricalcoliamo con la scala corretta.
        const pct01 = Math.min(Math.max(r.pct_avanzamento ?? 0, 0), 100) / 100;
        r.pct_avanzamento = pct01;
        // Sotto il 20% di avanzamento l'estrapolazione lineare (consuntivo / %) è
        // troppo rumorosa — un cantiere al 5% con un acquisto anticipato proietta
        // un costo ×20 e un margine assurdo. Sotto soglia → "non valutabile": lo
        // sforo reale resta comunque visibile nel margine attuale (colonna Margine ora).
        const PROJ_MIN_PCT = 0.2;
        const costoAtteso =
          pct01 >= 1 ? r.consuntivo : pct01 >= PROJ_MIN_PCT ? r.consuntivo / pct01 : null;
        const margineAtteso =
          costoAtteso !== null ? r.preventivo - costoAtteso : null;
        r.costo_atteso = costoAtteso;
        r.margine_atteso = margineAtteso;
        r.margine_atteso_perc =
          margineAtteso !== null && r.preventivo !== 0
            ? (margineAtteso / r.preventivo) * 100
            : null;
        r.semaforo =
          margineAtteso === null
            ? "grigio"
            : r.preventivo > 0 && margineAtteso / r.preventivo >= 0.15
              ? "verde"
              : margineAtteso < 0
                ? "rosso"
                : "giallo";
      }
      // KPI attesi ricalcolati sulla scala corretta (la RPC li aveva gonfiati).
      result.kpi.margine_atteso_totale = righe.reduce((s, r) => s + (r.margine_atteso ?? 0), 0);
      result.kpi.n_in_perdita = righe.filter((r) => (r.margine_atteso ?? 0) < 0).length;
      // Stessa svista di scala su in corso/completate: con pct 0–100 la RPC vedeva
      // "completata" qualsiasi commessa ≥1% (mostrava 0 in corso · 22 completate).
      result.kpi.n_in_corso = righe.filter((r) => r.pct_avanzamento > 0 && r.pct_avanzamento < 1).length;
      result.kpi.n_completate = righe.filter((r) => r.pct_avanzamento >= 1).length;
      return result;
    },
    staleTime: 60_000,
  });
}
