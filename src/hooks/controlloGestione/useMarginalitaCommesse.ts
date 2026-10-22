import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
/**
 * Hook React Query — Marginalità per commessa/cantiere.
 *
 * Un solo calcolo con il dettaglio commessa:
 *  - costi, ricavo e margine dalla vista v_ordine_marginalita (manodopera al
 *    costo orario edile per tipo, rientri di magazzino, ditte senza IVA);
 *  - la manodopera mostrata è la colonna costo_manodopera della stessa vista;
 *  - l'avanzamento è quello della scheda commessa: media delle fasi quando
 *    l'azienda le pesa «alla pari», altrimenti il numero del database.
 */

import { useQuery } from "@tanstack/react-query";
import { cgRpc } from "@/hooks/controlloGestione/cgRpc";
import { supabase } from "@/integrations/supabase/client";
import { allPaymentRows } from "@/hooks/useSupplierPayments";
import { pesoMediaValido } from "@/lib/orders/avanzamentoCommessa";
import { avanzamentoMedioFasi, type FaseAvanzamento } from "@/lib/controlloGestione/avanzamentoFasi";

export type { Semaforo, CommessaRiga, CommesseKPI, MarginalitaCommesseResult } from "../../../supabase/functions/_shared/marginalitaCommesse.ts";
import { normalizeMarginalitaCommesse, type MarginalitaCommesseResult } from "../../../supabase/functions/_shared/marginalitaCommesse.ts";

// Tabelle e viste lette qui non tutte nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useMarginalitaCommesse(
  anno: number | null = null,
  statusFilter: string | null = null,
) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["cg", "commesse", anno, statusFilter, "reconciled-v2", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<MarginalitaCommesseResult> => {
      const { data, error } = await cgRpc("cg_get_marginalita_commesse_safe", { p_anno: anno, p_status_filter: statusFilter });
      if (error) throw error;
      const result = data as unknown as MarginalitaCommesseResult;
      // La RPC risponde per l'azienda della sessione sul server. Se nel frattempo
      // l'azienda scelta è cambiata (super admin, più aziende), i numeri sarebbero
      // di un'altra azienda salvati sotto questa: meglio un errore e un nuovo tentativo.
      if (result?.meta?.company_id && result.meta.company_id !== companyId)
        throw new Error("I dati sono arrivati per un'altra azienda: riprova tra un attimo.");
      const righe = result.righe ?? [];
      const ids = righe.map((r) => r.id);

      const labById = new Map<string, { costo: number; ore: number }>();
      const avanzamento = new Map<string, number>();
      const pesoLetto = await db.from("company_fasi_settings").select("peso_media").eq("company_id", companyId!).maybeSingle();
      if (pesoLetto.error) throw pesoLetto.error;
      const peso = pesoMediaValido(pesoLetto.data?.peso_media);
      // A blocchi di id e a pagine di righe: PostgREST taglia a mille righe
      // anche dentro un blocco (2.184 righe di manodopera su Demo 2).
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const [vista, ore, fasi] = await Promise.all([
          allPaymentRows<{ id: string; costo_manodopera: number | string | null }>((from, to) =>
            db.from("v_ordine_marginalita").select("id,costo_manodopera").in("id", chunk).order("id").range(from, to)),
          allPaymentRows<{ id: string; order_id: string; hours_worked: number | string | null }>((from, to) =>
            db.from("order_employees").select("id,order_id,hours_worked").in("order_id", chunk).order("id").range(from, to)),
          peso === "uguale"
            ? allPaymentRows<FaseAvanzamento & { id: string }>((from, to) =>
                db.from("order_work_phases").select("id,order_id,status,percentuale").in("order_id", chunk).order("id").range(from, to))
            : Promise.resolve([] as (FaseAvanzamento & { id: string })[]),
        ]);
        for (const v of vista) labById.set(v.id, { costo: Number(v.costo_manodopera ?? 0), ore: 0 });
        for (const e of ore) {
          const cur = labById.get(e.order_id) ?? { costo: 0, ore: 0 };
          cur.ore += Number(e.hours_worked ?? 0);
          labById.set(e.order_id, cur);
        }
        for (const [orderId, pct] of avanzamentoMedioFasi(fasi)) avanzamento.set(orderId, pct);
      }
      const conAvanzamento: MarginalitaCommesseResult = {
        ...result,
        righe: righe.map((r) => (avanzamento.has(r.id) ? { ...r, pct_avanzamento: avanzamento.get(r.id)! } : r)),
      };
      return normalizeMarginalitaCommesse(conAvanzamento, labById);
    },
    staleTime: 60_000,
  });
}
