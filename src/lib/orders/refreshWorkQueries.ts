import type { QueryClient } from "@tanstack/react-query";

/** Read models shared by office and Campo. Prefixes preserve user/company suffixes. */
export function refreshWorkQueries(qc: QueryClient, orderId: string | null | undefined) {
  if (!orderId) return;
  const orderKeys = [
    "order_work_phases", "order-phases-progress", "order-schedule-health",
    "order-employees", "order-external-teams", "oes-employees", "oes-external-teams",
    "order-campo-assignments", "order-workforce-presence", "order-items-materials", "order-campo-rapportini",
    "campo-lavoro", "campo-fasi-commessa", "campo-mie-fasi", "note-cantiere", "campo-ruolo", "campo-squadra",
    "campo-rapportini-ordine", "campo-rapportino-gia-oggi", "campo-lavoro-rapportino-oggi",
    "order_work_subphases", "order-avanzamento", "order-supplier-payments", "esposizione-commessa", "order-material-usage",
  ];
  const sharedKeys = [
    "order-employees-costs", "order-external-teams-costs", "laborStats",
    "campo-lavori-assegnati", "campo-cantieri-sub", "campo-e-capocantiere",
    "campo-cantiere-unico", "campo-ai-lavori-oggi", "campo-avanzamento-fasi",
    "campo-rapportini-sospesi", "campo-assignments", "campo-lavori-full", "campo-rapportini-da-compilare", "campo-labor-review",
    "campo-sottofasi",
  ];
  for (const key of orderKeys) void qc.invalidateQueries({ queryKey: [key, orderId] });
  for (const key of sharedKeys) void qc.invalidateQueries({ queryKey: [key] });
}
