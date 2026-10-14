import type { OrderStatus } from "@/lib/orderUtils";

export type WorkflowMeaning = "acquired" | "preparation" | "scheduled" | "execution" | "verification" | "delivered";
export interface WorkflowStep { name: string; meaning: WorkflowMeaning; icon: string; color: string }
export interface OrderWorkflowModel { key: string; label: string; hint: string; statuses: WorkflowStep[] }
const icons: Record<WorkflowMeaning, string> = { acquired: "FileSignature", preparation: "ClipboardCheck", scheduled: "CalendarClock", execution: "HardHat", verification: "ShieldCheck", delivered: "CheckCircle2" };
const colors: Record<WorkflowMeaning, string> = { acquired: "#2563EB", preparation: "#D97706", scheduled: "#7C3AED", execution: "#DB2777", verification: "#0891B2", delivered: "#16A34A" };
const steps = (values: [string, WorkflowMeaning][]): WorkflowStep[] => values.map(([name, meaning]) => ({name, meaning, icon: icons[meaning], color: colors[meaning]}));
const common: [string, WorkflowMeaning][] = [["Commessa Acquisita", "acquired"], ["Preparazione Cantiere", "preparation"], ["Lavori Programmati", "scheduled"], ["Lavori in Corso", "execution"], ["Verifiche Finali", "verification"], ["Consegnata", "delivered"]];

/** Operational templates, not CRM stages, payments, SALs or support tickets. */
export const ORDER_WORKFLOW_MODELS: OrderWorkflowModel[] = [
  {key: "ristrutturazione", label: "Ristrutturazioni", hint: "L'avanzamento dei singoli lavori resta nelle lavorazioni del cantiere.", statuses: steps(common)},
  {key: "bagno", label: "Ristrutturazione bagno", hint: "Un percorso breve, dalle preparazioni alla consegna.", statuses: steps([["Commessa Acquisita", "acquired"], ["Preparazione Intervento", "preparation"], ["Intervento Programmato", "scheduled"], ["Lavori in Corso", "execution"], ["Verifica Finale", "verification"], ["Consegnata", "delivered"]])},
  {key: "serramenti", label: "Serramenti / Infissi", hint: "Rilievo definitivo, ordine o produzione, posa e consegna.", statuses: steps([["Commessa Acquisita", "acquired"], ["Rilievo Definitivo", "preparation"], ["Ordine / Produzione", "preparation"], ["Pronta per la Posa", "preparation"], ["Posa Programmata", "scheduled"], ["Posa in Corso", "execution"], ["Posa Eseguita", "verification"], ["Consegnata", "delivered"]])},
  {key: "fotovoltaico", label: "Fotovoltaico", hint: "Installato non significa attivato: pratiche e pagamenti restano distinti.", statuses: steps([["Commessa Acquisita", "acquired"], ["Preparazione Tecnica", "preparation"], ["Installazione Programmata", "scheduled"], ["Installazione in Corso", "execution"], ["Installata, da Attivare", "verification"], ["Attiva e Consegnata", "delivered"]])},
  {key: "tetti", label: "Tetti / Facciate / Cappotti", hint: "Preparazione del cantiere, esecuzione e verifica finale.", statuses: steps(common)},
  {key: "impianti", label: "Impianti", hint: "Impianti, clima e caldaie: verifica e documentazione prima della consegna.", statuses: steps([["Commessa Acquisita", "acquired"], ["Preparazione Intervento", "preparation"], ["Intervento Programmato", "scheduled"], ["Installazione in Corso", "execution"], ["Verifica e Documentazione", "verification"], ["Consegnata", "delivered"]])},
  {key: "tende_vetrate", label: "Tende / Pergole / Vetrate", hint: "Rilievo, fornitura, montaggio e consegna.", statuses: steps([["Commessa Acquisita", "acquired"], ["Rilievo Definitivo", "preparation"], ["Ordine / Produzione", "preparation"], ["Montaggio Programmato", "scheduled"], ["Montaggio in Corso", "execution"], ["Montaggio Eseguito", "verification"], ["Consegnata", "delivered"]])},
  {key: "generico", label: "Lavoro generico", hint: "Per lavori misti: scegli il percorso della commessa, non quello dell'intera azienda.", statuses: steps([["Commessa Acquisita", "acquired"], ["Da Organizzare", "preparation"], ["Lavori Programmati", "scheduled"], ["Lavori in Corso", "execution"], ["Da Verificare", "verification"], ["Consegnata", "delivered"]])},
];
export const workflowName = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase("it");
export function orderWorkflowModel(key: string | null | undefined) { return ORDER_WORKFLOW_MODELS.find(model => model.key === key); }

