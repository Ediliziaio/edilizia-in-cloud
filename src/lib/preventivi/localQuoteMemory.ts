import { createStore, getMany, promisifyRequest, type UseStore } from "idb-keyval";
import { readQuoteDraft, type QuoteDraft } from './quoteDraft';
import { bagniFlowModel, readLocalBagniDraft, type LocalBagniDraft, type QuoteAiFlow } from './quoteBagniBridge';
import { readQuoteProject, type QuoteProject } from './quoteProject';
import { readQuotePriceProvenance } from './quoteProposalReview';
import { readQuoteChatProposal, readQuoteChatResult, readQuoteChatTurn, type QuoteChatMessage, type QuoteChatTurn, type QuoteChatReference } from "../../../supabase/functions/_shared/quoteConversation";
import { readPlanReading, PLAN_MAX_BYTES, type PlanAttachment, type PlanRectangle, type PlanRoom } from "./planReading";
import type { ChatDocument, ChatLine } from "./quoteChatDocument";
import { readQuoteScopeFacts, type QuoteScopeFact } from "../../../supabase/functions/_shared/quoteScopeMemory";
import { readQuoteChatChoices, type QuoteChatChoice } from "../../../supabase/functions/_shared/quoteChoices";
import { readQuoteRoomDecisions, type QuoteRoomDecision } from "../../../supabase/functions/_shared/quoteRoomMemory";
import { quoteSimulationScenario, type QuoteSimulationId } from "./quoteSimulationScenarios";
import { readQuantityCalculation, readIndicativeEstimate, readFormulaProposal } from './quoteCalculations';
import { readPreliminaryQuoteBudget, QUOTE_ADVANCED_MODELS, type PreliminaryQuoteBudget, type QuoteAdvancedModel } from '../../../supabase/functions/_shared/quoteAdvanced';
import { readQuoteComponentDecisions, type QuoteComponentDecision } from './quoteComponentMemory';
import { readQuoteDossier, type QuoteDossierPage } from './quoteDossier';
import { readQuoteCadState, type QuoteCadState } from './quoteCad';
export type LocalChatMessage = QuoteChatMessage & { editorSummary?: string; scheduleFollowUp?: boolean; picker?: 'simulations' | 'templates'; preliminaryBudget?: PreliminaryQuoteBudget; budgetRevision?: number; budgetModel?: string; diagnostic?: boolean; questions?: string[]; warnings?: string[]; actions?: string[]; actionRevision?: number; receipt?: string; benchmarkRaw?: QuoteChatTurn[]; sources?: import('./quoteSourcePresentation').QuoteChatSource[]; choices?: QuoteChatChoice[]; choiceRevision?: number; selectedChoiceId?: string; catalogueRefs?: QuoteChatReference[] };
export type SavedQuoteBudget = { preliminaryBudget: PreliminaryQuoteBudget; budgetRevision: number; budgetModel: string };
export type LocalQuoteSnapshot = {
  version: 1; document: ChatDocument; messages: LocalChatMessage[]; input: string; sessionId: string;
  sourceId: string | null; model: string | null; interrupted: boolean;
  templateId?: string | null;
  classicDraft?: QuoteDraft;
  bagniDraft?: LocalBagniDraft;
  project?: QuoteProject;
  pendingEdits?: { revision: number; proposals: import('../../../supabase/functions/_shared/quoteConversation').QuoteChatProposal[] } | null;
  preferredModel?: QuoteAdvancedModel;
  budgetFollowUp?: boolean;
  savedBudget?: SavedQuoteBudget | null;
  brief?: string;
  scopeFacts?: QuoteScopeFact[];
  roomDecisions?: QuoteRoomDecision[];
  componentDecisions?: QuoteComponentDecision[];
  dossier?: QuoteDossierPage[];
  cad?: QuoteCadState | null;
  plan: PlanAttachment | null; rooms: PlanRoom[]; selectedRoom: string | null; rectangle: PlanRectangle | null;
};
export type LocalDraftScope = { ownerId: string; companyId: string; mode: "plan" | "real"; scenarioId?: QuoteSimulationId; flow?: QuoteAiFlow; localTrialId?: string };
type RecordValue = { version: 1; counter: number; snapshot: LocalQuoteSnapshot };
export type QuoteLocalVersion = { id: string; label: string; createdAt: string; snapshot: LocalQuoteSnapshot; blob: Blob | null };
const UUID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
export class LocalDraftConflict extends Error { constructor() { super("Un’altra scheda ha salvato una versione più recente. Ricarica la bozza salvata prima di continuare."); } }
const obj = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Memoria locale non leggibile: non viene sovrascritta."); return v as Record<string, unknown>; };
const str = (v: unknown, max: number): string => { if (typeof v !== "string" || v.length > max) throw new Error("Testo della memoria locale non valido."); return v; };
const uuid = (v: unknown): string => { const s = str(v, 36); if (!UUID.test(s)) throw new Error("Identità della memoria non valida."); return s; };
const bounded = (v: unknown, max: number): unknown[] => { if (!Array.isArray(v) || v.length > max) throw new Error("Memoria oltre i limiti consentiti."); return v; };
const value = (v: unknown) => { if (v === null) return null; if (typeof v !== "number" || !Number.isFinite(v) || v < .01 || v > 1e6) throw new Error("Importo o quantità salvata non validi."); return v; };
function readSavedBudget(v: unknown): SavedQuoteBudget {
  const b = obj(v);
  if (!Number.isSafeInteger(b.budgetRevision) || Number(b.budgetRevision) < 0) throw new Error('Revisione budget non valida.');
  return { preliminaryBudget: readPreliminaryQuoteBudget(b.preliminaryBudget), budgetRevision: Number(b.budgetRevision), budgetModel: str(b.budgetModel, 160) };
}
function line(raw: unknown, selectedSource?: unknown): ChatLine {
  const r = obj(raw); const title = str(r.title, 200);
  const base = readQuoteChatProposal({ ...r, title: title || "_draft_", description: str(r.description, 6000).slice(0, 3000) });
  const original = readQuoteChatProposal(r.original);
  let reference: ChatLine["reference"] = null;
  if (r.reference != null) reference = readQuoteChatResult({ version: 1, turnId: "d2000000-0000-4000-a000-000000000002", revision: 0,
    turn: { version: 1, message: "Snapshot", title: "", questions: [], warnings: [], searches: [], proposals: [] }, references: [r.reference], model: "locale", simulated: true }).references[0];
  if (typeof r.manual !== "boolean" || typeof r.included !== "boolean" || original.id !== base.id || reference && reference.id !== base.referenceId) throw new Error("Stato della voce salvata non valido.");
  const supersededBy = r.supersededBy == null ? undefined : bounded(r.supersededBy, 100).map(v => str(v, 80));
  if (supersededBy && (!supersededBy.length || supersededBy.includes(base.id) || supersededBy.some(id => !/^[a-z\d_-]+$/i.test(id)) || new Set(supersededBy).size !== supersededBy.length || r.included)) throw new Error("Sostituzione salvata non valida.");
  const calculation = r.calculation == null ? undefined : readQuantityCalculation(r.calculation);
  const proposedCalculation = r.proposedCalculation == null ? undefined : readFormulaProposal(r.proposedCalculation);
  if (proposedCalculation && proposedCalculation.unit !== base.unit) throw new Error('Unità della formula proposta non coerente.');
  // Upgrade the initial local estimate snapshot: that version had edition in
  // the draft/source label but no dedicated sourceId on the estimate itself.
  const legacyEstimate = r.estimate == null ? undefined : obj(r.estimate);
  const estimate = legacyEstimate == null ? undefined : readIndicativeEstimate({ ...legacyEstimate, ...(legacyEstimate.origin === 'catalogue' && legacyEstimate.sourceId == null ? { sourceId: selectedSource } : {}) });
  const pricing = r.pricing == null ? undefined : readQuotePriceProvenance(r.pricing);
  if (calculation && (calculation.result !== r.quantity || calculation.unit !== base.unit || !r.manual) || estimate && (estimate.unit !== base.unit || r.price != null || r.included || !r.manual)) throw new Error('Calcolo o stima della memoria non coerenti con la voce.');
  return { ...base, title, description: str(r.description, 6000), quantity: value(r.quantity), price: value(r.price), included: r.included, manual: r.manual, reference, original, ...(pricing ? { pricing } : {}), ...(supersededBy ? { supersededBy } : {}), ...(calculation ? { calculation } : {}), ...(estimate ? { estimate } : {}), ...(proposedCalculation ? { proposedCalculation } : {}) };
}
export function readLocalQuoteSnapshot(raw: unknown): LocalQuoteSnapshot {
  const r = obj(raw); const d = obj(r.document);
  if (r.version !== 1 || !Number.isSafeInteger(d.revision) || Number(d.revision) < 0 || typeof r.interrupted !== "boolean") throw new Error("Versione memoria non supportata.");
  const classicDraft = r.classicDraft == null ? undefined : readQuoteDraft(JSON.stringify(r.classicDraft));
  const bagniDraft = r.bagniDraft == null ? undefined : readLocalBagniDraft(r.bagniDraft);
  const lines = bounded(d.lines, 100).map(v => line(v, r.sourceId));
  if (new Set(lines.map(l => l.id)).size !== lines.length) throw new Error("Voci duplicate nella memoria.");
  if (lines.some(l => l.supersededBy?.some(id => !lines.some(n => n.id === id && !n.supersededBy?.length)))) throw new Error("Dettagli di sostituzione mancanti o ciclici.");
  const messages = bounded(r.messages, 50).map(raw => {
    const m = obj(raw); if (m.role !== "user" && m.role !== "assistant") throw new Error("Messaggio salvato non valido.");
    const message: LocalChatMessage = { role: m.role, text: str(m.text, 6000) };
    if (m.editorSummary != null) { if (m.role !== 'assistant') throw new Error('Riepilogo editor non valido.'); message.editorSummary = str(m.editorSummary, 3000); }
    if (m.scheduleFollowUp != null) { if (m.role !== 'assistant' || typeof m.scheduleFollowUp !== 'boolean') throw new Error('Contesto cronoprogramma non valido.'); message.scheduleFollowUp = m.scheduleFollowUp; }
    if (m.preliminaryBudget != null) {
      if (m.role !== 'assistant' || !Number.isSafeInteger(m.budgetRevision) || Number(m.budgetRevision) < 0) throw new Error('Provenienza budget locale non valida.');
      message.preliminaryBudget = readPreliminaryQuoteBudget(m.preliminaryBudget); message.budgetRevision = Number(m.budgetRevision); message.budgetModel = str(m.budgetModel, 160);
    }
    if (m.catalogueRefs != null) {
      if (m.role !== 'assistant') throw new Error('Riferimenti catalogo ammessi solo nelle risposte.');
      message.catalogueRefs = readQuoteChatResult({ version: 1, turnId: 'd2000000-0000-4000-a000-000000000002', revision: 0, turn: { version: 1, title: '', message: 'Catalogo', questions: [], proposals: [], searches: [], warnings: [] }, references: bounded(m.catalogueRefs, 6), model: 'catalogue', simulated: true }).references;
    }
    if (m.diagnostic != null) { if (typeof m.diagnostic !== "boolean") throw new Error("Tipo messaggio salvato non valido."); message.diagnostic = m.diagnostic; }
    if (m.picker != null) {
      if (m.role !== 'assistant' || m.diagnostic !== true || !['simulations', 'templates'].includes(String(m.picker))) throw new Error('Selettore della chat non valido.');
      message.picker = m.picker as LocalChatMessage['picker'];
    }
    if (m.receipt != null) { if (m.role !== "assistant") throw new Error("Riscontro azioni non valido."); message.receipt = str(m.receipt, 2400); }
    if (m.benchmarkRaw != null) { if (m.role !== "assistant") throw new Error("Confronto salvato non valido."); message.benchmarkRaw = bounded(m.benchmarkRaw, 2).map(readQuoteChatTurn); }
    if (m.actionRevision != null) { if (m.role !== "assistant" || !Number.isSafeInteger(m.actionRevision) || Number(m.actionRevision) < 0) throw new Error("Revisione azioni non valida."); message.actionRevision = Number(m.actionRevision); }
    for (const name of ["questions", "warnings", "actions"] as const) if (m[name] != null) message[name] = bounded(m[name], 100).map(v => str(v, 1000));
    if (m.sources != null) message.sources = bounded(m.sources, 60).map(v => {
      const s = obj(v);
      if (s.year != null && (!Number.isInteger(s.year) || Number(s.year) < 1900 || Number(s.year) > 2200)) throw new Error('Anno del prezzario non valido.');
      return { id: uuid(s.id), label: str(s.label, 1000), ...(s.region == null ? {} : { region: str(s.region, 200) }), ...(s.year == null ? {} : { year: Number(s.year) }), ...(s.name == null ? {} : { name: str(s.name, 1000) }), ...(s.version == null ? {} : { version: str(s.version, 200) }) };
    });
    if (m.choices != null) {
      if (m.role !== "assistant") throw new Error("Alternative ammesse solo per l’assistente.");
      message.choices = readQuoteChatChoices(m.choices);
      if (!Number.isSafeInteger(m.choiceRevision) || Number(m.choiceRevision) < 0) throw new Error("Revisione alternative non valida.");
      message.choiceRevision = Number(m.choiceRevision);
      if (m.selectedChoiceId != null) {
        message.selectedChoiceId = str(m.selectedChoiceId, 40);
        if (!message.choices.some(c => c.id === message.selectedChoiceId)) throw new Error("Scelta salvata non presente.");
      }
    }
    return message;
  });
  let plan: PlanAttachment | null = null;
  if (r.plan != null) {
    const p = obj(r.plan); const id = str(p.id, 64);
    if (!/^[a-f\d]{64}$/.test(id) || !Number.isSafeInteger(p.size) || Number(p.size) < 1 || Number(p.size) > PLAN_MAX_BYTES || !["image/jpeg", "image/png", "application/pdf"].includes(String(p.mime))) throw new Error("Allegato salvato non valido.");
    if (p.localFileMissing !== undefined && p.localFileMissing !== true) throw new Error('Disponibilità allegato non valida.');
    plan = { id, name: str(p.name, 180), size: Number(p.size), mime: String(p.mime), reading: p.reading == null ? null : readPlanReading(p.reading), ...(p.localFileMissing ? { localFileMissing: true as const } : {}) };
  }
  const rooms = bounded(r.rooms, 100).map(v => { const room = obj(v); const id = str(room.id, 100); const n = Number(room.line);
    if (!/^[a-z\d_-]+$/i.test(id) || !Number.isInteger(n) || n < -1 || n > 499) throw new Error("Ambiente salvato non valido.");
    return { id, label: str(room.label, 100), line: n, ...(room.manual === true ? { manual: true } : {}) };
  });
  const selectedRoom = r.selectedRoom == null ? null : str(r.selectedRoom, 100);
  if (selectedRoom && !rooms.some(room => room.id === selectedRoom)) throw new Error("Ambiente selezionato non valido.");
  let rectangle: PlanRectangle | null = null;
  if (r.rectangle != null) {
    const f = obj(r.rectangle); const a = Number(f.a); const b = Number(f.b);
    if (!plan?.reading || f.roomId !== selectedRoom || !Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0 || a > 100 || b > 100 || f.page !== plan.reading.page) throw new Error("Misure salvate non valide.");
    rectangle = { roomId: String(f.roomId), a, b, area: Math.round((a * b + Number.EPSILON) * 100) / 100, perimeter: Math.round(2 * (a + b) * 100) / 100, page: Number(f.page), basis: str(f.basis, 600) };
  }
  const result: LocalQuoteSnapshot = { version: 1, document: { title: str(d.title, 200), revision: Number(d.revision), lines }, messages,
    ...(r.cad === undefined ? {} : { cad: r.cad === null ? null : readQuoteCadState(r.cad) }),
    ...(r.dossier == null ? {} : { dossier: readQuoteDossier(r.dossier) }),
    ...(r.componentDecisions == null ? {} : { componentDecisions: readQuoteComponentDecisions(r.componentDecisions) }),
    ...(classicDraft ? { classicDraft } : {}),
    ...(bagniDraft ? { bagniDraft } : {}),
    ...(r.project == null ? {} : { project: readQuoteProject(r.project) }),
    ...(r.pendingEdits === undefined ? {} : { pendingEdits: r.pendingEdits == null ? null : (() => { const p = obj(r.pendingEdits); if (!Number.isSafeInteger(p.revision) || Number(p.revision) < 0) throw new Error('Revisione modifiche proposta non valida.'); return { revision: Number(p.revision), proposals: bounded(p.proposals, 30).map(readQuoteChatProposal) }; })() }),
    ...(r.savedBudget === undefined ? {} : { savedBudget: r.savedBudget === null ? null : readSavedBudget(r.savedBudget) }),
    ...(r.budgetFollowUp === undefined ? {} : { budgetFollowUp: typeof r.budgetFollowUp === 'boolean' ? r.budgetFollowUp : (() => { throw new Error('Modalità budget non valida.'); })() }),
    ...(r.preferredModel == null ? {} : { preferredModel: QUOTE_ADVANCED_MODELS.includes(r.preferredModel as QuoteAdvancedModel) ? r.preferredModel as QuoteAdvancedModel : (() => { throw new Error('Modello locale non valido.'); })() }),
    ...(r.templateId === undefined ? {} : { templateId: r.templateId === null ? null : uuid(r.templateId) }),
    input: str(r.input, 3000), sessionId: uuid(r.sessionId), sourceId: r.sourceId == null ? null : uuid(r.sourceId), model: r.model == null ? null : str(r.model, 160), interrupted: r.interrupted,
    plan, rooms, selectedRoom, rectangle, ...(r.brief == null ? {} : { brief: str(r.brief, 3000) }), ...(r.scopeFacts == null ? {} : { scopeFacts: readQuoteScopeFacts(r.scopeFacts) }), ...(r.roomDecisions == null ? {} : { roomDecisions: readQuoteRoomDecisions(r.roomDecisions) }) };
  if (JSON.stringify(result).length > 600_000) throw new Error("Bozza locale troppo grande.");
  return result;
}
let defaultStore: UseStore | undefined;
export function localDraftKey(scope: LocalDraftScope) {
  uuid(scope.ownerId);
  if (scope.companyId !== "d2000000-0000-4000-a000-000000000002" || !["plan", "real"].includes(scope.mode)) throw new Error("Memoria riservata alla prova Demo Azienda 2.");
  if (scope.scenarioId != null && !quoteSimulationScenario(scope.scenarioId)) throw new Error("Simulazione locale non valida.");
  if (scope.flow != null && (scope.flow !== 'classico' && !bagniFlowModel(scope.flow) || scope.scenarioId)) throw new Error('Flusso AI locale non valido.');
  if (scope.localTrialId != null) uuid(scope.localTrialId);
  return `quote-local:v1:${scope.ownerId}:${scope.companyId}:${scope.mode}${scope.flow ? `:flow:${scope.flow}` : scope.scenarioId ? `:scenario:${scope.scenarioId}` : ""}${scope.localTrialId ? `:trial:${scope.localTrialId}` : ''}`;
}
/** Browser-only IndexedDB. One atomic snapshot + optional attachment, scoped to account. */
export function createLocalQuoteMemory(store: UseStore = defaultStore ??= createStore("eic-quote-lab-v1", "drafts")) {
  return {
    async versions(scope: LocalDraftScope): Promise<QuoteLocalVersion[]> {
      const [raw] = await getMany<unknown>([`${localDraftKey(scope)}:versions`], store);
      if (raw == null) return [];
      return bounded(raw, 5).map(v => {
        const version = obj(v); const snapshot = readLocalQuoteSnapshot(version.snapshot);
        if (snapshot.bagniDraft && snapshot.bagniDraft.modelId !== bagniFlowModel(scope.flow)) throw new Error('Versione di un altro modello.');
        const blob = version.blob as Blob | null;
        if (snapshot.plan && !snapshot.plan.localFileMissing && (!(blob instanceof Blob) || blob.size !== snapshot.plan.size)) throw new Error('Allegato versione mancante.');
        return { id: uuid(version.id), label: str(version.label, 100), createdAt: str(version.createdAt, 40), snapshot, blob };
      });
    },
    async checkpoint(scope: LocalDraftScope, label: string, raw: LocalQuoteSnapshot, blob: Blob | null, expected: number) {
      const key = localDraftKey(scope), snapshot = readLocalQuoteSnapshot(raw);
      if (!label.trim() || label.length > 100 || snapshot.bagniDraft && snapshot.bagniDraft.modelId !== bagniFlowModel(scope.flow)) throw new Error('Nome versione o modello non valido.');
      if (snapshot.plan && !snapshot.plan.localFileMissing && (!(blob instanceof Blob) || blob.size !== snapshot.plan.size)) throw new Error('Allegato versione non disponibile.');
      const version: QuoteLocalVersion = { id: crypto.randomUUID(), label: label.trim(), createdAt: new Date().toISOString(), snapshot, blob: snapshot.plan ? blob : null };
      return store('readwrite', s => new Promise<QuoteLocalVersion>((resolve, reject) => {
        const record = s.get(key); record.onerror = () => reject(record.error);
        record.onsuccess = () => {
          if ((record.result?.counter ?? 0) !== expected) { s.transaction.abort(); reject(new LocalDraftConflict()); return; }
          const request = s.get(`${key}:versions`); request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            try { const previous = request.result == null ? [] : bounded(request.result, 5); if (previous.length >= 5) throw new Error('Limite di cinque versioni locali raggiunto. Nessuna versione cancellata; la bozza corrente resta salvata.'); s.put([...previous, version], `${key}:versions`); promisifyRequest(s.transaction).then(() => resolve(version), reject); }
            catch (error) { s.transaction.abort(); reject(error); }
          };
        };
      }));
    },
    async load(scope: LocalDraftScope) {
      const key = localDraftKey(scope); const [raw, storedAsset] = await getMany<unknown>([key, `${key}:asset`], store);
      if (raw === undefined) return { counter: 0, snapshot: null, blob: null };
      const record = obj(raw);
      if (record.version !== 1 || !Number.isSafeInteger(record.counter) || Number(record.counter) < 1) throw new Error("Versione memoria sconosciuta: non sovrascritta.");
      const snapshot = readLocalQuoteSnapshot(record.snapshot);
      if (snapshot.bagniDraft && snapshot.bagniDraft.modelId !== bagniFlowModel(scope.flow)) throw new Error('Modello Bagni della memoria non coerente con il percorso.');
      const asset = snapshot.plan ? storedAsset as { id: string; blob: Blob } | undefined : null;
      if (snapshot.plan && !snapshot.plan.localFileMissing && (!asset || asset.id !== snapshot.plan.id || !(asset.blob instanceof Blob) || asset.blob.size !== snapshot.plan.size)) throw new Error("Allegato locale mancante o non coerente. La memoria non viene sovrascritta.");
      return { counter: Number(record.counter), snapshot, blob: snapshot.plan?.localFileMissing ? null : asset?.blob ?? null };
    },
    async save(scope: LocalDraftScope, raw: LocalQuoteSnapshot, expected: number, blob?: Blob | null) {
      const key = localDraftKey(scope); const snapshot = readLocalQuoteSnapshot(raw);
      if (snapshot.bagniDraft && snapshot.bagniDraft.modelId !== bagniFlowModel(scope.flow)) throw new Error('Modello Bagni non coerente con il percorso.');
      return store("readwrite", s => new Promise<number>((resolve, reject) => {
        const read = s.get(key);
        read.onerror = () => reject(read.error);
        read.onsuccess = () => {
          try {
            const old = read.result as RecordValue | undefined;
            if ((old?.counter ?? 0) !== expected) throw new LocalDraftConflict();
            const counter = expected + 1;
            if (snapshot.plan && blob) {
              if (blob.size !== snapshot.plan.size || blob.size > PLAN_MAX_BYTES) throw new Error("Allegato non coerente.");
              s.put({ id: snapshot.plan.id, blob }, `${key}:asset`);
            } else if (snapshot.plan && !snapshot.plan.localFileMissing && (old?.snapshot.plan?.id !== snapshot.plan.id || old.snapshot.plan.localFileMissing)) throw new Error("Allegato non disponibile per il salvataggio.");
            if (snapshot.plan?.localFileMissing) s.delete(`${key}:asset`);
            if (!snapshot.plan) s.delete(`${key}:asset`);
            s.put({ version: 1, counter, snapshot } satisfies RecordValue, key);
            promisifyRequest(s.transaction).then(() => resolve(counter), reject);
          } catch (e) { s.transaction.abort(); reject(e); }
        };
      }));
    },
  };
}
