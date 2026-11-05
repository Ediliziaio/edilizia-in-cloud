import type { QueryClient } from "@tanstack/react-query";
import { refreshRapportinoQueries } from "./refreshRapportinoQueries";

const SUBITO = ["order_work_phases", "order_work_subphases", "order-phases-progress", "order-avanzamento", "orders"];

/** Read models shared by office and Campo. Prefixes preserve user/company suffixes. */
/**
 * Con `leggero` (un cambio a fasi e sottofasi che non tocca voci, costi e rapportini) si ricaricano subito solo
 * fasi, sottofasi e avanzamento; il resto si segna da rileggere quando serve. Su una commessa da 600 voci
 * ricaricare tutto a ogni clic voleva dire secondi di attesa (05/11/2026).
 */
export function refreshWorkQueries(
  qc: QueryClient,
  orderId: string | null | undefined,
  companyId?: string | null,
  opzioni: { leggero?: boolean } = {},
) {
  if (!orderId) return;
  if (opzioni.leggero) {
    for (const key of SUBITO) void qc.invalidateQueries({ queryKey: [key, orderId] });
    void qc.invalidateQueries({ predicate: ({ queryKey }) => queryKey[1] === orderId && !SUBITO.includes(String(queryKey[0])), refetchType: "none" });
    return;
  }
  refreshRapportinoQueries(qc, orderId, companyId);
  void qc.invalidateQueries({
    predicate: ({ queryKey }) =>
      queryKey[0] === "calendar-orders" &&
      (!companyId || queryKey[2] === companyId),
  });
  // Questa chiave ha l'azienda prima della commessa.
  void qc.invalidateQueries({
    predicate: ({ queryKey }) => queryKey[0] === "voci-previste-fasi" && queryKey[2] === orderId,
  });
  const orderKeys = [
    "order_work_phases",
    "order-phases-progress",
    "order-schedule-health",
    "order-employees",
    "order-external-teams",
    "oes-employees",
    "oes-external-teams",
    "order-labor-economics",
    "order-labor-pending",
    "order-subcontract-economics",
    "order-subcontract-statistics",
    "order-campo-assignments",
    "order-workforce-presence",
    "order-items-materials",
    "campo-lavoro",
    "campo-fasi-commessa",
    "campo-mie-fasi",
    "note-cantiere",
    "campo-ruolo",
    "campo-squadra",
    "order_work_subphases",
    "order-avanzamento",
    "order-supplier-payments",
    "esposizione-commessa",
    "order-economics-canonical",
    "order-economics-vehicles",
    "order-conteggi-viste",
    "timeline-stati",
    "timeline-lavori",
    "timeline-sal",
    "timeline-varianti",
    "timeline-rapportini",
    "commessa-mezzi-lavoro",
    "commessa-iva",
    "sal-fasi-commessa",
  ];
  const sharedKeys = [
    "order-employees-costs",
    "order-external-teams-costs",
    // L'elenco commesse legge personale e squadre in una lettura sola (23/10/2026).
    "elenco-commesse-dettagli",
    "laborStats",
    "campo-lavori-assegnati",
    "campo-cantieri-sub",
    "campo-e-capocantiere",
    "campo-cantiere-unico",
    "campo-ai-lavori-oggi",
    "campo-avanzamento-fasi",
    "campo-rapportini-sospesi",
    "campo-assignments",
    "campo-lavori-full",
    "campo-rapportini-da-compilare",
    "campo-labor-review",
    "campo-sottofasi",
    // «Ore e persone» e «Cantieri oggi» della stessa pagina
    "daily-hours",
    "commessa-ore-timbrate",
    "ufficio-cantieri-oggi",
    "ufficio-da-approvare",
    "campo-da-approvare-conteggi",
  ];
  for (const key of orderKeys)
    void qc.invalidateQueries({ queryKey: [key, orderId] });
  for (const key of sharedKeys) void qc.invalidateQueries({ queryKey: [key] });
  void qc.invalidateQueries({ queryKey: ["addetti-qualifiche-commessa"] });
  void qc.invalidateQueries({ queryKey: ["orders", "detail", orderId] });
  void qc.invalidateQueries({ queryKey: ["mezzi", "commessa", orderId] });
}