/** Never remove, rename, reorder or restyle existing IDs: workflows reference them. */
export function addWorkflowStatuses(existing: OrderStatus[], model: OrderWorkflowModel, newId: () => string): OrderStatus[] {
  const names = new Set(existing.map(s => workflowName(s.name)));
  const out = existing.map(s => ({...s}));
  for (const step of model.statuses) {
    if (names.has(workflowName(step.name))) continue;
    const {name, icon, color} = step;
    out.push({id: newId(), name, icon, color, position: out.length});
    names.add(workflowName(name));
  }
  // The current backend requires a support status; it is not an operational step.
  if (!out.some(s => s.is_support_phase || workflowName(s.name) === "assistenza")) out.push({id: newId(), name: "Assistenza", icon: "Wrench", color: "#64748B", position: out.length, is_support_phase: true});
  return out;
}

/** Only exact standard-label matches are mapped. Unknown/custom states remain available. */
export function resolveWorkflowStatuses(statuses: OrderStatus[], key: string | null | undefined) {
  const model = orderWorkflowModel(key);
  if (!model) return {model, complete: false, missing: [] as string[], path: statuses, additional: [] as OrderStatus[]};
  const path: OrderStatus[] = [];
  const missing: string[] = [];
  for (const step of model.statuses) {
    const matches = statuses.filter(s => !s.is_support_phase && workflowName(s.name) === workflowName(step.name));
    if (matches.length !== 1) missing.push(step.name);
    else path.push({...matches[0], position: path.length});
  }
  const pathIds = new Set(path.map(s => s.id));
  return {model, complete: missing.length === 0, missing, path, additional: statuses.filter(s => !pathIds.has(s.id))};
}

export interface WorkflowProgress { total: number; done: number; inCorso: number; avgPct: number | null }
/** A suggestion only. Never infers a signature, payment, activation or delivery. */
export function suggestWorkflowStatus(resolved: ReturnType<typeof resolveWorkflowStatuses>, currentId: string | null, progress?: WorkflowProgress) {
  if (!resolved.complete || !resolved.model || !progress || !Number.isInteger(progress.total) || progress.total < 1 ||
    !Number.isInteger(progress.done) || progress.done < 0 || progress.done > progress.total ||
    !Number.isInteger(progress.inCorso) || progress.inCorso < 0 || progress.inCorso > progress.total ||
    (progress.avgPct !== null && (!Number.isFinite(progress.avgPct) || progress.avgPct < 0 || progress.avgPct > 100))) return null;
  const currentIndex = resolved.path.findIndex(s => s.id === currentId);
  if (currentIndex < 0) return null;
  const meaning = resolved.model.statuses[currentIndex].meaning;
  if (meaning === "verification" || meaning === "delivered") return null;
  const target: WorkflowMeaning | null = progress.done === progress.total ? "verification"
    : (progress.inCorso > 0 || (progress.avgPct ?? 0) > 0) && meaning !== "execution" ? "execution" : null;
  const index = resolved.model.statuses.findIndex(s => s.meaning === target);
  if (index < 0) return null;
  return {status: resolved.path[index], reason: target === "verification" ? "Le lavorazioni risultano completate: verifica il prossimo passaggio." : "Le lavorazioni risultano avviate: verifica lo stato generale."};
}
