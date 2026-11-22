import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { withClientTimeout } from "@/lib/query-timeout";
import { BOZZA_PRELIEVO_VUOTA, leggiBozzaPrelievo, salvaBozzaPrelievo, type PrelievoLocale } from "./bozzaPrelievo";
import { quantitaPrelievo } from "./magazzino";
import { SyncPermanentError, SyncDeferredError, type CampoSyncResult } from "./sync-queue";

export interface PrelievoEsito {
  id: string;
  stato: "richiesto" | "consegnato" | "rifiutato";
}

export interface PrelievoInCoda {
  company_id: string;
  user_id: string;
  order_id: string;
  locale: PrelievoLocale;
}

export async function inviaPrelievoInCoda(payload: PrelievoInCoda, operationId: string): Promise<CampoSyncResult> {
  const { locale, company_id, user_id, order_id } = payload;
  if (!locale?.bozza?.righe?.length || locale.bozza.id !== operationId || locale.bozza.orderId !== order_id) {
    throw new SyncPermanentError("Prelievo non leggibile. I materiali restano salvati sul telefono.");
  }
  const { bozza, chiave } = locale;
  const { data, error } = await withClientTimeout(supabase.rpc("campo_magazzino_preleva", {
    p_azienda: company_id,
    p_cantiere: order_id,
    p_magazzino: bozza.righe[0].articolo.warehouse_id,
    p_righe: bozza.righe.map(({ articolo, quantita }) => ({ stock_item_id: articolo.id, quantita: quantitaPrelievo(quantita) })),
    p_note: bozza.note.trim() || null,
    p_richiesta_id: operationId,
  }), "Registrazione prelievo");
  const result = { tipo: "prelievo", companyId: company_id, userId: user_id, orderId: order_id } as const;
  const attuale = leggiBozzaPrelievo(chiave);
  if (error) {
    // Queste risposte arrivano dopo il controllo del primo invio e annullano la scrittura.
    const nonRegistrato = error.code === "22023" || error.code === "P0001"
      || (error.code === "42501" && error.message.startsWith("Scegli un cantiere aperto"));
    if (nonRegistrato && attuale.id === operationId
      && salvaBozzaPrelievo(chiave, attuale, { ...attuale, inVerifica: false }).stato === "salvata") {
      return { ...result, errore: error.message };
    }
    if (error.code === "PGRST301" || error.code === "PGRST303") throw new SyncDeferredError("Sessione da rinnovare.");
    if (nonRegistrato || error.code === "42501") throw new SyncPermanentError(error.message);
    throw new Error(error.message);
  }
  if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.id !== "string"
    || (data.stato !== "richiesto" && data.stato !== "consegnato" && data.stato !== "rifiutato")) {
    throw new Error("Il magazzino non ha confermato l’esito del prelievo.");
  }
  if (attuale.id === operationId) salvaBozzaPrelievo(chiave, attuale, BOZZA_PRELIEVO_VUOTA);
  return { ...result, id: data.id, stato: data.stato };
}

export function aggiornaPrelieviCampo(qc: QueryClient, { companyId, orderId, stato, errore }: CampoSyncResult) {
  void qc.invalidateQueries({ queryKey: ["campo-warehouse-stock", companyId] });
  if (errore) {
    void qc.invalidateQueries({ queryKey: ["campo-cantieri-prelievo", companyId] });
    return;
  }
  void qc.invalidateQueries({ queryKey: ["campo-miei-prelievi", companyId] });
  void qc.invalidateQueries({ queryKey: ["prelievi-campo-attesa", companyId] });
  void qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
  if (stato === "consegnato") {
    void qc.invalidateQueries({ queryKey: queryKeys.warehouse.movementsRegistry(companyId) });
    void qc.invalidateQueries({ queryKey: queryKeys.warehouse.campoMateriali(companyId, orderId) });
    void qc.invalidateQueries({ queryKey: ["order-material-usage", orderId, companyId] });
  }
}
