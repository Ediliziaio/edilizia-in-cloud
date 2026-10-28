import type { QueryClient } from "@tanstack/react-query";
export const OFFICE_STAGES = [
  ["avvio", "Avvio commessa"],
  ["acquisti", "Acquisti"],
  ["preparazione", "Preparazione cantiere"],
  ["amministrazione", "Amministrazione"],
  ["chiusura", "Chiusura"],
  ["altro", "Da organizzare"],
] as const;
export type OfficeStage = (typeof OFFICE_STAGES)[number][0];
export const officeStage = (value?: string | null): OfficeStage =>
  OFFICE_STAGES.some(([key]) => key === value)
    ? (value as OfficeStage)
    : "altro";
export const officeStatus = (status: string) =>
  ({
    da_fare: "Da fare",
    in_corso: "In corso",
    in_attesa: "In attesa",
    completata: "Completata",
  })[status] ?? status;
export function invalidateOfficeWorkspace(
  qc: QueryClient,
  orderId?: string | null,
) {
  void qc.invalidateQueries({
    queryKey: orderId
      ? ["commessa-fasi-ufficio", orderId]
      : ["commessa-fasi-ufficio"],
  });
  void qc.invalidateQueries({ queryKey: ["tasks"] });
  void qc.invalidateQueries({
    queryKey: orderId ? ["order-next-task", orderId] : ["order-next-task"],
  });
  void qc.invalidateQueries({ queryKey: ["my-task-count"] });
  // The daily workspace includes office deadlines in its batched read model.
  void qc.invalidateQueries({ queryKey: ["ufficio-cantieri-oggi"] });
}
export interface OfficeTaskLike {
  status: string;
  due_date: string | null;
  assigned_to: string | null;
  ufficio_id: string | null;
  office_stage?: string | null;
}
export function officeCounts(rows: OfficeTaskLike[], today: string) {
  const open = rows.filter((r) => r.status !== "completata");
  return {
    total: rows.length,
    done: rows.length - open.length,
    ready: open.filter((r) => r.status !== "in_attesa").length,
    blocked: open.filter((r) => r.status === "in_attesa").length,
    late: open.filter(
      (r) => r.status !== "in_attesa" && r.due_date && r.due_date < today,
    ).length,
    unassigned: open.filter((r) => !r.assigned_to && !r.ufficio_id).length,
  };
}
