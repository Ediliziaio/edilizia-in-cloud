import type { QueryClient } from "@tanstack/react-query";
import { isRapportinoQueryKey } from "./refreshRapportinoQueries";

const ORDER_FIRST = new Set([
  "order_work_phases", "order_work_subphases", "order-phases-progress", "order-avanzamento",
  "order-schedule-health", "order-employees", "order-external-teams", "oes-employees", "oes-external-teams",
  "order-economics-canonical", "order-economics-vehicles", "order-campo-assignments", "order-workforce-presence",
  "order-conteggi-viste", "order-items", "order-items-materials", "order_attachments", "order-documents-summary",
  "order-status-history", "campo-lavoro", "campo-fasi-commessa", "campo-mie-fasi", "campo-ruolo", "campo-squadra",
  "campo-chi-lavora", "campo-articoli-commessa-rapportino", "campo-mezzi-giornata", "commessa-mezzi-lavoro",
  "timeline-stati", "timeline-lavori", "timeline-sal", "timeline-varianti", "timeline-rapportini",
  "linked-purchase-orders",
]);
const COMPANY_SUFFIX = new Set(["order-conteggi-viste", "campo-lavoro", "campo-articoli-commessa-rapportino", "timeline-rapportini", "linked-purchase-orders"]);

/** Only read models. Never applies hours, costs, stock movements or proposed progress. */
export function isCommessaCampoQueryKey(key: readonly unknown[], orderId: string, companyId: string): boolean {
  if (isRapportinoQueryKey(key, orderId, companyId)) return true;
  const prefix = key[0];
  if (typeof prefix !== "string") return false;
  if (["order-labor-economics",
    "order-labor-pending", "order-subcontract-economics", "order-subcontract-statistics"].includes(prefix)) return key[1] === orderId && key[2] === companyId;
  // One employee/month panel, normally unmounted while viewing a commessa.
  if (prefix === "hr-labor-reconciliation") return key[1] === companyId;
  if (ORDER_FIRST.has(prefix)) return key[1] === orderId &&
    (!COMPANY_SUFFIX.has(prefix) || key[2] == null || key[2] === companyId);
  if (prefix === "orders") return ["detail", "diary-header"].includes(String(key[1])) && key[2] === orderId;
  if (prefix === "foto-cantiere") return key[1] === "order" && key[2] === companyId && key[3] === orderId;
  if (prefix === "mezzi") return ["commessa", "commessa-montaggi"].includes(String(key[1])) && key[2] === orderId;
  if (["campo-avanzamento-fasi", "campo-sottofasi"].includes(prefix) && key[1] === companyId)
    return key[3] == null || key[3] === orderId;
  if (["campo-avanzamento-permessi", "campo-avanzamento-cantieri"].includes(prefix))
    return key[1] === companyId && typeof key[3] === "string" && key[3].split(",").includes(orderId);
  if (prefix === "campo-sottofasi") return key[1] === "commessa" && key[2] === orderId;
  if (prefix === "order-messages") return key[1] === companyId && key[2] === orderId;
  return false;
}

export async function refreshCommessaCampoQueries(qc: QueryClient, orderId: string | null | undefined, companyId: string | null | undefined) {
  if (!orderId || !companyId) return;
  await qc.invalidateQueries({ predicate: ({ queryKey }) => isCommessaCampoQueryKey(queryKey, orderId, companyId) });
}

export function isCommessaCampoEvent(row: Record<string, unknown>, orderId: string, companyId: string) {
  return !!orderId && !!companyId && row.order_id === orderId && row.company_id === companyId;
}

export async function refreshCampoAcquistoQueries(qc: QueryClient, orderId: string | null | undefined, companyId: string | null | undefined) {
  if (!companyId) return;
  await qc.invalidateQueries({ predicate: ({ queryKey }) => {
    if (["campo-acquisti-miei", "acquisti-campo-ufficio", "company-costs", "ordine-marginalita", "ufficio-da-approvare"].includes(String(queryKey[0])))
      return queryKey[1] === companyId;
    // Materiali → Bolle e DDT / Fatture dei fornitori: la bolla esce da «Da verificare» subito.
    // L'avviso «Da approvare» in Panoramica conta la bolla appena verificata.
    if (queryKey[0] === "campo-da-approvare-conteggi") return !orderId || queryKey[1] === orderId;
    if (["commessa-bolle-ddt", "commessa-fatture-fornitori"].includes(String(queryKey[0])))
      return queryKey[1] === companyId && (!orderId || queryKey[2] === orderId);
    return !!orderId && isCommessaCampoQueryKey(queryKey, orderId, companyId);
  } });
}
