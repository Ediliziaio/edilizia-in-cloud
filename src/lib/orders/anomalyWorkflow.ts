export type AnomalyStatus = "aperta" | "in_verifica" | "assegnata" | "risolta" | "non_imputabile";
export type AnomalyPriority = "high" | "medium" | "low";
export interface AnomalyWorkflowRecord {
  id: string; order_id: string; description: string | null; amount: number | null;
  review_status?: AnomalyStatus | null; corrective_action?: string | null; corrective_due_date?: string | null;
  confirmed_responsibility_kind?: string | null; confirmed_responsibility_id?: string | null; confirmed_responsibility_name?: string | null;
  updated_at?: string | null; error_date: string; error_type: string | null; error_category: string | null;
  orders?: { order_code: string | null; description: string | null } | null;
}
// Human-readable workflow notes use the existing structured description convention.
// Preserve the original description and original estimate when settling the actual loss.
const prefix = "[Gestione] ";
const labels = ["Priorità", "Stima iniziale", "Costo finale", "Recuperi", "Esito", "Aggiornamento"];
const isNote = (line: string) => labels.some(label => line.startsWith(`${prefix}${label}: `));
export function anomalyNotes(record: Pick<AnomalyWorkflowRecord, "description" | "amount">) {
  const lines = (record.description ?? "").split("\n");
  const field = (label: string) => lines.filter(line => line.startsWith(`${prefix}${label}: `)).slice(-1)[0]?.slice(`${prefix}${label}: `.length);
  const money = (text?: string) => text == null || text === "" || !Number.isFinite(Number(text)) ? null : Number(text);
  const p = field("Priorità");
  const priority: AnomalyPriority | null = p === "high" || p === "medium" || p === "low" ? p : null;
  return { body: lines.filter(line => !isNote(line)).join("\n").trim(), priority,
    estimate: money(field("Stima iniziale")) ?? Number(record.amount ?? 0), finalCost: money(field("Costo finale")), recovered: money(field("Recuperi")) ?? 0,
    resolution: field("Esito") ?? "", history: lines.filter(line => line.startsWith(`${prefix}Aggiornamento: `)).map(line => line.slice(`${prefix}Aggiornamento: `.length)) };
}
export function anomalyPriority(record: Pick<AnomalyWorkflowRecord, "description" | "amount">): AnomalyPriority {
  return anomalyNotes(record).priority ?? (Number(record.amount) >= 1000 ? "high" : Number(record.amount) >= 300 ? "medium" : "low");
}
export function anomalyClosed(status?: string | null) { return status === "risolta" || status === "non_imputabile"; }
export interface AnomalyDraft {
  description: string; orderId: string; date: string; type: string; category: string; estimate: string;
  status: AnomalyStatus; priority: AnomalyPriority; actorKind: string; actorId: string; actorName: string;
  action: string; dueDate: string; finalCost: string; recovered: string; resolution: string;
}
const singleLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
export function anomalyPatch(record: AnomalyWorkflowRecord | null, draft: AnomalyDraft, userId: string, now: string, authorName = "Utente") {
  if (!draft.orderId || !draft.date || !draft.description.trim()) throw new Error("Indica commessa, data e descrizione.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || Number.isNaN(Date.parse(draft.date))) throw new Error("La data non è valida.");
  if (draft.dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate) || Number.isNaN(Date.parse(draft.dueDate)))) throw new Error("La scadenza non è valida.");
  const estimate = Number(draft.estimate); const finalCost = draft.finalCost === "" ? null : Number(draft.finalCost); const recovered = Number(draft.recovered || 0);
  if (draft.estimate.trim() === "" || !Number.isFinite(estimate) || estimate < 0 || (finalCost != null && (!Number.isFinite(finalCost) || finalCost < 0)) || !Number.isFinite(recovered) || recovered < 0) throw new Error("Inserisci importi validi, maggiori o uguali a zero.");
  if (recovered > (finalCost ?? 0)) throw new Error("I recuperi non possono superare il costo finale.");
  if (draft.status === "assegnata" && (!draft.actorName.trim() || !draft.action.trim())) throw new Error("Indica responsabile effettivo e azione correttiva prima di assegnare.");
  if (draft.status === "risolta" && (!draft.resolution.trim() || finalCost == null)) throw new Error("Per chiudere indica cosa è stato fatto e il costo finale, anche zero.");
  if (draft.status === "non_imputabile" && !draft.resolution.trim()) throw new Error("Indica la motivazione della non imputabilità.");
  const old = record ? anomalyNotes(record) : null;
  const amount = finalCost == null ? estimate : Math.round((finalCost - recovered) * 100) / 100;
  const body = draft.description.split("\n").filter(line => !isNote(line)).join("\n").trim();
  const history = [...(old?.history ?? []), `${now} · ${singleLine(authorName)} · ${{ aperta: "Aperta", in_verifica: "In verifica", assegnata: "Assegnata", risolta: "Risolta", non_imputabile: "Non imputabile" }[draft.status]} · Responsabile: ${singleLine(draft.actorName) || "Da assegnare"} · Azione: ${singleLine(draft.action) || "Da definire"} · Scadenza: ${draft.dueDate || "Da definire"} · Priorità: ${{ low: "Minore", medium: "Da gestire", high: "Critica" }[draft.priority]} · Stima: ${estimate} · Costo: ${finalCost ?? "stimato"} · Recuperi: ${recovered}`];
  const notes = [`Priorità: ${draft.priority}`, `Stima iniziale: ${estimate}`, ...(finalCost == null ? [] : [`Costo finale: ${finalCost}`]), `Recuperi: ${recovered}`, `Esito: ${singleLine(draft.resolution)}`, ...history.map(entry => `Aggiornamento: ${entry}`)];
  return { description: `${body}\n\n${notes.map(line => prefix + line).join("\n")}`, amount,
    review_status: draft.status, corrective_action: draft.action.trim() || null, corrective_due_date: draft.dueDate || null,
    confirmed_responsibility_kind: draft.actorName.trim() ? draft.actorKind || "internal" : null,
    confirmed_responsibility_id: draft.actorName.trim() ? draft.actorId || null : null,
    confirmed_responsibility_name: draft.actorName.trim() || null,
    updated_at: now, resolved_at: anomalyClosed(draft.status) ? now : null, resolved_by: anomalyClosed(draft.status) ? userId : null };
}
