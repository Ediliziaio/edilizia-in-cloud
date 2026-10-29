import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { aiEditorDraft, applyAiEditorDraft, applyAiEditorProject } from '@/lib/preventivi/quoteAiEditorBridge';
import { BAGNI_AI_MODELS, bagniFlowModel, type QuoteAiFlow, type LocalBagniDraft } from '@/lib/preventivi/quoteBagniBridge';
import { assessQuoteRequest, asksQuoteCurrentValues, quoteCurrentStateEvidence, quoteCurrentValues, quoteRequestGuidance } from '@/lib/preventivi/quoteRequestContext';
import { quoteBudgetOverlaps } from '@/lib/preventivi/quoteBudgetQuality';
import { emptyQuoteTax, readQuoteTax, quoteTaxItems, quoteTaxTotals, quoteTaxCommand, quoteTaxFromEditor, type QuoteTaxSettings } from '@/lib/preventivi/quoteTax';
import { quoteScheduleIntent, quoteScheduleReply, quoteScheduleEvidence, quoteScheduleScope, quoteScheduleDocumentText, readLocalQuoteSchedule } from '@/lib/preventivi/quoteSchedule';
import { planningChatIntent } from '@/lib/preventivi/quotePlanningChat';
import { margineChatIntent, margineChatReply } from '@/lib/preventivi/margineChat';
import { useQuoteChatScroll } from './useQuoteChatScroll';
const QuotePlanningChat = lazy(() => import('./QuotePlanningChat'));
import { QuoteTaxPanel } from './QuoteTaxPanel';
import { QuoteSchedulePanel } from './QuoteSchedulePanel';
import { quoteDocumentNotes, quoteBudgetNotes } from '@/lib/preventivi/quoteDocumentNotes';
import { QuoteBagniPreview } from './QuoteBagniPreview';
import { QuoteProjectTools } from './QuoteProjectTools';
import { QuoteLocalPdfButton } from './QuoteLocalPdfButton';
import { emptyQuoteProject, readQuoteProject, type QuoteProject, quoteBudgetIntent, applyQuoteRoomQuantities, quoteProjectBrief, quoteBudgetTargetCheck } from '@/lib/preventivi/quoteProject';
import { protectedQuoteEdits, applyProtectedQuoteEdits, indicativeBudgetProposal, quotePriceLabel, quoteHasIndicativePrices } from '@/lib/preventivi/quoteProposalReview';
import { applyBathroomBudgetExample, bathroomBudgetAction, isBathroomBudgetRequest, BATHROOM_BUDGET_REQUEST, BATHROOM_BUDGET_NOTE, BATHROOM_BUDGET_ASSUMPTIONS, BATHROOM_BUDGET_PACKAGES } from '@/lib/preventivi/quoteBathroomBudgetExample';
const BagniQuoteEditor = lazy(() => import('./QuoteBagniEditor'));
import type { QuoteDraft } from '@/lib/preventivi/quoteDraft';
import { wizardAiCommercial } from '@/lib/preventivi/wizardAiCommercial';
const ClassicQuoteEditor = lazy(() => import('@/pages/azienda/marketing/QuoteBuilder'));
import { ThinkingProgress } from "@/components/ui/thinking-prompt-input";
import { QuoteChatComposer, type QuoteComposerAction } from './QuoteChatComposer';
import type { QuoteAudioTranscriber } from './QuoteVoiceDialog';
import { outsideSupportingDocuments } from '@/lib/preventivi/quoteSupportingDocuments';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { QuoteTemplateDocument, workspaceOfferTemplates, type QuoteWorkspaceTemplates } from './QuoteTemplateDocument';
import { QuoteCatalogueMessage } from './QuoteCatalogueMessage';
import { importoRiga } from '@/hooks/usePreventivoCosti';
import { formatCurrency } from "@/lib/formatters";
import { applyChatResult, attachChatReference, canSelectChatSource, chatLineIssue, chatQuoteItems, chatReferenceInfo, emptyChatDocument, patchChatLine, resetChatLine, setChatQuantityFormula, setChatIndicativeEstimate, chatEstimateTotals, type ChatDocument, type QuoteChatTransport } from "@/lib/preventivi/quoteChatDocument";
import { QuoteCalculationTools } from './QuoteCalculationTools';
import { QuoteFormulaSuggestions } from './QuoteFormulaSuggestions';
import { guardQuoteFormulaTurn, QUOTE_FORMULA_REQUEST } from '@/lib/preventivi/quoteCalculations';
import { simulatePlanConversation } from "@/lib/preventivi/devPlanConversation";
import type { QuoteChatRequest } from "../../../../supabase/functions/_shared/quoteConversation";
import QuoteLineEditor from "./QuoteLineEditor";
import { QuoteChatResponse } from "./QuoteChatResponse";
import { QuoteChatChoices } from "./QuoteChatChoices";
import { QuoteTurnDetails } from './QuoteTurnDetails';
import { isQuoteProviderNotice } from '@/lib/preventivi/quoteChatPresentation';
import { QuoteSourcePicker } from './QuoteSourcePicker';
import { QuoteSimulationPicker } from './QuoteSimulationPicker';
import { QuoteTemplatePicker } from './QuoteTemplatePicker';
import { quoteSourcePresentation } from '@/lib/preventivi/quoteSourcePresentation';
import { isQuoteStartingPointRequest, quoteStartingPointDraft, quoteStartingPointUserFacts } from '@/lib/preventivi/quoteStartingPoint';
import { legacyQuoteChoices, type QuoteChatChoice } from "../../../../supabase/functions/_shared/quoteChoices";
import { usePrezzarioFonti } from "@/lib/prezzario/queries";
import { parseQuoteChatCommand } from "@/lib/preventivi/devQuoteChatCommands";
import { unitaCompatibili } from "@/lib/prezzario/confronto";
import planImage from "./assets/planimetria-esempio.jpg";
import PersistentQuoteSession, { type MemoryProps } from "./PersistentQuoteSession";
import type { LocalChatMessage, LocalQuoteSnapshot, SavedQuoteBudget } from "@/lib/preventivi/localQuoteMemory";
import { readLocalQuoteSnapshot } from '@/lib/preventivi/localQuoteMemory';
import { planCandidates, readPlanLocally, confirmPlanRectangle, PLAN_MAX_BYTES, type PlanAttachment, type PlanRoom, type PlanRectangle, type PlanText } from "@/lib/preventivi/planReading";
import { planWorksResult, recalculatePlanLines } from "@/lib/preventivi/planChat";
import { cadSignature, CAD_MAX_BYTES, readCadLocally, quoteCadEvidence, quoteCadMeasureSummary, quoteCadQuestions, type QuoteCadState } from '@/lib/preventivi/quoteCad';
import { QuoteCadCard } from './QuoteCadCard';
import type { QuoteCadReader } from '@/lib/preventivi/quoteCadTransport';
import { buildQuoteChatContext, quoteChatHistory, quoteEvidenceMessages } from "@/lib/preventivi/quoteChatContext";
import { updateQuoteComponentDecisions, quoteComponentBlocked, describeQuoteComponents, type QuoteComponentDecision } from '@/lib/preventivi/quoteComponentMemory';
import { quotePlanningGuidance } from '@/lib/preventivi/quotePlanningGuidance';
import { readQuoteDossier, upsertQuoteDossier, quoteDossierEvidence, quotePlanDossierPage, type QuoteDossierPage } from '@/lib/preventivi/quoteDossier';
import { quoteProgressLabel } from '@/lib/preventivi/quoteStream';
import type { QuoteProgress } from '../../../../supabase/functions/_shared/quoteStream';
import type { QuoteDemoMemory } from '@/lib/preventivi/quoteDemoMemory';
import { QuoteStreamingReply, type QuoteStreamingReplyHandle } from './QuoteStreamingReply';
import { quoteInitialScaffold, quoteWorkCoverage } from '@/lib/preventivi/quoteWorkCoverage';
import { updateQuoteScopeFacts, refreshQuoteScopeFacts, quoteTurnIsReadOnly, quoteTurnIsExplanationOnly, quoteTurnIsHypothetical, type QuoteScopeFact } from "../../../../supabase/functions/_shared/quoteScopeMemory";
import { updateQuoteRoomDecisions, refreshQuoteRoomDecisions, roomDecisionsFromLegacy, describeQuoteRoomDecisions, quoteRoomProposalBlocked, quoteRoomQuestions, quoteConfirmedWorkReply, type QuoteRoomDecision } from "../../../../supabase/functions/_shared/quoteRoomMemory";
import { coherentQuoteReply, quoteActionReceipt } from "@/lib/preventivi/quoteActionReceipt";
import { quoteCompletionReview } from '@/lib/preventivi/quoteCompletionReview';
import { latestQuoteConversationAssistant } from '@/lib/preventivi/quoteChoiceState';
import { quoteBenchmarkCases, QUOTE_BENCHMARK_MODELS, assessQuoteBenchmarkTurn } from "../../../../supabase/functions/_shared/quoteModelBenchmark";
import { quoteSimulationScenario, quoteSimulationTarget, type QuoteSimulationId } from "@/lib/preventivi/quoteSimulationScenarios";
import { isEmbeddedWizardContextCommand } from '@/lib/preventivi/embeddedWizardCommands';
import type { WizardAiSnapshot } from '@/lib/preventivi/wizardAiMemory';
import { quoteOpeningMeasures, quoteOpeningMeasureText } from "@/lib/preventivi/quoteOpeningMeasures";
import { readLocalQuoteCatalogue, catalogueIndicativeEstimate, type LocalCatalogueRead } from "@/lib/preventivi/quoteLocalCatalogue";
import { assessCatalogueMatch, explicitCatalogueCodes } from "../../../../supabase/functions/_shared/quoteCatalogue";
import { quoteLineOverlaps, replaceQuoteLine } from "@/lib/preventivi/quoteLineDuplicates";
import { fetchQuoteModelCosts, quoteModelCostText } from "@/lib/preventivi/quoteModelCosts";
import { prepareQuoteVision } from '@/lib/preventivi/quoteVision';
import { type QuoteAdvancedModel } from '../../../../supabase/functions/_shared/quoteAdvanced';
import { QuotePreliminaryBudget } from './QuotePreliminaryBudget';
import "./QuoteAiSimulation.css";
import './QuoteChatComposer.css';

type Message = LocalChatMessage;
const planActions = ["Analizza la planimetria di esempio", "Solo camera in alto a sinistra, terrazzi esclusi", "Confermo 4,61 × 4,25 m netti; rifai pavimento e tinteggiatura"];
const actionLabel = (action: string, message: string) => {
  if (action.startsWith('Applica esempio bagno da 12.000 € netti')) return 'Mostra proposta da 12.000 € netti';
  const code = /^Collega codice (\S+) alla voce (\d+)/.exec(action);
  if (code) { const result = [...message.matchAll(/\*\*Risultato (\d+) · ([^*]+)\*\*/g)].find(m => m[2] === code[1]); return `Usa ${result ? `risultato ${result[1]}` : code[1]} per voce ${code[2]}`; }
  return action.startsWith("Componi parti confermate") ? "Componi le lavorazioni confermate" : action.startsWith("Sostituisci voce ") ? action.split(" · revisione")[0] : action;
};
const newIntro = (simulated: boolean, flow?: QuoteAiFlow): Message[] => [{ role: "assistant", text: bagniFlowModel(flow) ? `Modello Bagni: ${BAGNI_AI_MODELS[bagniFlowModel(flow)!]}. Descrivi il lavoro: compongo le voci nel computo del modulo. Puoi modificarle nell’editor Bagni; quantità e prezzi mancanti non sono zero.` : flow ? 'Il preventivo classico è pronto. Descrivi il lavoro o allega una planimetria: compongo le voci qui accanto e puoi modificarle nell’editor classico.' : simulated
  ? "Allega una planimetria PNG, JPEG o PDF: leggo testo e quote sul computer, senza servizi esterni. Poi scegliamo ambiente e lavorazioni qui in chat. L’OCR propone letture, non certifica misure o geometrie. Puoi anche riprodurre il vecchio caso preparato con il suggerimento sotto."
  : "Descrivi il progetto o allega una planimetria. Puoi scegliere subito il modello del preventivo, oppure cambiarlo in seguito. Ti aiuto con lavorazioni e dati mancanti; prezzi e quantità restano da verificare.", actions: flow ? [...(flow === 'bagni:completo' ? [BATHROOM_BUDGET_REQUEST] : []), 'Mostra prezzari'] : simulated ? [planActions[0]] : ["Mostra simulazioni", "Mostra prezzari"] }];
type WorkspaceProps = {
  companyId: string; companyName?: string; ownerId?: string; onBack: () => void; transport?: QuoteChatTransport; simulated?: boolean; memoryMode?: "plan" | "real";
  scenarioId?: QuoteSimulationId; onScenario?: (id: QuoteSimulationId | null) => void;
  templateLibrary?: QuoteWorkspaceTemplates; transcribeAudio?: QuoteAudioTranscriber;
  cadReader?: QuoteCadReader;
  flow?: QuoteAiFlow;
  localTrialId?: string;
  demoMemory?: QuoteDemoMemory;
  /** Wizard-owned isolated session. Never reads/writes the simulation's memory. */
  embedded?: {
    title: string; document: ChatDocument; project: QuoteProject;
    commercial?: { draft: QuoteDraft; defaultVat: number | null; module?: import('@/lib/preventivi/wizardAiDraft').NativeComputoModule };
    onChange: (document: ChatDocument, busy: boolean) => void;
    initial?: WizardAiSnapshot;
    onSnapshot?: (state: WizardAiSnapshot) => void;
    savedLocally?: boolean;
    preview: (document: ChatDocument) => ReactNode;
    /** Fonte di prezzi fissa fin dall'apertura (es. il listino aziendale del computo). */
    fixedSourceId?: string;
  };
};
export default function QuoteAssistedWorkspace(props: WorkspaceProps) {
  // Changing tenant or backend mode unmounts the old request owner synchronously.
  const key = `${props.ownerId}:${props.companyId}:${props.simulated ?? true}:${props.memoryMode}:${props.flow ?? props.scenarioId ?? "main"}:${props.localTrialId ?? ''}`;
  const scope = useMemo(() => ({ ownerId: props.ownerId ?? "", companyId: props.companyId, mode: props.memoryMode ?? (props.simulated === false ? "real" as const : "plan" as const), ...(props.scenarioId ? { scenarioId: props.scenarioId } : {}), ...(props.flow ? { flow: props.flow } : {}), ...(props.localTrialId ? { localTrialId: props.localTrialId } : {}) }), [props.ownerId, props.companyId, props.simulated, props.memoryMode, props.scenarioId, props.flow, props.localTrialId]);
  return props.ownerId && !props.embedded ? <PersistentQuoteSession key={key} scope={scope} demoMemory={props.simulated === false && !props.localTrialId ? props.demoMemory : undefined}>
    {memory => <AssistedWorkspaceBody {...props} memory={memory} />}
  </PersistentQuoteSession> : <AssistedWorkspaceBody key={key} {...props} />;
}
function LocalPlanPreview({ blob, name, reading, selected }: { blob: Blob; name: string; reading: PlanAttachment["reading"]; selected?: PlanText }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => { if (!image.current || !blob.type.startsWith("image/")) return;
    const url = URL.createObjectURL(blob); image.current.src = url; return () => URL.revokeObjectURL(url);
  }, [blob]);
  return blob.type.startsWith("image/") ? <div className="quote-plan-image" style={{ aspectRatio: reading ? `${reading.width}/${reading.height}` : undefined }}><img ref={image} alt={`Planimetria locale: ${name}`} />{selected && <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-label="Posizione del testo dell’ambiente selezionato"><rect x={selected.bbox[0]} y={selected.bbox[1]} width={selected.bbox[2]} height={selected.bbox[3]} fill="#fb923c44" stroke="#e65e13" strokeWidth=".004" /></svg>}</div> : <p>PDF conservato solo nel browser. Scegli una pagina scrivendo «pagina 2». Le posizioni dei testi sono riportate sotto, senza anteprima grafica del PDF.</p>;
}
function AssistedWorkspaceBody({ companyId, companyName = "Demo Azienda 2", ownerId, localTrialId, onBack, transport, simulated = true, memory, scenarioId, onScenario, templateLibrary, transcribeAudio, cadReader, flow, embedded }: WorkspaceProps & { memory?: MemoryProps }) {
  const initial = embedded?.initial?.snapshot ?? memory?.initial.snapshot;
  const scenario = quoteSimulationScenario(scenarioId);
  const [document, setDocument] = useState<ChatDocument>(() => initial?.document ?? (embedded ? structuredClone(embedded.document) : { ...emptyChatDocument(), ...(scenario ? { title: scenario.title } : {}) }));
  const current = useRef(document);
  const undo = useRef<ChatDocument[]>([]);
  const [undoDepth, setUndoDepth] = useState(0);
  const [templateId, setTemplateId] = useState<string | null | undefined>(initial?.templateId);
  const [classicDraft, setClassicDraft] = useState<QuoteDraft | undefined>(() => embedded?.commercial ? structuredClone(embedded.commercial.draft) : initial?.classicDraft);
  const bagniModel = bagniFlowModel(flow);
  const [bagniDraft, setBagniDraft] = useState<LocalBagniDraft | undefined>(initial?.bagniDraft);
  const nativeBagniDraft: LocalBagniDraft | undefined = bagniModel ? bagniDraft ?? { modelId: bagniModel, clientName: '', iva: null, rows: [] } : undefined;
  const [editorOpen, setEditorOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => embedded && !initial ? [{ role: 'assistant', text: `Lavoriamo su **${embedded.title}**, con il modello già scelto nel preventivo. Descrivi cosa vuoi aggiungere o cambiare, oppure allega la planimetria. Le righe esistenti restano protette; applicherò le modifiche al wizard solo dopo la tua conferma.` }] : initial ? [...initial.messages.map(m => {
    const choices = m.role === "assistant" && m.choices == null ? legacyQuoteChoices(m.text) : [];
    return choices.length ? { ...m, choices, choiceRevision: initial.document.revision } : m;
  }), ...(initial.interrupted ? [{ role: "assistant" as const, text: "Ho ripreso la bozza. L’ultima operazione è stata interrotta dalla ricarica e non viene rilanciata automaticamente. Per la planimetria scrivi «leggi planimetria»." }] : [])].slice(-50) : scenario ? [{ role: "assistant", text: `**Simulazione: ${scenario.label}.**\n\nQuesta è una bozza locale separata dal progetto principale. Il testo di partenza è pronto nel campo messaggio: puoi cambiarlo prima di inviarlo all’AI. Tutte le voci restano modificabili; prezzi senza riferimento verificato restano da definire. Nessuna chiamata è stata avviata automaticamente, nessun invio ai clienti.`, actions: ["Mostra prezzari", "Mostra simulazioni", "Torna al progetto principale"] }] : newIntro(simulated, flow));
  // The workflow starts outside chat. No graphical model picker is inserted here.
  const [input, setInput] = useState(initial?.input ?? scenario?.prompt ?? ""); const [busy, setBusy] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [progress, setProgress] = useState<QuoteProgress | null>(null);
  const streamingReply = useRef<QuoteStreamingReplyHandle>(null);
  const pendingBudgetApproval = useRef<string | null>(null);
  const [dossier, setDossier] = useState<QuoteDossierPage[]>(() => initial?.dossier ?? (initial?.plan ? [quotePlanDossierPage(initial.plan)].filter((p): p is QuoteDossierPage => p !== null) : []));
  const [dossierOpen, setDossierOpen] = useState(false);
  const [pane, setPane] = useState("chat");
  const [projectTools, setProjectTools] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const planningEnabled = companyId === 'd2000000-0000-4000-a000-000000000002';
  const [planningOpen, setPlanningOpen] = useState(false);
  const [planningSession, setPlanningSession] = useState(initial?.sessionId ?? '');
  const [planningRequest, setPlanningRequest] = useState<{ id: number; text: string } | null>(null);
  const planningSequence = useRef(0);
  const [project, setProject] = useState(() => structuredClone(initial?.project ?? embedded?.project ?? emptyQuoteProject()));
  const [pendingEdits, setPendingEdits] = useState<LocalQuoteSnapshot['pendingEdits']>(initial?.pendingEdits ?? null);
  const [calculationTool, setCalculationTool] = useState<'quantity' | 'estimate' | null>(null);
  const [model, setModel] = useState<string | null>(initial?.model ?? null);
  const [preferredModel, setPreferredModel] = useState<QuoteAdvancedModel>(initial?.preferredModel ?? 'anthropic/claude-sonnet-5.5');
  const [budgetFollowUp, setBudgetFollowUp] = useState(initial?.budgetFollowUp ?? false);
  const [savedBudget, setSavedBudget] = useState<SavedQuoteBudget | null>(() => {
    if (initial?.savedBudget !== undefined) return initial.savedBudget;
    const last = [...initial?.messages ?? []].reverse().find(m => m.preliminaryBudget);
    return last?.preliminaryBudget ? { preliminaryBudget: last.preliminaryBudget, budgetRevision: last.budgetRevision ?? 0, budgetModel: last.budgetModel ?? 'Modello non registrato' } : null;
  });
  const [sourceId, setSourceId] = useState<string | null>(embedded?.fixedSourceId ?? initial?.sourceId ?? null);
  const [brief, setBrief] = useState<string | undefined>(initial?.brief);
  const [scopeFacts, setScopeFacts] = useState<QuoteScopeFact[]>(() => refreshQuoteScopeFacts(initial?.scopeFacts ?? (initial?.messages ?? []).filter(m => m.role === "user").reduce((facts, m) => updateQuoteScopeFacts(facts, m.text), [] as QuoteScopeFact[])));
  const [roomDecisions, setRoomDecisions] = useState<QuoteRoomDecision[]>(() => initial?.roomDecisions ? refreshQuoteRoomDecisions(initial.roomDecisions) : (initial?.messages ?? []).filter(m => m.role === "user").reduce((facts, m) => updateQuoteRoomDecisions(facts, m.text).decisions, roomDecisionsFromLegacy(initial?.scopeFacts ?? [])));
  const [componentDecisions, setComponentDecisions] = useState<QuoteComponentDecision[]>(() => initial?.componentDecisions ?? (initial?.messages ?? []).filter(m => m.role === 'user').reduce((facts, m) => updateQuoteComponentDecisions(facts, m.text), [] as QuoteComponentDecision[]));
  const [plan, setPlan] = useState<PlanAttachment | null>(initial?.plan ?? null);
  const [cad, setCad] = useState<QuoteCadState | null>(initial?.cad ?? null);
  const [planBlob, setPlanBlob] = useState<Blob | null>(embedded?.initial?.blob ?? memory?.initial.blob ?? null);
  const [rooms, setRooms] = useState<PlanRoom[]>(initial?.rooms ?? []);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(initial?.selectedRoom ?? null);
  const [rectangle, setRectangle] = useState<PlanRectangle | null>(initial?.rectangle ?? null);
  const [operation, setOperation] = useState<"chat" | "ocr" | "cad" | "catalogue">("chat");
  const [preparingAttachment, setPreparingAttachment] = useState(false);
  const embeddedChange = embedded?.onChange;
  useEffect(() => { embeddedChange?.(document, busy || preparingAttachment); }, [document, busy, preparingAttachment, embeddedChange]);
  const fileInput = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLDivElement>(null);
  const choosing = useRef(false);
  const attaching = useRef(false);
  const [needSources, setNeedSources] = useState(false);
  const sources = usePrezzarioFonti(!simulated && (needSources || !!sourceId || messages.some(message => !!message.sources?.length)));
  const sourceNotice = useRef(false);
  const generation = useRef(0); const controller = useRef<AbortController | null>(null);
  const session = useRef(initial?.sessionId ?? crypto.randomUUID());
  const log = useRef<HTMLDivElement>(null);
  const chatScroll = useQuoteChatScroll(log, `${messages.length}:${messages.at(-1)?.text ?? ''}`, pane === 'chat' && !editorOpen);
  const append = (m: Message) => setMessages(prev => [...prev, m].slice(-50));
  const appendDiagnostic = (m: Message) => append({ ...m, diagnostic: true });
  const clearSubmittedInput = (submitted: string) => setInput(value => value.trim() === submitted.trim() ? '' : value);
  const changeTax = (next: QuoteTaxSettings) => {
    try {
      const tax = readQuoteTax(next);
      if (bagniModel && tax.lineRates.length) throw new Error('Il modulo Bagni usa un’aliquota unica: non applico IVA mista al suo PDF.');
      setProject(previous => ({ ...previous, tax }));
      if (nativeBagniDraft) setBagniDraft({ ...nativeBagniDraft, iva: tax.defaultRate });
    } catch (e) { appendDiagnostic({ role: 'assistant', text: (e as Error).message }); }
  };
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);
  useEffect(() => {
    if (!busy) return;
    const started = performance.now();
    const timer = setInterval(() => setElapsedSeconds(Math.floor((performance.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  const save = memory?.save;
  const snapshotChange = embedded?.onSnapshot;
  useEffect(() => {
    const snapshot: LocalQuoteSnapshot = { version: 1, document, messages, input, project, pendingEdits, sessionId: session.current, sourceId, model, preferredModel, budgetFollowUp, savedBudget, interrupted: busy || preparingAttachment, plan, rooms, selectedRoom, rectangle, scopeFacts, roomDecisions, ...(templateId === undefined ? {} : { templateId }), ...(classicDraft ? { classicDraft: aiEditorDraft(document, classicDraft, project) } : {}), ...(bagniModel ? { bagniDraft: bagniDraft ?? { modelId: bagniModel, clientName: '', iva: null, rows: [] } } : {}), ...(brief == null ? {} : { brief }) };
    save?.({ ...snapshot, componentDecisions, dossier, cad }, planBlob);
    snapshotChange?.({ snapshot: { ...snapshot, componentDecisions, dossier, cad }, blob: planBlob });
  }, [save, snapshotChange, document, messages, input, project, pendingEdits, sourceId, model, preferredModel, budgetFollowUp, savedBudget, busy, preparingAttachment, plan, rooms, selectedRoom, rectangle, planBlob, brief, scopeFacts, roomDecisions, componentDecisions, dossier, cad, templateId, classicDraft, bagniModel, bagniDraft]);
  useEffect(() => {
    if (!needSources || simulated || sources.isFetching || sourceNotice.current || !sources.data && !sources.error) return;
    sourceNotice.current = true;
    append({ role: "assistant", diagnostic: true, text: sources.error ? "Non riesco a caricare i prezzari. Quello selezionato resta invariato." : "Scegli il prezzario da usare per questo progetto.",
      sources: sources.data?.filter(f => f.stato === 'pubblicato').slice(0, 60).map(f => ({ id: f.id, label: `${f.regione} · ${f.anno}`, region: f.regione, year: f.anno, name: f.nome, version: f.versione })) });
  }, [needSources, simulated, sources.data, sources.error, sources.isFetching]);
  const change = (next: ChatDocument) => {
    // Editing while waiting invalidates the entire old result, not only its prices.
    if (controller.current) { generation.current++; controller.current.abort(); controller.current = null; setBusy(false); }
    if (JSON.stringify(next) !== JSON.stringify(current.current)) { undo.current = [...undo.current.slice(-9), current.current]; setUndoDepth(undo.current.length); }
    current.current = next; setDocument(next);
  };
  const readPlan = async (asset: PlanAttachment, blob: Blob, page = 1) => {
    if (controller.current || memory?.blocked) return;
    const run = ++generation.current; const ctrl = new AbortController(); controller.current = ctrl; setElapsedSeconds(0); setBusy(true); setOperation("ocr");
    append({ role: "user", text: `Leggi «${asset.name}», pagina ${page}, solo in locale.` });
    try {
      const reading = await readPlanLocally(blob, page, ctrl.signal);
      if (ctrl.signal.aborted || run !== generation.current) return;
      if (reading.page !== page) throw new Error("Pagina della lettura non coerente.");
      const pageEvidence = quotePlanDossierPage({ ...asset, reading })!;
      setDossier(upsertQuoteDossier(dossier, pageEvidence));
      const candidates = planCandidates(reading); setPlan({ ...asset, reading }); setRooms(candidates.rooms); setSelectedRoom(null); setRectangle(null); setModel(reading.engine);
      append({ role: "assistant", text: `${reading.engine === 'Apple Vision locale' ? 'Lettura OCR locale completata' : 'Pagina preparata nel browser'}: ${reading.lines.length} testi nella pagina ${reading.page}/${reading.pages}. Etichette riconosciute: ${candidates.rooms.map((r, i) => `${i + 1}. ${r.label}`).join("; ") || "nessuna affidabile"}. ${reading.engine !== 'Apple Vision locale' ? 'Per immagini e scansioni scegli «Analizza immagine con AI» dagli strumenti: invierai una copia della sola pagina. Nessuna analisi AI è partita al caricamento. ' : ''}Non è un elenco completo dei locali. Non ho ricavato la superficie totale.`,
        questions: [quoteWorkCoverage(current.current, brief ?? '').profile === 'costruzione' ? 'Questa tavola rappresenta lo stato attuale oppure il progetto da realizzare? Le sole etichette OCR non lo stabiliscono.' : 'Su quale ambiente o intervento vuoi lavorare? Puoi indicare anche un locale non riconosciuto dall’OCR.'],
        actions: [...candidates.rooms.slice(0, 12).map((r, i) => `Seleziona ambiente ${i + 1} pagina ${reading.page}`), "Mostra quote lette"],
        warnings: ["Le coordinate indicano dove è stato letto il testo, non il contorno delle stanze. Quote e unità richiedono conferma; non è stato eseguito un rilievo geometrico automatico."],
      });
    } catch (e) { if (!ctrl.signal.aborted && run === generation.current) append({ role: "assistant", text: e instanceof Error ? e.message : "Lettura locale non riuscita." }); }
    finally { if (run === generation.current) { controller.current = null; setBusy(false); } }
  };
  const attach = async (file: File) => {
    if (controller.current || attaching.current || memory?.blocked) return;
    attaching.current = true; setPreparingAttachment(true); const ownerGeneration = generation.current;
    try {
      const isCad = /\.dwg$/i.test(file.name) || cadSignature(new Uint8Array(await file.slice(0, 6).arrayBuffer()));
      if (ownerGeneration !== generation.current) return;
      if (isCad) {
        if (!file.size || file.size > CAD_MAX_BYTES) throw new Error('DWG vuoto o oltre 64 MB.');
        if (plan) throw new Error('Questa bozza ha già una planimetria. Scrivi «nuovo progetto» prima di passare al DWG, per non confondere le misure.');
        const run = ++generation.current; const ctrl = new AbortController(); controller.current = ctrl; setBusy(true); setElapsedSeconds(0); setOperation('cad');
        append({ role: 'user', text: `Leggi il DWG «${file.name.slice(0, 180)}».` });
        try {
          const reading = await (cadReader ? cadReader(file, ctrl.signal) : readCadLocally(file, companyId, ctrl.signal));
          if (ctrl.signal.aborted || run !== generation.current) return;
          if (cad && cad.reading.id !== reading.id) throw new Error('Questa bozza ha già un altro DWG. Scrivi «nuovo progetto» prima di sostituirlo.');
          setCad({ reading, selectedState: cad?.selectedState ?? 'unknown' });
          append({ role: 'assistant', text: `**DWG letto ${reading.processedBy === 'service' ? 'dal convertitore dedicato' : 'in locale'}.** Ho trovato ${reading.totalTexts} testi e ${reading.layers.length} layer riportati. Non ho aggiunto voci o prezzi: legenda, testi ripetuti e geometrie non sono ancora quantità verificate. L’originale non è stato inviato all’AI; il riepilogo è ripreso con questa bozza.${quoteCadMeasureSummary(reading) ? ` ${quoteCadMeasureSummary(reading)}` : ''}`, questions: quoteCadQuestions(reading) });
        } catch (error) { if (!ctrl.signal.aborted && run === generation.current) append({ role: 'assistant', text: error instanceof Error ? error.message : 'DWG non leggibile.' }); }
        finally { if (run === generation.current) { controller.current = null; setBusy(false); } }
        return;
      }
      if (cad) throw new Error('Questa bozza contiene un DWG. Scrivi «nuovo progetto» prima di sostituirlo con un’altra planimetria.');
      if (!file.size || file.size > PLAN_MAX_BYTES) throw new Error("File vuoto o oltre 12 MB.");
      const bytes = await file.arrayBuffer(); const head = new Uint8Array(bytes);
      const mime = head[0] === 255 && head[1] === 216 && head[2] === 255 ? "image/jpeg" : [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => head[i] === v) ? "image/png" : new TextDecoder().decode(head.slice(0, 5)) === "%PDF-" ? "application/pdf" : null;
      if (!mime) throw new Error("Formato non supportato: usa PNG, JPEG o PDF, non SVG o file rinominati.");
      const hash = await crypto.subtle.digest("SHA-256", bytes); const id = [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, "0")).join("");
      if (ownerGeneration !== generation.current) return;
      if (plan && plan.id !== id) throw new Error("Questa bozza ha già una planimetria. Per non confondere misure e allegati, scrivi «nuovo progetto» e conferma prima di sostituirla.");
      const blob = new Blob([bytes], { type: mime });
      const asset: PlanAttachment = { id, name: [...file.name].filter(c => c.charCodeAt(0) >= 32).join("").slice(0, 180), mime, size: blob.size, reading: plan?.reading ?? null };
      setPlan(asset); setPlanBlob(blob); await readPlan(asset, blob);
    } catch (e) { if (ownerGeneration === generation.current) append({ role: "assistant", text: e instanceof Error ? e.message : "Allegato non valido." }); }
    finally { attaching.current = false; setPreparingAttachment(false); }
  };
  const send = async (text = input, intent?: 'budget' | 'vision' | 'schedule', testoMostrato?: string) => {
    if (attaching.current) return;
    if (embedded && isEmbeddedWizardContextCommand(text)) {
      appendDiagnostic({ role: 'assistant', text: 'Il modello, il cliente e le impostazioni fiscali vengono dal wizard aperto. Puoi cambiarli lì dopo aver chiuso questa finestra.' }); return;
    }
    text = text.trim(); if (!text || text.length > 3000 || controller.current || memory?.blocked) return;
    chatScroll.followNextMessage();
    if (cad && /^Usa stato di (?:fatto|progetto) del DWG$/i.test(text)) {
      setCad({ ...cad, selectedState: /progetto/i.test(text) ? 'project' : 'existing' }); clearSubmittedInput(text);
      append({ role: 'user', text }); append({ role: 'assistant', text: 'Riferimento registrato. Quale porzione e quali lavorazioni vuoi preventivare? Le tavole e le misure vanno ancora verificate; nessuna voce è stata inserita.' }); return;
    }
    if (cad && simulated && /DWG/i.test(text)) { append({ role: 'assistant', text: 'Il DWG è stato letto dal convertitore locale. Questa modalità non usa un LLM: per una conversazione libera apri la chat AI collegata, con i crediti della tua azienda.' }); return; }
    if (planningEnabled && planningChatIntent(text, planningOpen)) {
      clearSubmittedInput(text); setPane('chat');
      if (/^chiudi scenari/i.test(text)) { setPlanningOpen(false); setPlanningRequest(null); return; }
      appendDiagnostic({ role: 'user', text });
      setPlanningSession(session.current); setPlanningRequest({ id: ++planningSequence.current, text }); setPlanningOpen(true); return;
    }
    if (/^mostra (?:iva|prezzi e iva)$/i.test(text)) { setTaxOpen(true); clearSubmittedInput(text); return; }
    if (/^(?:quanto (?:costa|[eè]|viene)|(?:mostra|riepiloga|calcola) (?:il |l['’])?(?:totale|importo|imponibile|iva)|totale (?:con |iva))[^\n]{0,120}\biva\b/i.test(text)) {
      setTaxOpen(true); clearSubmittedInput(text); appendDiagnostic({ role: 'user', text }); appendDiagnostic({ role: 'assistant', text: taxTotal.gross == null ? `Il parziale netto delle voci incluse è ${formatCurrency(taxTotal.net)}. Il totale IVA compresa non è ancora calcolabile: completa le aliquote, senza presumere uno 0%.` : `Dalle voci incluse: netto ${formatCurrency(taxTotal.net)}, IVA ${formatCurrency(taxTotal.tax!)}, totale IVA compresa ${formatCurrency(taxTotal.gross)}. Calcolo del software sulle aliquote dichiarate, non conferma della loro applicabilità fiscale.` }); return;
    }
    const taxCommand = quoteTaxCommand(text);
    if (taxCommand) {
      const active = current.current.lines.filter(line => !line.supersededBy?.length);
      if (taxCommand.line != null && (!active[taxCommand.line - 1] || bagniModel)) { appendDiagnostic({ role: 'assistant', text: bagniModel ? 'IVA per singola voce non applicata: il modulo Bagni usa una sola aliquota. Usa il percorso classico per un documento con aliquote miste.' : 'Voce IVA non presente.' }); return; }
      const tax = nativeBagniDraft ? { ...emptyQuoteTax(), defaultRate: nativeBagniDraft.iva } : project.tax ?? emptyQuoteTax();
      changeTax(taxCommand.line == null ? { ...tax, defaultRate: taxCommand.rate } : { ...tax, lineRates: [...tax.lineRates.filter(r => r.id !== active[taxCommand.line! - 1].id), { id: active[taxCommand.line - 1].id, rate: taxCommand.rate }] });
      setTaxOpen(true); clearSubmittedInput(text); appendDiagnostic({ role: 'user', text }); appendDiagnostic({ role: 'assistant', text: `Aliquota ${taxCommand.rate}% dichiarata da te ${taxCommand.line == null ? 'come predefinita per le voci senza aliquota' : `per la voce ${taxCommand.line}`}. Prezzi netti e quantità invariati. Requisiti fiscali e regimi speciali restano da verificare; nessuna scelta fiscale automatica dell’AI.` }); return;
    }
    // Domanda di margine a ritroso («a 18.000 € col 25%»): la risposta è aritmetica e la dà il programma, senza AI.
    const margineDomanda = margineChatIntent(text);
    if (margineDomanda) { clearSubmittedInput(text); appendDiagnostic({ role: 'user', text }); appendDiagnostic({ role: 'assistant', text: margineChatReply(margineDomanda) }); return; }
    if (/^(mostra (?:documenti|dossier)|fonti del progetto)$/i.test(text)) { setDossierOpen(true); clearSubmittedInput(text); return; }
    if (text === 'Mostra controlli preventivo') { setPane('chat'); setProjectTools(true); clearSubmittedInput(text); return; }
    if (text === 'Prepara proposta indicativa dal budget') {
      if (!savedBudget || savedBudget.budgetRevision !== current.current.revision) { appendDiagnostic({ role: 'assistant', text: 'Il budget non è aggiornato alla bozza: rigeneralo prima di trasformarlo in proposta.' }); return; }
      const overlaps = quoteBudgetOverlaps(savedBudget.preliminaryBudget);
      if (overlaps.length) { appendDiagnostic({ role: 'assistant', text: `Prima di convertirlo, chiarisci in chat questi ambiti sovrapposti:\n\n${overlaps.map(warning => `- ${warning}`).join('\n')}\n\nNessun importo sottratto automaticamente e nessuna voce modificata.` }); return; }
      pendingBudgetApproval.current = JSON.stringify(savedBudget);
      append({ role: 'assistant', text: 'Posso creare una proposta modificabile con un pacchetto per ciascun capitolo del budget AI. Il prezzo sarà il punto medio dell’intervallo, non una tariffa regionale. Le lavorazioni precedenti saranno conservate nello storico ed escluse dal totale. Il prezzo non viene adattato al budget del cliente; costi, IVA e fattibilità restano da verificare. Salva una versione locale prima di confrontare alternative.', actions: [`Conferma proposta indicativa dal budget · revisione ${current.current.revision}`, 'Mostra controlli preventivo'] }); return;
    }
    const reviewEdit = /^Conferma modifiche proposte · revisione (\d+)$/.exec(text);
    if (reviewEdit) {
      try { if (!pendingEdits || pendingEdits.revision !== Number(reviewEdit[1])) throw new Error('Richiedi una nuova proposta di modifica.'); change(applyProtectedQuoteEdits(current.current, pendingEdits.proposals, pendingEdits.revision)); setPendingEdits(null); appendDiagnostic({ role: 'assistant', text: 'Modifiche approvate e applicate. Prezzi conservati salvo cambio unità; inclusione da rivedere. I vecchi costi non vengono considerati validi se cambiano specifiche o quantità.' }); } catch (e) { appendDiagnostic({ role: 'assistant', text: (e as Error).message }); }
      return;
    }
    const convertBudget = /^Conferma proposta indicativa dal budget · revisione (\d+)$/.exec(text);
    if (convertBudget) {
      try {
        if (!savedBudget || savedBudget.budgetRevision !== Number(convertBudget[1])) throw new Error('Aggiorna prima il budget preliminare.');
        if (pendingBudgetApproval.current !== JSON.stringify(savedBudget)) throw new Error('Conferma budget superata: rivedi la proposta indicativa attuale prima di applicarla.');
        // Embedded native wizards receive rows, not the standalone project notes.
        // Keep assumptions/exclusions in each row so the saved PDF cannot lose them.
        change(indicativeBudgetProposal(current.current, savedBudget.preliminaryBudget, savedBudget.budgetRevision, !embedded));
        setProject(previous => ({ ...previous, proposalNotes: quoteBudgetNotes(savedBudget.preliminaryBudget) }));
        pendingBudgetApproval.current = null;
        setPendingEdits(null); setBudgetFollowUp(false);
        if (bagniModel) setBagniDraft({ ...nativeBagniDraft!, rows: current.current.lines.filter(l => !l.supersededBy?.length).map(l => ({ id: l.id, chapter: 'Proposta indicativa AI', discount: 0 })) });
        append({ role: 'assistant', text: 'Proposta indicativa composta usando il punto medio di ciascun intervallo AI, non il budget obiettivo. I dettagli precedenti sono nello storico, fuori dal totale. Intervalli e motivazioni restano associati ai prezzi. Non è un computo verificato né una garanzia di fattibilità. Puoi modificare le voci nel preventivatore.' });
      } catch (e) { appendDiagnostic({ role: 'assistant', text: (e as Error).message }); }
      return;
    }
    // A requested illustrative commercial proposal is distinct from a verified
    // estimate. Never relax the general no-invented-catalogue-prices contract.
    if (bagniModel === 'completo' && isBathroomBudgetRequest(text)) {
      append({ role: 'user', text });
      append({ role: 'assistant', text: `**Ti mostro un bagno completo da 12.000 € netti**, IVA da definire.\n\n${BATHROOM_BUDGET_ASSUMPTIONS}\n\n${BATHROOM_BUDGET_NOTE}\n\nCreo 12 pacchetti con prezzi modificabili nel computo Bagni. Le voci attuali saranno conservate nello storico, fuori dal totale: non sommo due versioni del bagno.`, actions: [bathroomBudgetAction(current.current.revision)] });
      setPane('chat'); setInput(''); return;
    }
    const budgetExampleAction = /^Applica esempio bagno da 12\.000 € netti · revisione (\d+)$/.exec(text);
    if (budgetExampleAction && bagniModel === 'completo') {
      try {
        const next = applyBathroomBudgetExample(current.current, Number(budgetExampleAction[1]));
        change(next);
        setBagniDraft({ modelId: 'completo', clientName: nativeBagniDraft?.clientName ?? '', iva: null, rows: next.lines.filter(line => !line.supersededBy?.length).map((line, index) => ({ id: line.id, chapter: BATHROOM_BUDGET_PACKAGES[index][0], discount: 0 })) });
        setSavedBudget(null); setBudgetFollowUp(false);
        setBrief(`${BATHROOM_BUDGET_ASSUMPTIONS} ${BATHROOM_BUDGET_NOTE} Gli importi sono una ripartizione illustrativa di un obiettivo, non la prova di fattibilità economica. Non sovrascrivere i prezzi manuali.`);
        append({ role: 'user', text: 'Mostrami la proposta dimostrativa da 12.000 € netti.' });
        append({ role: 'assistant', text: `**Ecco la proposta valorizzata: 12.000 € netti.**\n\n${BATHROOM_BUDGET_PACKAGES.map(([, title, price]) => `- **${title}**: ${formatCurrency(price)}`).join('\n')}\n\n**IVA da definire.** Apri il computo Bagni per cambiare prezzi, descrizioni o scelte. Il totale si aggiorna; non resta forzato a 12.000 €.\n\n${BATHROOM_BUDGET_NOTE}` });
        setPane('chat'); setInput('');
      } catch (error) { appendDiagnostic({ role: 'assistant', text: error instanceof Error ? error.message : 'Proposta non applicata: bozza conservata.' }); }
      return;
    }
    if (text === 'Diagnostica salvataggio locale') {
      try { readLocalQuoteSnapshot({ version: 1, document: current.current, messages, input, sessionId: session.current, sourceId, model, preferredModel, budgetFollowUp, savedBudget, interrupted: busy, plan, rooms, selectedRoom, rectangle, scopeFacts, roomDecisions, ...(templateId === undefined ? {} : { templateId }), ...(brief == null ? {} : { brief }) }); appendDiagnostic({ role: 'assistant', text: 'Struttura della bozza valida. Se il salvataggio fallisce, verifica spazio e permessi del browser o un conflitto con un’altra scheda. Nessun dato o chiamata AI inviato.' }); }
      catch (error) { appendDiagnostic({ role: 'assistant', text: `Validazione della memoria locale: ${error instanceof Error ? error.message : 'dato non valido'}. La bozza in memoria non viene cancellata. Nessuna chiamata AI.` }); }
      clearSubmittedInput(text); return;
    }
    if (text === 'Passa al computo verificato') { setBudgetFollowUp(false); setInput(''); appendDiagnostic({ role: 'assistant', text: 'Modalità computo: le prossime risposte possono proporre lavorazioni, senza includere automaticamente importi. Il budget preliminare resta separato e non diventa un prezzo verificato.' }); return; }
    if (/^usa (?:sonnet 5\.5|gpt[- ]6\.1 sol)$/i.test(text)) {
      const next = /gpt/i.test(text) ? 'openai/gpt-6.1-sol' : 'anthropic/claude-sonnet-5.5';
      setPreferredModel(next); clearSubmittedInput(text); appendDiagnostic({ role: 'assistant', text: `Prossimi turni di questa bozza: **${next}**. Nessuna chiamata avviata, nessuna modifica al modello globale. Il modello effettivo e il costo verranno riscontrati dopo ogni risposta.`, actions: ['Confronta Sonnet e GPT', 'Confronta costi modelli'] }); return;
    }
    if (/^mostra strumenti ai$/i.test(text)) { appendDiagnostic({ role: 'assistant', text: 'Scegli qui il modello della conversazione o confronta i costi. Budget preliminare è una stima AI separata dal computo verificato; la lettura visiva condivide una copia della planimetria con OpenRouter solo quando premi il pulsante dedicato.', actions: ['Usa Sonnet 5.5', 'Usa GPT 6.1 Sol', 'Confronta costi modelli', 'Confronta Sonnet e GPT'] }); clearSubmittedInput(text); return; }
    const targetedFormulas = /^proponi formule per voci\s+([\d,\s]+)$/i.exec(text);
    if (targetedFormulas) {
      const numbers = [...new Set(targetedFormulas[1].split(/[,\s]+/).filter(Boolean).map(Number))];
      const rows = numbers.map(n => current.current.lines[n - 1]);
      if (!numbers.length || numbers.length > 6 || rows.some(r => !r || r.supersededBy?.length)) { appendDiagnostic({ role: 'assistant', text: 'Scegli da una a sei voci attive, per esempio: Proponi formule per voci 14, 19, 20.' }); return; }
      text = `${QUOTE_FORMULA_REQUEST}\nSolo queste voci: ${rows.map(r => `${r.id}: ${r.title} [${r.unit}]`).join('; ')}. Rispetta le unità esistenti: per m² non moltiplicare l’area per lo spessore; quello produrrebbe m³. Usa anche i dati sintetici di prova già dichiarati, indicando che non sono misure reali.`;
    }
    if (/^(?:calcola quantit[aà]|mostra stime indicative)$/i.test(text)) { setPane('chat'); setCalculationTool(/^calcola/i.test(text) ? 'quantity' : 'estimate'); setInput(''); return; }
    const formulaCommand = /^calcola quantit[aà] voce (\d+)\s*:\s*(.+)$/i.exec(text);
    if (formulaCommand) {
      try { const row = current.current.lines[Number(formulaCommand[1]) - 1]; if (!row) throw new Error('Voce non presente.'); const next = setChatQuantityFormula(current.current, row.id, formulaCommand[2], current.current.revision); change(next); appendDiagnostic({ role: 'user', text }); appendDiagnostic({ role: 'assistant', text: `${next.lines[Number(formulaCommand[1]) - 1].quantityBasis}\nQuantità aggiornata; prezzo conservato, inclusione da riconfermare. Nessuna chiamata AI.` }); setInput(''); }
      catch (e) { appendDiagnostic({ role: 'assistant', text: (e as Error).message }); } return;
    }
    if (flow && (quoteSimulationTarget(text) || /^(?:mostra (?:i )?modelli(?: preventivo)?|usa modello preventivo [a-f\d-]{36}|usa preventivo classico|mostra (?:le )?simulazioni|torna al progetto principale)$/i.test(text))) {
      appendDiagnostic({ role: 'assistant', text: `Questo progetto usa ${bagniModel ? `Bagni · ${BAGNI_AI_MODELS[bagniModel]}` : 'il preventivo classico'} scelto prima della chat. Per un altro progetto torna ai preventivi.` }); return;
    }
    if (/^mostra (?:i )?modelli(?: preventivo)?$/i.test(text)) {
      appendDiagnostic({ role: 'assistant', text: 'Scegli il modello del preventivo. La scelta cambia solo la presentazione, non le lavorazioni.', picker: 'templates' }); clearSubmittedInput(text); return;
    }
    const useTemplate = /^Usa modello preventivo ([a-f\d-]{36})$/i.exec(text);
    if (useTemplate || /^usa preventivo classico$/i.test(text)) {
      const selected = useTemplate && workspaceOfferTemplates(templateLibrary).find(t => t.id === useTemplate[1]);
      if (useTemplate && !selected) { appendDiagnostic({ role: 'assistant', text: 'Modello non più disponibile per questa azienda. Richiedi nuovamente Mostra modelli.' }); return; }
      if (useTemplate && (templateLibrary?.loading || templateLibrary?.error)) { appendDiagnostic({ role: 'assistant', text: 'La libreria non è verificabile ora: non cambio il modello salvato. Riprova quando il caricamento è completato.' }); return; }
      setTemplateId(selected ? selected.id : null); clearSubmittedInput(text); appendDiagnostic({ role: 'assistant', text: `Modello ${selected ? `«${selected.name}»` : 'classico'} applicato all’anteprima locale. Voci, prezzi e conferme invariati.` }); return;
    }
    const proceed = /^Componi parti confermate · revisione (\d+)$/.exec(text);
    if (proceed) {
      if (Number(proceed[1]) !== current.current.revision) { appendDiagnostic({ role: "assistant", text: "Conferma precedente superata. Riscrivi le lavorazioni da comporre." }); return; }
      const previous = [...messages].reverse().find(m => m.role === "user" && !m.diagnostic);
      const reply = previous && quoteConfirmedWorkReply(previous.text);
      if (!reply) { appendDiagnostic({ role: "assistant", text: "Non trovo una richiesta mista da riprendere. Specifica le opere confermate." }); return; }
      await send(reply); return;
    }
    const substitute = /^Sostituisci voce (\d+) con le voci ([\d,]+) · revisione (\d+)$/.exec(text);
    if (substitute) {
      try {
        const parent = current.current.lines[Number(substitute[1]) - 1];
        const children = substitute[2].split(",").map(n => current.current.lines[Number(n) - 1]?.id);
        if (!parent || children.some(id => !id)) throw new Error("Voci non presenti: ripeti Mostra doppioni.");
        change(replaceQuoteLine(current.current, parent.id, children as string[], Number(substitute[3])));
        appendDiagnostic({ role: "assistant", text: "Sostituzione confermata: la voce generica è conservata nello storico e non entra nel totale. Le voci dettagliate non sono state incluse automaticamente.", actions: [`Riattiva voce ${substitute[1]} · revisione ${current.current.revision}`], actionRevision: current.current.revision });
      } catch (error) { appendDiagnostic({ role: "assistant", text: error instanceof Error ? error.message : "Sostituzione non applicata." }); }
      setInput(""); return;
    }
    const reactivate = /^Riattiva voce (\d+) · revisione (\d+)$/.exec(text);
    if (reactivate) {
      const row = current.current.lines[Number(reactivate[1]) - 1];
      if (Number(reactivate[2]) !== current.current.revision || !row?.supersededBy?.length || row.supersededBy.some(id => current.current.lines.find(l => l.id === id)?.included)) { appendDiagnostic({ role: "assistant", text: "Ripristino non applicato: verifica la revisione ed escludi prima eventuali dettagli già inclusi." }); return; }
      change({ ...current.current, revision: current.current.revision + 1, lines: current.current.lines.map(l => l.id === row.id ? { ...l, supersededBy: undefined, included: false } : l) });
      appendDiagnostic({ role: "assistant", text: "Voce riattivata senza inclusione nel totale. Controlla di nuovo le sovrapposizioni.", actions: ["Mostra doppioni"] }); setInput(""); return;
    }
    if (/^mostra doppioni$/i.test(text)) {
      const groups = quoteLineOverlaps(current.current);
      appendDiagnostic({ role: "assistant", text: groups.length ? groups.map(g => `**${current.current.lines.find(l => l.id === g.parentId)?.title}**: ${g.reason} La sostituzione conserva l’originale e non approva importi.`).join("\n\n") : "Nessuna sovrapposizione riconosciuta dai controlli locali. Non è una garanzia di assenza di doppioni tecnici.",
        actionRevision: current.current.revision, actions: [...groups.map(g => `Sostituisci voce ${current.current.lines.findIndex(l => l.id === g.parentId) + 1} con le voci ${g.childIds.map(id => current.current.lines.findIndex(l => l.id === id) + 1).join(",")} · revisione ${current.current.revision}`), ...current.current.lines.flatMap((r, i) => r.supersededBy?.length ? [`Riattiva voce ${i + 1} · revisione ${current.current.revision}`] : [])] }); setInput(""); return;
    }
    const exactSearch = /^cerca codice\s+(.+)$/i.exec(text);
    const rowSearch = /^cerca prezzario per voce (\d+)$/i.exec(text);
    const estimateSearch = /^stima da prezzario voce (\d+)$/i.exec(text);
    const linkCode = /^Collega codice (\S+) alla voce (\d+) · revisione (\d+)$/.exec(text);
    if (exactSearch || rowSearch || estimateSearch || linkCode) {
      if (simulated || !sourceId) { appendDiagnostic({ role: "assistant", text: "Scegli prima una fonte pubblicata con Mostra prezzari. Questa ricerca legge il catalogo senza AI o salvataggi nel gestionale.", actions: ["Mostra prezzari"] }); return; }
      const codes = exactSearch ? explicitCatalogueCodes(exactSearch[1]) : linkCode ? [linkCode[1]] : [];
      const target = rowSearch || estimateSearch ? current.current.lines[Number((rowSearch || estimateSearch)![1]) - 1] : null;
      if (exactSearch && !codes.length || (rowSearch || estimateSearch) && (!target || target.supersededBy?.length) || linkCode && Number(linkCode[3]) !== current.current.revision) { appendDiagnostic({ role: "assistant", text: "Codice, voce o revisione non validi: ripeti la ricerca sulla bozza corrente." }); return; }
      if (estimateSearch && target?.price != null) { appendDiagnostic({ role: 'assistant', text: 'La voce ha già un prezzo: non lo sostituisco con una stima.' }); return; }
      const expectedRevision = current.current.revision;
      const run = ++generation.current; const ctrl = new AbortController(); controller.current = ctrl; setBusy(true); setElapsedSeconds(0); setOperation("catalogue"); setInput("");
      appendDiagnostic({ role: "user", text });
      try {
        const found = await readLocalQuoteCatalogue(sourceId, codes, target ? [target] : current.current.lines.filter(l => !l.supersededBy?.length), ctrl.signal);
        if (ctrl.signal.aborted || run !== generation.current) return;
        if (linkCode) {
          if (found.references.length !== 1) throw new Error("Codice assente o ambiguo nella fonte selezionata: nessun collegamento.");
          const next = attachChatReference(current.current, Number(linkCode[2]) - 1, found.references[0], Number(linkCode[3]));
          current.current = next; setDocument(next);
          appendDiagnostic({ role: "assistant", text: "Riferimento collegato dalla fonte selezionata. Prezzo originale conservato; un prezzo manuale preesistente non viene sovrascritto. Voce fuori dal parziale fino alla tua conferma. Non è una certificazione tecnica.", actions: [`Mostra riferimento voce ${linkCode[2]}`] });
        } else if (estimateSearch && target) {
          const estimate = catalogueIndicativeEstimate(target, found.references);
          if (estimate) { const next = setChatIndicativeEstimate(current.current, target.id, estimate, expectedRevision); current.current = next; setDocument(next); appendDiagnostic({ role: 'assistant', text: `**Stima indicativa, non prezzo confermato**\n${target.title}: ${formatCurrency(estimate.low)}–${formatCurrency(estimate.high)} / ${estimate.unit}.\n\nBase: ${estimate.basis}\n\n${estimate.assumptions}\n\nSalvata separatamente: prezzo e totale confermato invariati.` }); }
          else { appendDiagnostic({ role: 'assistant', text: 'Non ho basi compatibili sufficienti nei candidati recuperati per proporre una stima. Non significa che la voce sia assente dal catalogo. Puoi cercare un altro riferimento o inserire un’analisi di costo motivata in Mostra stime indicative.', actions: ['Mostra stime indicative'] }); }
          showCatalogue(found, [target]);
        } else showCatalogue(found, target ? [target] : undefined);
      } catch (error) { if (!ctrl.signal.aborted && run === generation.current) appendDiagnostic({ role: "assistant", text: error instanceof Error ? error.message : "Ricerca non riuscita: non significa che la voce sia assente." }); }
      finally { if (run === generation.current) { controller.current = null; setBusy(false); } }
      return;
    }
    if (/^mostra (?:le )?simulazioni$/i.test(text)) {
      clearSubmittedInput(text); appendDiagnostic({ role: 'assistant', text: 'Scegli categoria e intervento per aprire una simulazione locale separata.', picker: 'simulations', actions: ['Torna al progetto principale'] }); return;
    }
    const scenarioTarget = quoteSimulationTarget(text);
    if (scenarioTarget) {
      if (!onScenario) { appendDiagnostic({ role: "assistant", text: "Apri questa funzione dal laboratorio locale di Demo Azienda 2." }); return; }
      if (memory && !await memory.flush()) { appendDiagnostic({ role: "assistant", text: "Non cambio simulazione: la bozza non è ancora salvata. Risolvi il salvataggio prima di continuare." }); return; }
      onScenario(scenarioTarget === "principale" ? null : scenarioTarget); return;
    }
    if (/^verifica misure serramenti$/i.test(text)) {
      const latest = [...messages].reverse().find(m => m.role === "user" && quoteOpeningMeasures(m.text).length);
      appendDiagnostic({ role: "assistant", text: latest ? `Calcolo dall’ultimo messaggio utente con gruppi completi; eventuali correzioni successive vanno riscritte con pezzi, lati e unità.\n\n${quoteOpeningMeasureText(quoteOpeningMeasures(latest.text))}` : "Scrivi i gruppi completi, per esempio «2 finestre da 120 × 140 cm e 1 portafinestra da 100 × 240 cm». Non deduco misure o pezzi mancanti." }); setInput(""); return;
    }
    if (/^(?:confronta|mostra) (?:i )?costi (?:dei )?modelli$/i.test(text)) {
      const run = ++generation.current; const ctrl = new AbortController(); controller.current = ctrl;
      setBusy(true); setElapsedSeconds(0); setOperation("chat"); setInput(""); appendDiagnostic({ role: "user", text });
      try {
        const rates = await fetchQuoteModelCosts(ctrl.signal);
        if (run === generation.current && !ctrl.signal.aborted) appendDiagnostic({ role: "assistant", text: quoteModelCostText(rates), actions: ["Confronta modelli", "Mostra simulazioni"] });
      } catch (error) {
        if (run === generation.current && !ctrl.signal.aborted) appendDiagnostic({ role: "assistant", text: `Confronto costi non disponibile. ${error instanceof Error ? error.message : "Catalogo non verificabile."} Nessun modello cambiato, chiamata AI o prezzo stimato dalla memoria.` });
      } finally { if (run === generation.current) { controller.current = null; setBusy(false); } }
      return;
    }
    if (/^confronta sonnet e gpt$/i.test(text)) { appendDiagnostic({ role: 'assistant', text: 'Confronto reale Sonnet 5.5 / GPT-6.1 Sol: stessi sei casi sintetici, nessun dato cliente o immagine e nessuna modifica alla bozza. Massimo 12 turni, stop alla soglia osservata di 0,50 USD (non un tetto preventivo garantito). Nessun fallback o retry automatico.', actions: ['Avvia confronto Sonnet e GPT'] }); setInput(''); return; }
    if (/^confronta (?:i )?modelli(?: haiku 5\.5 e sonnet 5\.5)?$/i.test(text)) {
      appendDiagnostic({ role: "user", text }); setInput("");
      appendDiagnostic({ role: "assistant", text: "Posso confrontare Haiku 5.5 e Sonnet 5.5 su 6 casi sintetici identici: memoria per stanza, conservazione/sovrapposizione, ipotesi, righe manuali, formato di prezzario incompatibile e conferma di esclusione. Fino a 12 turni, con costo AI e tetto osservato di 0,50 USD; nessuna modifica alla tua bozza, configurazione globale o invio ai clienti. Un errore o costo non noto interrompe la prova senza retry automatico.", actions: ["Avvia confronto sintetico modelli"] }); return;
    }
    if (text === "Avvia confronto sintetico modelli" || text === 'Avvia confronto Sonnet e GPT') {
      if (simulated || !transport) { appendDiagnostic({ role: "assistant", text: "Confronto reale disponibile soltanto nella modalità OpenRouter di Demo Azienda 2." }); return; }
      const run = ++generation.current; const ctrl = new AbortController(); controller.current = ctrl; setElapsedSeconds(0); setBusy(true); setOperation("chat"); setInput("");
      appendDiagnostic({ role: "user", text }); const results: string[] = []; let cost = 0;
      try {
        for (const [index, c] of quoteBenchmarkCases().entries()) {
          const selectedModels: NonNullable<QuoteChatRequest['modelTest']>['model'][] = text === 'Avvia confronto Sonnet e GPT' ? ['anthropic/claude-sonnet-5.5', 'openai/gpt-6.1-sol'] : [...QUOTE_BENCHMARK_MODELS];
          const models = index % 2 ? [...selectedModels].reverse() : selectedModels;
          for (const model of models) {
            ctrl.signal.throwIfAborted(); if (cost >= 0.50) throw new Error("Tetto di costo osservato raggiunto: confronto fermato.");
            // eslint-disable-next-line react-hooks/purity -- Measurement inside the async send event handler, never during render.
            const started = performance.now();
            const result = await transport({ ...c.request, companyId, sessionId: session.current, turnId: crypto.randomUUID(), modelTest: { model, caseId: c.id } }, ctrl.signal);
            if (run !== generation.current || ctrl.signal.aborted) return;
            const audit = result.modelTest;
            if (!audit || audit.requestedModel !== model || result.model !== model || audit.caseId !== c.id || !audit.rawTurns.length) throw new Error("Risposta senza riscontro del modello/caso effettivo: confronto non valido.");
            const checks = audit.rawTurns.map(t => assessQuoteBenchmarkTurn(c, t));
            const failed = [...new Set(checks.flatMap(check => Object.entries(check).filter(([, ok]) => !ok).map(([name]) => name)))];
            const post = assessQuoteBenchmarkTurn(c, result.turn);
            // eslint-disable-next-line react-hooks/purity -- Same event-handler measurement as above.
            const duration = ((performance.now() - started) / 1000).toFixed(1);
            const line = `**${c.id} · ${model.includes('gpt') ? 'GPT-6.1 Sol' : model.endsWith("haiku-5.5") ? "Haiku 5.5" : "Sonnet 5.5"}**\n${failed.length ? `Da rivedere nella risposta grezza: ${failed.join(", ")}` : "Controlli strutturali grezzi superati"}. Dopo le protezioni: ${Object.values(post).every(Boolean) ? "controlli superati" : "da rivedere"}.\n${duration} s · ${audit.inputTokens} token input / ${audit.outputTokens} output · costo provider ${audit.costUsd == null ? "non disponibile" : `${audit.costUsd.toFixed(5)} USD`}.`;
            results.push(line); appendDiagnostic({ role: "assistant", text: line, benchmarkRaw: audit.rawTurns });
            if (audit.costUsd == null) throw new Error("Costo provider non disponibile: interrompo senza assumere che sia zero."); cost += audit.costUsd;
          }
        }
        appendDiagnostic({ role: "assistant", text: `Confronto completato: ${results.length}/12 turni. Costo provider noto ${cost.toFixed(5)} USD. La tua bozza è invariata. Sono controlli strutturali su dati sintetici, non una certificazione tecnica: servono anche revisione delle spiegazioni e prove ripetute prima di scegliere il modello.` });
      } catch (error) { if (!ctrl.signal.aborted && run === generation.current) appendDiagnostic({ role: "assistant", text: `Confronto interrotto dopo ${results.length}/12 turni; risultati parziali conservati, nessun vincitore dichiarato. ${error instanceof Error ? error.message : "Errore non verificabile"} Nessun tentativo ripetuto automaticamente.` }); }
      finally { if (run === generation.current) { controller.current = null; setBusy(false); } }
      return;
    }
    const directiveText = quoteStartingPointUserFacts(outsideSupportingDocuments(text));
    const assessment = assessQuoteRequest(directiveText);
    const informational = assessment.intent === 'information' || asksQuoteCurrentValues(directiveText);
    const components = informational ? componentDecisions : updateQuoteComponentDecisions(componentDecisions, directiveText);
    if (JSON.stringify(components) !== JSON.stringify(componentDecisions)) { setComponentDecisions(components); setSavedBudget(null); change({ ...current.current, revision: current.current.revision + 1 }); }
    const roomUpdate = informational ? { decisions: roomDecisions, notices: [], globalText: '' } : updateQuoteRoomDecisions(roomDecisions, directiveText, rooms.map(r => r.label)); setRoomDecisions(roomUpdate.decisions);
    const decisions = informational || quoteTurnIsExplanationOnly(directiveText) ? scopeFacts : updateQuoteScopeFacts(scopeFacts, roomUpdate.globalText); setScopeFacts(decisions);
    const confirmedReply = quoteConfirmedWorkReply(directiveText);
    if (confirmedReply) {
      append({ role: "user", text }); setInput("");
      append({ role: "assistant", text: `Ho separato le lavorazioni richieste dalle scelte ancora aperte.\n\n${describeQuoteRoomDecisions(roomUpdate.decisions)}\n\nPer compatibilità con l’endpoint attuale, puoi comporre le sole opere confermate con il pulsante qui sotto. Il messaggio originale resta intatto; le opere incerte non verranno autorizzate. Nessuna chiamata AI o inclusione nel totale eseguita in questo passaggio.`, actionRevision: current.current.revision, actions: [`Componi parti confermate · revisione ${current.current.revision}`] }); return;
    }
    if (/^mostra (?:(?:le )?esclusioni|memoria(?: ambienti)?)$/i.test(text)) {
      append({ role: "user", text }); append({ role: "assistant", text: roomUpdate.decisions.length || decisions.length || components.length
        ? `Decisioni esplicite salvate in questa bozza:\n\n${describeQuoteRoomDecisions(roomUpdate.decisions.length ? roomUpdate.decisions : roomDecisionsFromLegacy(decisions))}\n\nLa regola specifica per ambiente prevale sulla generale. Questa memoria non include automaticamente importi o voci nel totale.`
        : "Non ho ancora decisioni esplicite salvate per soffitto, terrazzi, bagno, impianti o serramenti. Non considero un riepilogo AI una tua conferma.", ...(components.length ? { editorSummary: `**Componenti della lavorazione**\n\n${describeQuoteComponents(components)}` } : {}) }); setInput(""); return;
    }
    if (/^mostra (?:le )?formule$/i.test(text)) {
      const rows = current.current.lines.filter(r => !r.supersededBy?.length && (r.calculation || r.proposedCalculation));
      appendDiagnostic({ role: 'assistant', text: rows.length ? rows.map(r => `**${r.title}**\n${r.proposedCalculation ? `Proposta da confermare: ${r.proposedCalculation.expression} = ${r.proposedCalculation.result} ${r.unit}. ${r.proposedCalculation.assumptions}\n` : ''}${r.calculation ? `Formula già confermata: ${r.calculation.expression} = ${r.calculation.result} ${r.unit}.` : ''}`).join('\n\n') : 'Nessuna formula confermata o proposta salvata nella bozza. Chiedi all’AI di proporle, oppure usa Calcola quantità.' }); setInput(''); return;
    }
    if (/^verifica computo$/i.test(text)) { appendDiagnostic({ role: 'assistant', text: quoteCompletionReview(current.current, brief ?? '') }); setInput(''); return; }
    const renameDocument = /^rinomina preventivo\s*:\s*(.{1,200})$/i.exec(text);
    if (renameDocument) { change({ ...current.current, title: renameDocument[1].trim(), revision: current.current.revision + 1 }); append({ role: "user", text }); append({ role: "assistant", text: "Titolo aggiornato localmente. Voci, importi ed esclusioni invariati." }); setInput(""); return; }
    const referenceInfo = /^mostra (?:il )?riferimento (?:della )?voce (\d+)$/i.exec(text);
    if (referenceInfo) { append({ role: "user", text }); append({ role: "assistant", text: chatReferenceInfo(current.current, Number(referenceInfo[1]) - 1) }); setInput(""); return; }
    if (text.toLowerCase() === "mostra riferimenti") {
      const actions = current.current.lines.map((r, i) => r.reference ? `Mostra riferimento voce ${i + 1}` : null).filter((a): a is string => !!a).slice(0, 10);
      append({ role: "assistant", text: actions.length ? "Riferimenti già acquisiti nella bozza. Scegli una voce: mostro codice, unità, prezzo e testo originale senza richiamare l’AI." : "Nessun riferimento regionale acquisito in questa bozza. I prezzi manuali restano distinti dal listino.", actions }); setInput(""); return;
    }
    if (/^(nuovo progetto|ricomincia progetto)$/i.test(text)) { append({ role: "assistant", text: "Vuoi iniziare un nuovo progetto? La bozza locale e il suo allegato verranno sostituiti. Salva prima una versione dai controlli locali se vuoi conservarli. Per confermare scrivi «conferma nuovo progetto».", actions: ["Mostra controlli preventivo", "Conferma nuovo progetto"] }); setInput(""); return; }
    if (text.toLowerCase() === "conferma nuovo progetto" || text.toLowerCase() === "ricomincia") {
      generation.current++; session.current = crypto.randomUUID(); change(emptyChatDocument()); setClassicDraft(undefined); setBagniDraft(undefined); setMessages(newIntro(simulated, flow)); setInput(""); setModel(null); setSourceId(null); setNeedSources(false); sourceNotice.current = false;
      setProject(emptyQuoteProject()); setPendingEdits(null); setProjectTools(false); setPlanningOpen(false); setPlanningRequest(null);
      undo.current = []; setUndoDepth(0); setTemplateId(undefined); setPlan(null); setCad(null); setPlanBlob(null); setRooms([]); setSelectedRoom(null); setRectangle(null); setBrief(undefined); setScopeFacts([]); setRoomDecisions([]); setComponentDecisions([]); setDossier([]); setBudgetFollowUp(false); setSavedBudget(null); return;
    }
    if (plan && planBlob && /^(leggi planimetria|pagina \d+)$/.test(text.toLowerCase())) {
      const page = text.toLowerCase().startsWith("pagina ") ? Number(text.slice(7)) : plan.reading?.page ?? 1;
      if (page < 1 || page > (plan.reading?.pages ?? 20)) { append({ role: "assistant", text: "Pagina fuori dal documento (massimo 20)." }); return; }
      setInput(""); await readPlan(plan, planBlob, page); return;
    }
    if (plan?.reading) {
      const roomMatch = /^seleziona ambiente (\d+)(?: pagina (\d+))?$/i.exec(text);
      const addRoom = /^aggiungi ambiente (.{1,100})$/i.exec(text);
      const rename = /^rinomina ambiente (\d+)\s*:\s*(.{1,100})$/i.exec(text);
      if (roomMatch) {
        if (roomMatch[2] && Number(roomMatch[2]) !== plan.reading.page) { append({ role: "assistant", text: "Questo suggerimento appartiene a un’altra pagina. Scegli un ambiente dalla lettura corrente." }); return; }
        const room = rooms[Number(roomMatch[1]) - 1]; if (!room) { append({ role: "assistant", text: "Ambiente non presente nell’elenco corrente." }); return; }
        setSelectedRoom(room.id); setRectangle(null); setInput(""); append({ role: "user", text: `Selezionato: ${room.label} (${roomMatch[1]}), pagina ${plan.reading.page}.` });
        append({ role: "assistant", text: "Non associo automaticamente due numeri a questa stanza. Se il pavimento è un rettangolo netto, conferma i lati in metri scrivendo «confermo rettangolo 4,61 x 4,25 m». Se la forma è irregolare, lascia la superficie da misurare: non uso il rettangolo di ingombro.", actions: ["Mostra quote lette"] }); return;
      }
      if (addRoom) { if (rooms.length >= 100) { append({ role: "assistant", text: "Limite di 100 ambienti per questa prova: suddividi il progetto." }); return; } const room = { id: `p${plan.reading.page}-manual${rooms.length}`, label: addRoom[1].trim(), line: -1, manual: true }; setRooms(prev => [...prev, room]); setInput(""); append({ role: "assistant", text: `Ambiente ${rooms.length + 1}: ${room.label}, inserito manualmente, non riconosciuto dall’OCR.`, actions: [`Seleziona ambiente ${rooms.length + 1} pagina ${plan.reading.page}`] }); return; }
      if (rename) { const i = Number(rename[1]) - 1; if (!rooms[i]) return; setRooms(prev => prev.map((r, n) => n === i ? { ...r, label: rename[2].trim(), manual: true } : r)); append({ role: "assistant", text: "Etichetta corretta manualmente. Le voci già create mantengono il proprio titolo, modificabile sotto." }); setInput(""); return; }
      if (text.toLowerCase() === "mostra quote lette") { const nums = planCandidates(plan.reading).numbers;
        append({ role: "assistant", text: `Numeri candidati, senza assegnazione a un ambiente e senza unità certificata: ${nums.slice(0, 50).map(n => `${n.text} (testo ${n.line + 1})`).join("; ") || "nessuno"}. Apri «Testi e posizioni OCR» per il riscontro. Conferma i lati in metri solo dopo aver controllato il disegno.` }); setInput(""); return; }
      const room = rooms.find(r => r.id === selectedRoom);
      const fact = room ? confirmPlanRectangle(text, room.id, plan.reading) : null;
      if (fact) {
        setRectangle(fact); change(recalculatePlanLines(current.current, plan, fact)); setInput(""); append({ role: "user", text });
        append({ role: "assistant", text: `Conferma registrata per ${room!.label}: ${fact.a} × ${fact.b} m = ${fact.area} m² netti; perimetro teorico ${fact.perimeter} m. È solo questo ambiente. Le voci collegate tornano da confermare; prezzi e quantità inseriti manualmente restano protetti. Quali lavori vuoi?`, actions: ["Rifai pavimento", "Rifai tinteggiatura", "Rifai pavimento e tinteggiatura"] }); return;
      }
      if (/^confermo rettangolo/i.test(text)) { append({ role: "assistant", text: room ? "Misure non valide o ambigue. Usa «confermo rettangolo 4,61 x 4,25 m»; non accetto intervalli o quote senza unità." : "Seleziona prima l’ambiente a cui appartengono le misure." }); return; }
      if (room) { const id = crypto.randomUUID(); const result = planWorksResult(current.current, plan, room, rectangle, text, id);
        if (result) { const applied = applyChatResult(current.current, result, id, null); change(applied.document); setInput(""); append({ role: "user", text }); append({ role: "assistant", text: result.turn.message, questions: result.turn.questions, warnings: [...result.turn.warnings, ...applied.notices] }); return; }
      }
    }
    if (!simulated && text.toLowerCase() === "mostra prezzari") { sourceNotice.current = false; if (needSources) void sources.refetch(); setNeedSources(true); clearSubmittedInput(text); return; }
    if (!simulated && text.toLowerCase().startsWith("usa fonte ")) {
      const source = sources.data?.find(f => f.id === text.slice(10) && f.stato === "pubblicato");
      if (!source) { append({ role: "assistant", text: "Scegli una fonte pubblicata dall’elenco della chat." }); return; }
      if (source.id !== sourceId && !canSelectChatSource(current.current, source.id)) { append({ role: "assistant", text: "Sono già presenti riferimenti di un’altra edizione, anche tra le voci escluse. Per non mescolare i prezzi mantengo la fonte e la bozza attuali. Una nuova edizione richiede un nuovo progetto." }); return; }
      if (source.id === sourceId) { clearSubmittedInput(text); return; }
      setSourceId(source.id); change({ ...current.current, revision: current.current.revision + 1 });
      appendDiagnostic({ role: "assistant", text: `Useremo il prezzario **${quoteSourcePresentation({ id: source.id, label: source.nome, region: source.regione, year: source.anno, name: source.nome }).title}**. Continuiamo con le lavorazioni.` }); clearSubmittedInput(text); return;
    }
    if (text.toLowerCase() === "conferma voci complete") {
      const ready = current.current.lines.filter(l => !chatLineIssue(l));
      let next = current.current; for (const r of ready) next = patchChatLine(next, r.id, { included: true }); change(next);
      append({ role: "assistant", text: `${ready.length} voci complete incluse. I prezzi mancanti non diventano zero. Il risultato resta un parziale netto: IVA, costi interni e tempi sono ancora da definire.` }); setInput(""); return;
    }
    const command = parseQuoteChatCommand(text);
    if (command) {
      const row = current.current.lines[command.index]; append({ role: "user", text }); setInput("");
      if (!row) { append({ role: "assistant", text: "La voce non esiste nella tabella corrente." }); return; }
      if (command.kind === "include" && chatLineIssue(row)) { append({ role: "assistant", text: chatLineIssue(row)! }); return; }
      if (command.kind === "quantity" && command.unit && !unitaCompatibili(command.unit, row.unit)) { append({ role: "assistant", text: "Unità incompatibile: nessuna modifica applicata." }); return; }
      if (command.kind === "restore") change(patchChatLine(current.current, row.id, { price: row.reference && unitaCompatibili(row.reference.unit, row.unit) ? row.reference.price : null }));
      else if (command.kind === "include" || command.kind === "exclude") change(patchChatLine(current.current, row.id, { included: command.kind === "include" }));
      else if ("value" in command) change(patchChatLine(current.current, row.id, { [command.kind === "price" ? "price" : "quantity"]: command.value }));
      append({ role: "assistant", text: `Voce ${command.index + 1} aggiornata localmente, senza chiamare AI. Il riferimento originale resta conservato.` }); return;
    }
    if (plan && simulated) { append({ role: "user", text }); setInput(""); append({ role: "assistant", text: "Questa prova locale non usa un LLM e non interpreta liberamente nuove richieste. Per questo allegato puoi scegliere un ambiente, confermare un rettangolo, scrivere «rifai pavimento», «rifai tinteggiatura» o «aggiungi lavorazione Impianto elettrico». Prezzi e quantità si modificano anche sotto. Non applico il vecchio caso preparato al tuo file." }); return; }
    const lastReply = messages.filter(message => message.role === 'assistant' && !message.diagnostic).at(-1);
    const scheduleOnly = intent === 'schedule' || quoteScheduleIntent(text) || quoteScheduleReply(text, !!lastReply?.scheduleFollowUp);
    const target = informational || scheduleOnly ? null : quoteBudgetIntent(text);
    const clarifiedBasis = project.target && /^(?:il budget [eè] |sono |intendevo )?(?:iva (?:inclusa|compresa)|lord[oi]|iva esclusa|nett[oi]|pi[uù] iva|\+\s*iva)[.!]?$/i.test(text)
      ? /inclusa|compresa|lord/i.test(text) ? 'gross' as const : 'net' as const : undefined;
    const projectForTurn = target ? { ...project, target } : clarifiedBasis ? { ...project, target: { ...project.target!, basis: clarifiedBasis } } : project;
    if (projectForTurn !== project) { setProject(projectForTurn); setSavedBudget(null); }
    const conversation = quoteChatHistory(messages, text);
    const evidence: string[] = [];
    const openings = quoteOpeningMeasures(text);
    let measurementReceipt: string | undefined;
    if (openings.length) {
      const calculation = quoteOpeningMeasureText(openings);
      const supplement = `RISCONTRO DEL SOFTWARE SUI NUMERI SCRITTI, NON APPROVAZIONE COMMERCIALE:\n${calculation}`;
      // Keep the user's latest intent byte-for-byte intact. Safety wording in
      // calculation evidence must not turn an edit request into a hypothesis.
      if (supplement.length <= 3000) evidence.push(supplement);
      measurementReceipt = calculation;
    }
    const snapshot = current.current;
    const editorEvidence = flow === 'classico' || embedded ? aiEditorDraft(snapshot, classicDraft).items?.filter(item => !['nota', 'subtotale', 'sconto'].includes(item.item_category)).slice(0, 12).map(item => `${item.client_temp_id}: prezzo manuale ${snapshot.lines.find(line => line.id === item.client_temp_id)?.price ?? 'da definire'}, sconto ${item.discount_percent}%, IVA ${item.vat_rate ?? 'da definire'}%.`).join(' ') : '';
    const nativeEditorEvidence = bagniModel ? snapshot.lines.filter(line => !line.supersededBy?.length).slice(0, 12).map(line => `${line.id}: quantità attuale ${line.quantity ?? 'ignota'} ${line.unit}, prezzo unitario attuale ${line.price ?? 'da definire'} EUR, ${line.included ? 'inclusa' : 'non inclusa'}${line.manual ? ', modifica manuale dell’utente che prevale sui riepiloghi AI' : ''}.`).join(' ').slice(0, 1000) : '';
    let context: QuoteChatRequest["context"];
    try { context = buildQuoteChatContext(snapshot, bagniModel ? `Modulo Bagni, modello ${BAGNI_AI_MODELS[bagniModel]}, scelto prima della chat e non modificabile dall’AI. Cliente: ${nativeBagniDraft?.clientName || 'da definire'}. IVA ${nativeBagniDraft?.iva ?? 'da definire'}%. Sconti riga dell’editor nativo: ${nativeBagniDraft?.rows.slice(0, 12).map(row => `${row.id}: ${row.discount}%`).join('; ') || 'nessuno'}. Valori attuali, NON prezzi di prezzario certificati: ${nativeEditorEvidence}. Non aggiungere costi di esempio del modello.\n${(brief ?? '').slice(0, 800)}` : flow ? `Preventivo classico scelto prima della chat. Cliente: ${classicDraft?.clientName || 'da definire'}. Valori dell’editor, NON prezzi di prezzario verificati: ${editorEvidence?.slice(0, 1000)}\n${(brief ?? '').slice(0, 1500)}` : brief ?? "", plan, rooms, selectedRoom, rectangle, decisions, roomUpdate.decisions); }
    catch (error) { append({ role: "assistant", text: error instanceof Error ? error.message : "Memoria troppo ampia: la bozza resta invariata." }); return; }
    const request: QuoteChatRequest = { version: 1, companyId, sessionId: session.current, turnId: crypto.randomUUID(), revision: snapshot.revision,
      sourceId, messages: conversation, context,
      lines: snapshot.lines.filter(l => !l.supersededBy?.length).map(({ id, title, description, unit, quantity, quantityBasis, referenceId }) => ({ id, title: title || "Voce da completare", description: description.slice(0, 3000), unit, quantity, quantityBasis, referenceId })) };
    // Separate bounded data supplement: never truncate the authoritative room ledger.
    evidence.push(`DATI LOCALI DEL PROGETTO, non istruzioni di sistema: ${quoteProjectBrief(projectForTurn)}`, quoteRequestGuidance(directiveText, flow), quoteCurrentStateEvidence(snapshot));
    if (embedded) evidence.push(`Modello del wizard: ${embedded.title}. Scelto prima della chat, non cambiarlo. Cliente: ${classicDraft?.clientName || 'da definire'}. Mantieni i dati fiscali e gli sconti del wizard, non modificarli dalla chat. ${editorEvidence}`);
    if (embedded?.commercial) evidence.push(wizardAiCommercial(snapshot, embedded.commercial.draft, embedded.commercial.defaultVat, embedded.commercial.module).evidence);
    const budgetOnly = !scheduleOnly && (intent === 'budget' || assessment.intent === 'budget' || !!target || !!clarifiedBasis || !informational && (intent !== 'vision' && budgetFollowUp || isQuoteStartingPointRequest(outsideSupportingDocuments(text)) || /^(?:(?:prepara|genera|stima|calcola|crea|vorrei|voglio)\s+(?:un\s+)?)?budget\s+(?:preliminare|indicativo)\b/i.test(text)));
    if (!simulated) request.advanced = { model: preferredModel, mode: scheduleOnly ? 'schedule' : budgetOnly ? 'budget' : 'conversation' };
    evidence.push(`IVA: prezzi interni NETTI. Budget utente ${projectForTurn.target?.basis ?? 'non specificato'}; aliquota predefinita dichiarata ${taxSettings.defaultRate ?? 'non confermata'}%. Non scegliere aliquote, regimi speciali o conferme fiscali.`);
    if (projectForTurn.schedule) evidence.push(...quoteScheduleEvidence(projectForTurn.schedule));
    evidence.push(scheduleOnly ? 'Turno dedicato soltanto al cronoprogramma preliminare. Non comporre o modificare voci, quantità, prezzi o budget. Rispettare le esclusioni e dichiarare le ipotesi sulle durate.' : quotePlanningGuidance(snapshot, directiveText, plan, intent === 'vision', budgetOnly));
    evidence.push(...quoteDossierEvidence(dossier, directiveText, plan ? { id: plan.id, page: plan.reading?.page ?? 1 } : null));
    if (cad) evidence.push(quoteCadEvidence(cad, directiveText));
    if (components.length) evidence.push(`MEMORIA UTENTE DEI COMPONENTI, decisioni di ambito NON prezzi o inclusioni. Non estendere una restrizione all’intero impianto.\n${describeQuoteComponents(components)}`);
    try { request.messages = quoteEvidenceMessages(conversation, evidence); }
    catch (error) { appendDiagnostic({ role: 'assistant', text: (error as Error).message }); return; }
    // La bolla mostra quello che l'utente ha scelto; al modello arriva il testo completo (vedi `choose`).
    append({ role: "user", text: testoMostrato ?? text, ...(testoMostrato && testoMostrato !== text ? { sent: text } : {}) }); setInput("");
    if (measurementReceipt) appendDiagnostic({ role: "assistant", text: measurementReceipt });
    if (!simulated && !transport) { append({ role: "assistant", text: "Backend AI locale non configurato. Nessuna chiamata o modifica eseguita." }); return; }
    if (budgetOnly) { pendingBudgetApproval.current = null; setSavedBudget(null); }
    const run = ++generation.current; const ctrl = new AbortController(); controller.current = ctrl; setProgress(null); setElapsedSeconds(0); setBusy(true); setOperation("chat");
    try {
      if (intent === 'vision') {
        if (!request.advanced || !plan || !planBlob) throw new Error('Allega prima la planimetria in questa bozza.');
        try { request.advanced.vision = await prepareQuoteVision(planBlob, plan.id, plan.reading?.page ?? 1, ctrl.signal); }
        catch (error) { if (ctrl.signal.aborted) throw error; throw new Error(`Preparazione locale dell’immagine non riuscita: ${error instanceof Error ? error.message : 'decodifica non disponibile'}. Nessuna chiamata visiva avviata.`, { cause: error }); }
        if (!request.context!.plan) request.context!.plan = { attachmentId: plan.id, page: 1, pages: 1, texts: [], rooms: [], selectedRoom: null, rectangle: null };
      }
      let exactFound: LocalCatalogueRead | undefined;
      const codes = explicitCatalogueCodes(text);
      if (!simulated && sourceId && codes.length && !quoteTurnIsHypothetical(text) && !/\bnon (?:cercare|ricercare)\b/i.test(text)) {
        try { exactFound = await readLocalQuoteCatalogue(sourceId, codes, snapshot.lines.filter(l => !l.supersededBy?.length), ctrl.signal); }
        catch (error) { if (ctrl.signal.aborted) throw error; appendDiagnostic({ role: "assistant", text: "Ricerca locale del codice non riuscita; non equivale a voce assente. Nessun prezzo applicato." }); }
      }
      const result = await (transport ?? simulatePlanConversation)(request, ctrl.signal, event => {
        if (ctrl.signal.aborted || run !== generation.current || event.turnId !== request.turnId || event.revision !== request.revision) return;
        if (event.type === 'draft') streamingReply.current?.update(event.text);
        else { setProgress(event.stage); if (event.stage === 'catalogue' || event.stage === 'composition') streamingReply.current?.clear(); }
      });
      if (ctrl.signal.aborted || run !== generation.current) return;
      if (result.simulated !== simulated) throw new Error("Modalità della risposta non coerente.");
      if (scheduleOnly) {
        const proposal = result.turn.scheduleProposal;
        if (proposal) {
          // A preliminary timetable is not permission to execute or include a
          // quote row. Open choices may be modelled conditionally; exclusions
          // and preservation remain hard constraints, including specific rooms.
          const scheduleDecisions = roomUpdate.decisions.filter(d => d.state !== 'undecided');
          const conflicts = proposal.tasks.filter(task => quoteComponentBlocked(task.title, components) || quoteRoomProposalBlocked({ id: task.id, title: task.title, description: task.basis, unit: '', quantity: null, quantityBasis: '', referenceId: null }, scheduleDecisions));
          if (conflicts.length) throw new Error(`Fasi incompatibili con esclusioni o conservazioni salvate: ${conflicts.slice(0, 3).map(t => `«${t.title}»`).join(', ')}. Il programma precedente è conservato: chiedi una proposta senza quelle opere.`);
          const schedule = readLocalQuoteSchedule({ proposal, sourceRevision: snapshot.revision, sourceScope: quoteScheduleScope(snapshot.lines, JSON.stringify([decisions, roomUpdate.decisions, components])), startDate: projectForTurn.schedule?.startDate ?? null, confirmed: false });
          setProject(previous => ({ ...previous, schedule }));
        }
        setModel(result.model);
        append({ role: 'assistant', text: result.turn.message, scheduleFollowUp: result.turn.questions.length > 0, questions: result.turn.questions, choices: result.turn.choices, choiceRevision: snapshot.revision, warnings: result.turn.warnings, actions: ['Mostra IVA'] });
        return;
      }
      if (budgetOnly) {
        setModel(result.model);
        setBudgetFollowUp(!result.turn.preliminaryBudget);
        if (result.turn.preliminaryBudget) setSavedBudget({ preliminaryBudget: result.turn.preliminaryBudget, budgetRevision: snapshot.revision, budgetModel: result.model });
        const budgetCheck = result.turn.preliminaryBudget ? quoteBudgetTargetCheck(result.turn.preliminaryBudget, projectForTurn.target, budgetVat) : null;
        const budgetMessage = budgetCheck?.status === 'below-range'
          ? `**Il budget non copre l’intervallo proposto.** Il minimo stimato è ${formatCurrency(budgetCheck.low)}, ${formatCurrency(budgetCheck.shortfall)} oltre l’obiettivo ${projectForTurn.target?.basis === 'gross' ? 'IVA inclusa' : 'netto'}. Occorre rivedere ambito o forniture, oppure aumentare il budget: non abbasso automaticamente i prezzi. Sono stime preliminari, non tariffe verificate né garanzia di fattibilità. Il computo resta invariato.`
          : result.turn.message;
        append({ role: 'assistant', text: budgetMessage, questions: result.turn.questions, warnings: result.turn.warnings,
          choices: result.turn.choices, choiceRevision: snapshot.revision,
          ...(result.turn.preliminaryBudget ? { preliminaryBudget: result.turn.preliminaryBudget, budgetRevision: snapshot.revision, budgetModel: result.model } : {}), actions: [...(result.turn.preliminaryBudget ? ['Prepara proposta indicativa dal budget'] : []), 'Passa al computo verificato', 'Mostra strumenti AI'] });
        return;
      }
      // Defend local data too, independently of provider/backend compliance.
      const formulaGuard = guardQuoteFormulaTurn(text, result.turn.proposals, snapshot.lines);
      const scaffold = !informational && !quoteTurnIsReadOnly(text) && !formulaGuard.formulaOnly && !result.turn.proposals.length ? quoteInitialScaffold(snapshot, directiveText) : [];
      const proposals = (scaffold.length ? scaffold : formulaGuard.proposals).filter(p => !quoteRoomProposalBlocked(p, roomUpdate.decisions, current.current.lines.find(l => l.id === p.id)) && !quoteComponentBlocked(p.title, components));
      const safe = { ...result, turn: { ...result.turn, proposals, questions: quoteRoomQuestions(result.turn.questions, roomUpdate.decisions), ...(scaffold.length && proposals.length ? { message: 'Struttura preliminare delle fasi proposta dal software: l’AI non aveva restituito righe.\n\nQuantità e prezzi restano da definire. Le fasi sono modificabili e vanno dettagliate secondo il progetto, senza sommarle ai futuri dettagli.' } : {}), ...(formulaGuard.formulaOnly ? { brief: brief ?? '', excludeIds: [] } : {}), ...(informational || quoteTurnIsReadOnly(text) ? { title: snapshot.title, brief: brief ?? "", proposals: [], excludeIds: [] } : {}) } };
      const applied = applyChatResult(current.current, safe, request.turnId, request.sourceId);
      if (!informational && !quoteTurnIsReadOnly(text) && !formulaGuard.formulaOnly) {
        const edits = protectedQuoteEdits(snapshot, proposals);
        if (edits.length) setPendingEdits({ revision: applied.document.revision, proposals: edits.map(e => e.proposal) });
      }
      current.current = applied.document; setDocument(applied.document); setModel(applied.result.model); if (applied.result.turn.brief != null) setBrief(applied.result.turn.brief);
      const referenceActions = informational && !/riferiment|prezzari|codic|font[ei]/i.test(directiveText) ? [] : applied.document.lines.map((r, i) => r.reference && !r.supersededBy?.length ? `Mostra riferimento voce ${i + 1}` : null).filter((a): a is string => !!a).slice(0, 4);
      const componentExclusions = !informational && !quoteTurnIsReadOnly(text) ? applied.document.lines.filter(r => r.included && !r.supersededBy?.length && quoteComponentBlocked(r.title, components)).map(r => r.id) : [];
      const exclusionActions = [...new Set([...(applied.result.turn.excludeIds ?? []), ...componentExclusions])].map(id => applied.document.lines.findIndex(r => r.id === id && r.included)).filter(i => i >= 0).map(i => `Escludi voce ${i + 1}`);
      const coverageActions = !informational && proposals.length && quoteWorkCoverage(applied.document, directiveText).profile ? ['Verifica computo'] : [];
      const summarizeEditor = asksQuoteCurrentValues(text) || !!nativeBagniDraft && quoteTurnIsReadOnly(text) && /riepilog|valori attuali|prezzo manuale|quantit[aà] attuale/i.test(text);
      const protectedEdits = !informational && !quoteTurnIsReadOnly(text) && !formulaGuard.formulaOnly && protectedQuoteEdits(snapshot, proposals).length > 0;
      const rowDiscounts = Object.fromEntries(nativeBagniDraft ? nativeBagniDraft.rows.map(row => [row.id, row.discount]) : aiEditorDraft(applied.document, classicDraft).items?.map(item => [item.client_temp_id, item.discount_percent ?? 0]) ?? []);
      const classicRates = aiEditorDraft(applied.document, classicDraft).items?.filter(item => !['nota', 'subtotale', 'sconto'].includes(item.item_category)).map(item => item.vat_rate) ?? [];
      const currentVat = nativeBagniDraft ? nativeBagniDraft.iva : classicRates.length && classicRates.every(rate => rate != null && rate === classicRates[0]) ? classicRates[0] ?? null : null;
      const restrictions = roomUpdate.decisions.filter(d => d.state === 'excluded' || d.state === 'preserved');
      const restrictionText = restrictions.length ? `\n\n**Esclusioni e conservazioni salvate**\n\n${restrictions.slice(0, 6).map(d => `- ${d.room === '*' ? 'Tutta la commessa' : d.room} · ${d.work === 'ambito' ? 'intero ambiente' : d.work.replaceAll('_', ' ')}: ${d.state === 'excluded' ? 'escluso' : 'da mantenere'}.`).join('\n')}${restrictions.length > 6 ? '\nLe altre decisioni restano nella memoria della chat.' : ''}` : '';
      append({ role: "assistant", text: summarizeEditor ? 'Ecco i dati correnti calcolati dalla bozza locale, senza cambiare voci o importi.' : protectedEdits ? 'Ho preparato una proposta sulle tue righe manuali, senza sovrascriverle. Nel confronto qui sotto trovi i valori correnti e quelli proposti: controllali prima di approvare. Il prezzo manuale resta conservato salvo cambio di unità.' : coherentQuoteReply(applied.result.turn.message), receipt: quoteActionReceipt(snapshot, applied.document, safe.turn, Math.max(0, result.turn.proposals.length - proposals.length)), actionRevision: applied.document.revision, questions: summarizeEditor ? [] : applied.result.turn.questions,
        ...(summarizeEditor ? { editorSummary: `${embedded?.commercial ? wizardAiCommercial(applied.document, embedded.commercial.draft, embedded.commercial.defaultVat, embedded.commercial.module).summary : quoteCurrentValues(applied.document, currentVat, rowDiscounts)}${restrictionText}`.slice(0, 3000) } : {}),
        choices: summarizeEditor ? [] : applied.result.turn.choices?.length ? applied.result.turn.choices : legacyQuoteChoices(applied.result.turn.message), choiceRevision: applied.document.revision,
        warnings: [...roomUpdate.notices, ...formulaGuard.notices, ...(componentExclusions.length ? ['Una restrizione su un componente riguarda voci già incluse: conferma le esclusioni proposte prima di considerarle tolte dal totale.'] : []), ...applied.result.turn.warnings, ...applied.notices], actions: exclusionActions.length || referenceActions.length || coverageActions.length
          ? [...exclusionActions, ...referenceActions, ...coverageActions]
          : simulated && !applied.document.lines.length ? [text === planActions[0] ? planActions[1] : planActions[2]] : undefined });
      if (exactFound) showCatalogue(exactFound);
      if (quoteLineOverlaps(applied.document).length) appendDiagnostic({ role: "assistant", text: "Possibile sovrapposizione fra voce generica e dettagli. Prima di confermare gli importi, scegli quali mantenere.", actions: ["Mostra doppioni"] });
    } catch (e) {
      if (!ctrl.signal.aborted && run === generation.current) append({ role: "assistant", text: e instanceof Error ? e.message : "Risposta non valida: le tue voci restano invariate.", actions: current.current.lines.some(r => r.reference) ? ["Mostra riferimenti"] : undefined });
    } finally { if (run === generation.current) { controller.current = null; setBusy(false); } }
  };
  const showCatalogue = (found: LocalCatalogueRead, targets = current.current.lines.filter(l => !l.supersededBy?.length)) => {
    const actions: string[] = [];
    const blocks = found.references.map((ref, n) => {
      const checks = targets.map(l => ({ row: l, issues: assessCatalogueMatch(l, ref) }));
      const closest = [...checks].sort((a, b) => a.issues.length - b.issues.length)[0];
      // At most six explicit bindings; the user reviews the original text first.
      for (const c of checks.filter(c => !c.issues.length).slice(0, 3)) if (actions.length < 6) actions.push(`Collega codice ${ref.code} alla voce ${current.current.lines.findIndex(l => l.id === c.row.id) + 1} · revisione ${current.current.revision}`);
      return `**Risultato ${n + 1} · ${ref.code}**\n${ref.sourceName} · ${ref.unit || "Unità mancante"} · ${ref.price == null ? "Prezzo ufficiale mancante" : formatCurrency(ref.price)}\n${ref.description.slice(0, 650)}${ref.description.length > 650 ? "… (testo completo disponibile nel riferimento collegato)" : ""}\n${checks.length && checks.every(c => c.issues.length) ? `Nessun collegamento ammesso: ${closest?.issues.slice(0, 2).join("; ")}.` : "Candidato da verificare: il codice esistente non prova da solo l’equivalenza tecnica."}`;
    });
    appendDiagnostic({ role: "assistant", text: `**Ricerca locale completata · nessuna chiamata AI**\nQuery: ${found.queries.map(q => `${q.kind === "code" ? "codice esatto" : "testo"}: ${q.text}`).join("; ")}\n\n${blocks.join("\n\n") || "Nessun risultato nel campione consultato."}${found.missingCodes.length ? `\n\nCodici non restituiti dalla fonte selezionata: ${found.missingCodes.join(", ")}.` : ""}\n\nNessun prezzo incluso automaticamente. Leggi inclusioni/esclusioni e collega un riferimento solo alla lavorazione corretta.`.slice(0, 6000), catalogueRefs: found.references.slice(0, 6), actions, actionRevision: current.current.revision });
  };
  const stop = () => { generation.current++; controller.current?.abort(); controller.current = null; setBusy(false);
    append({ role: "assistant", text: operation === 'cad' ? 'Conversione DWG interrotta. Nessun risultato tardivo verrà applicato e nessuna chiamata AI è stata eseguita.' : operation === "ocr" ? "Lettura locale interrotta: nessun risultato tardivo verrà applicato. L’allegato resta disponibile nel browser." : operation === "catalogue" ? "Ricerca catalogo interrotta. Nessuna chiamata AI o modifica alle voci." : "Attesa interrotta: non applicherò risultati tardivi. Una chiamata AI già avviata sul server potrebbe comunque terminare ed essere contabilizzata." }); };
  const latestAssistant = messages.reduce((last, m, index) => m.role === "assistant" && !isQuoteProviderNotice(m) ? index : last, -1);
  const latestBudgetMessage = messages.reduce((last, message, index) => message.preliminaryBudget ? index : last, -1);
  const latestSourceMessage = messages.reduce((last, message, index) => message.sources?.length ? index : last, -1);
  const latestTemplatePicker = messages.reduce((last, message, index) => message.picker === 'templates' ? index : last, -1);
  const latestSimulationPicker = messages.reduce((last, message, index) => message.picker === 'simulations' ? index : last, -1);
  const latestBudget = quoteHasIndicativePrices(document) ? null : savedBudget;
  const latestConversationAssistant = latestQuoteConversationAssistant(messages);
  const choose = async (index: number, choice: QuoteChatChoice) => {
    const message = messages[index];
    if (choosing.current || busy || controller.current || memory?.blocked || index !== latestConversationAssistant || message.selectedChoiceId || message.choiceRevision !== current.current.revision || !message.choices?.some(c => c.id === choice.id)) return;
    if (input.trim()) {
      setInput(value => value.includes(choice.reply) || value.length + choice.reply.length + 2 > 3000 ? value : `${value}\n\n${choice.reply}`);
      composer.current?.querySelector("textarea")?.focus(); return;
    }
    choosing.current = true;
    setMessages(prev => prev.map((m, i) => i === index ? { ...m, selectedChoiceId: choice.id } : m));
    try {
      // Always natural-language chat, never execute a model-authored local command: il prefisso tiene
      // la risposta (scritta dall'AI) fuori dai comandi locali di `send`, ancorati all'inizio del testo
      // («Conferma modifiche proposte · revisione N», «IVA 22% …»). Nella bolla però si vede solo la
      // scelta: «Rispondo alla proposta dell'assistente:» davanti a ogni clic sembrava scritto da un robot (29/10/2026).
      await send(`Rispondo alla proposta dell’assistente: ${choice.reply}`, message.scheduleFollowUp ? 'schedule' : undefined, choice.reply);
    } finally { choosing.current = false; }
  };
  const customize = () => { setInput(value => value.trim() ? value : "Preferisco un’altra soluzione: "); composer.current?.querySelector("textarea")?.focus(); };
  const prepareStartingPoint = () => {
    if (busy || memory?.blocked) return;
    const next = quoteStartingPointDraft(input);
    if (next === null) { appendDiagnostic({ role: 'assistant', text: 'Il messaggio è già lungo. Accorcialo prima di preparare una proposta iniziale: il testo scritto resta conservato.' }); return; }
    setInput(next); composer.current?.querySelector('textarea')?.focus();
  };
  const taxSettings = nativeBagniDraft ? { ...emptyQuoteTax(), defaultRate: nativeBagniDraft.iva, display: project.tax?.display ?? 'net' } : project.tax ?? emptyQuoteTax();
  const rawLinkedDraft = flow === 'classico' || embedded?.commercial ? aiEditorDraft(document, classicDraft, project) : undefined;
  const wizardCommercial = embedded?.commercial ? wizardAiCommercial(document, embedded.commercial.draft, embedded.commercial.defaultVat, embedded.commercial.module) : undefined;
  const linkedDraft = rawLinkedDraft ? { ...rawLinkedDraft, items: wizardCommercial?.items ?? quoteTaxItems(rawLinkedDraft.items ?? [], taxSettings, true) } : undefined;
  const items = linkedDraft ? (linkedDraft.items ?? []).filter(item => !item.is_optional) : chatQuoteItems(document);
  const taxItems = quoteTaxItems(nativeBagniDraft ? items.map(item => ({ ...item, discount_percent: nativeBagniDraft.rows.find(row => row.id === item.client_temp_id)?.discount ?? 0 })) : items, taxSettings, !!linkedDraft);
  const taxTotal = wizardCommercial?.taxTotal ?? quoteTaxTotals(taxItems, linkedDraft?.discountPercent ?? 0);
  const budgetVat = taxSettings.lineRates.length || linkedDraft?.items?.some(item => item.vat_rate != null && item.vat_rate !== taxSettings.defaultRate) ? null : taxSettings.defaultRate;
  const scheduleScope = quoteScheduleScope(document.lines, JSON.stringify([scopeFacts, roomDecisions, componentDecisions]));
  const planningScope = JSON.stringify([scheduleScope, document.lines.filter(line => line.included && !line.supersededBy?.length).map(line => [line.id, project.costs.find(cost => cost.id === line.id && cost.scope === JSON.stringify([line.title, line.description, line.quantity, line.unit]))?.hours ?? null])]);
  const documentNotes = quoteDocumentNotes(document, project.notes, project.proposalNotes);
  const scheduleText = quoteScheduleDocumentText(project.schedule, scheduleScope);
  const wizardGeneratedNotes = [quoteDocumentNotes(document, '', project.proposalNotes).notes, scheduleText].filter(Boolean).join('\n\n');
  const composerAction = (action: QuoteComposerAction) => {
    if (busy || memory?.blocked) return;
    if (embedded && (action === 'project' || action === 'tax')) { appendDiagnostic({ role: 'assistant', text: 'Cliente, immobile, note e IVA restano quelli del wizard. Le ipotesi discusse qui non li sovrascrivono.' }); return; }
    if (action === 'project') { setProjectTools(v => !v); return; }
    if (action === 'tax') { setTaxOpen(v => !v); return; }
    if (action === 'planning') { void send('Mostra scenari di cantiere'); return; }
    if (action === 'schedule') { void send('Prepara un cronoprogramma preliminare delle lavorazioni di questo progetto, con fasi, dipendenze, giornate di lavoro e attese distinte; nessuna modifica al computo o prenotazione.', 'schedule'); return; }
    if (action === 'quantity' || action === 'estimate') { setCalculationTool(v => v === action ? null : action); return; }
    if (action === 'example') { void fetch(planImage).then(r => r.blob()).then(blob => attach(new File([blob], 'planimetria-esempio.jpg', { type: 'image/jpeg' }))).catch(() => append({ role: 'assistant', text: 'Immagine di esempio non disponibile.' })); return; }
    if (action === 'vision') { void send(input.trim() || 'Analizza la planimetria allegata: descrivi locali e quote leggibili, chiedimi quali lavorazioni desidero. Nessuna modifica alle voci.', 'vision'); return; }
    if (action === 'budget') { void send(`${input.trim() ? input.trim() + '\n\n' : ''}Prepara un budget preliminare per questo progetto, con ipotesi esplicite e intervalli indicativi separati dal computo verificato.`, 'budget'); return; }
    void send(action === 'formulas' ? QUOTE_FORMULA_REQUEST : action === 'review' ? 'Verifica computo' : 'Mostra strumenti AI');
  };
  const estimates = chatEstimateTotals(document);
  const overlaps = quoteLineOverlaps(document);
  const issueFor = (r: typeof document.lines[number]) => chatLineIssue(r) ?? (overlaps.some(g => g.parentId === r.id || g.childIds.includes(r.id)) ? "Possibile doppione: usa Mostra doppioni prima di includere." : null);
  const incomplete = document.lines.filter(r => !r.supersededBy?.length && issueFor(r)).length;
  const awaiting = document.lines.filter(r => !r.supersededBy?.length && !r.included && !issueFor(r)).length;
  const rows = document.lines.map(r => ({ ...r, archived: !!r.supersededBy?.length, issue: issueFor(r), reference: r.pricing || r.original.quantityBasis.startsWith('ESEMPIO A BUDGET') ? quotePriceLabel(r) : r.reference
    ? `${r.reference.sourceName} · ${r.reference.code} · ${r.reference.price == null ? "Prezzo mancante" : formatCurrency(r.reference.price)} / ${r.reference.unit} · corrispondenza da verificare${r.manual ? " · valori manuali, riferimento conservato" : ""} · ${r.quantityBasis}`
    : `${r.estimate ? `STIMA INDICATIVA: ${formatCurrency(r.estimate.low)}–${formatCurrency(r.estimate.high)} / ${r.unit} · ${r.estimate.basis} · ${r.estimate.assumptions}` : r.manual ? "Valori manuali · nessun prezzo regionale verificato" : "Proposta da verificare · prezzo non disponibile"} · ${r.quantityBasis}`,
  originalDescription: r.reference?.description }));
  const wizardContext = { project, scope: scheduleScope, generatedNotes: wizardGeneratedNotes,
    onChange: (next: QuoteProject) => { if (!memory?.blocked) setProject(readQuoteProject(next)); },
    onRegenerate: () => { setEditorOpen(false); composerAction('schedule'); } };
  if (editorOpen && nativeBagniDraft) return <Suspense fallback={<p role="status">Apro il computo Bagni…</p>}>{memory?.issue && <p role="alert">{memory.issue}</p>}<fieldset disabled={memory?.blocked}><BagniQuoteEditor document={document} draft={nativeBagniDraft} project={project} projectContext={wizardContext} companyId={companyId} companyName={companyName} onBack={() => setEditorOpen(false)} onChange={next => { if (memory?.blocked) return; setBagniDraft(next.draft); if (next.document !== current.current) change(next.document); }} /></fieldset></Suspense>;
  if (editorOpen && flow === 'classico') return <Suspense fallback={<p role="status">Apro l’editor classico…</p>}>{memory?.issue && <div role="alert" className="quote-memory-warning">{memory.issue}<button onClick={() => setEditorOpen(false)}>Torna alla chat per il recupero</button></div>}<fieldset disabled={memory?.blocked}><ClassicQuoteEditor localEditor={{ initial: linkedDraft!, projectContext: wizardContext, onBack: () => setEditorOpen(false), onChange: draft => { if (memory?.blocked) return; try { const next = applyAiEditorDraft(current.current, draft, classicDraft); const nextProject = applyAiEditorProject(project, draft); const tax = quoteTaxFromEditor(taxSettings, linkedDraft?.items ?? [], draft.items ?? []); setProject({ ...nextProject, tax }); setClassicDraft(draft); setTemplateId(draft.selectedTemplateId ?? undefined); if (next !== current.current) change(next); } catch (error) { setEditorOpen(false); appendDiagnostic({ role: 'assistant', text: `${error instanceof Error ? error.message : 'Modifica non applicata.'} La precedente bozza è conservata.` }); } } }} /></fieldset></Suspense>;
  return <main className={`simulation-shell chat-only-workspace ${embedded ? 'quote-workspace-embedded' : ''}`}>
    {!embedded && flow && <nav className="quote-flow-bar" aria-label="Percorso preventivo AI"><span><strong>{bagniModel ? `Bagni · ${BAGNI_AI_MODELS[bagniModel]}` : 'Preventivo classico'}</strong> · Silvio AI → voci live → editor</span><button type="button" disabled={busy || memory?.blocked} onClick={() => setEditorOpen(true)}>{bagniModel ? 'Continua nel computo Bagni ↗' : 'Continua nell’editor classico ↗'}</button></nav>}
    <header className="simulation-head"><div><span className="simulation-kicker">{companyName.toUpperCase()} · BOZZA LOCALE</span><h1>{document.lines.length || document.title !== emptyChatDocument().title ? document.title : 'Il progetto nasce dal dialogo.'}</h1><p>{document.lines.filter(l => !l.supersededBy?.length).length ? `${items.length} ${items.length === 1 ? 'voce inclusa' : 'voci incluse'} · ${incomplete} da completare · ${awaiting} da confermare` : 'Descrivi il lavoro o allega una planimetria. Lo costruiamo insieme.'}</p></div><span className="simulation-safe">{simulated ? plan?.reading ? "OCR locale · nessun LLM" : "Prova locale · nessun LLM" : "Demo 2 · bozza locale"}</span></header>
    {localTrialId && <p className="quote-ux-trial-note">Prova UX separata · salvata solo in questo browser. Le altre bozze sono conservate.</p>}
    <div className="simulation-columns regional-layout quote-workbench-layout"><div className="chat-editing-column">
      <Tabs value={pane} onValueChange={setPane} className="quote-workbench">
      <TabsList aria-label="Spazio preventivo" className="quote-workbench-tabs" data-pane={pane}>
        <span className="quote-workbench-indicator" aria-hidden="true" />
        <TabsTrigger value="chat">Silvio AI{busy && <span className="quote-tab-working" aria-label="Elaborazione in corso" />}</TabsTrigger>
        <TabsTrigger value="lines">Voci del preventivo <span className="quote-tab-count" aria-hidden="true">{document.lines.filter(l => !l.supersededBy?.length).length}</span></TabsTrigger>
      </TabsList>
      <TabsContent value="chat" forceMount hidden={pane !== "chat"} className="quote-workbench-panel">
      <section className="quote-lab-chat" aria-label="Chat unica preventivo"><header className="chat-workspace-header"><div className="quote-chat-identity"><span><i aria-hidden="true">✦</i>Silvio AI</span><small role="status">{memory?.status ?? (embedded?.savedLocally ? 'Bozza ripresa da questo browser · modifiche da salvare' : 'Conversazione non salvata')}</small></div><div className="quote-chat-header-meta"><details className="quote-model-details"><summary aria-label="Dettagli modello AI">{simulated ? 'Locale' : preferredModel.includes('sonnet') ? 'Sonnet 5.5' : 'GPT 6.1 Sol'}</summary><div>{!simulated && <p>Prossimo turno: {preferredModel}</p>}<p>{model ? <>Ultimo esito: {model}</> : 'Il modello effettivo viene verificato dopo la risposta.'}</p>{!simulated && <button type="button" disabled={busy || memory?.blocked} onClick={() => void send('Mostra strumenti AI')}>Modello e costi AI</button>}</div></details><span className={`chat-operation-status ${busy ? "working" : ""}`}><i aria-hidden="true" />{busy ? operation === "ocr" ? "Lettura" : "Elaborazione" : "Pronto"}</span></div></header>
        {memory?.issue && <div role="alert" className="quote-memory-warning"><p>{memory.issue}</p>{memory.blocked ? <button onClick={memory.reload}>Riprendi versione salvata (scarta modifiche di questa scheda)</button> : <button onClick={memory.retry}>Riprova salvataggio</button>}</div>}
        <div className="quote-lab-messages" role="log" aria-live="polite" ref={log} onScroll={chatScroll.onScroll}>{messages.map((m, i) => isQuoteProviderNotice(m) ? null : <article className={`quote-lab-message ${m.role}`} key={i}><small>{m.role === "user" ? "Tu" : simulated ? plan ? "Assistente · locale" : "Assistente · caso preparato" : "Assistente"}</small>{m.role === 'assistant' && m.sources?.length ? null : m.role === 'assistant' && m.diagnostic && m.text.includes('**Risultato ') ? <QuoteCatalogueMessage content={m.text} actions={m.actions} references={m.catalogueRefs} disabled={busy || memory?.blocked || i !== latestAssistant || m.actionRevision !== document.revision} onAction={a => void send(a)} /> : m.role === "assistant" ? <QuoteChatResponse content={m.receipt ? coherentQuoteReply(m.text) : m.text} /> : <p>{m.text}</p>}
          {simulated && !plan && i === 0 && <details className="quote-chat-attachment"><summary>Immagine del precedente caso preparato (non OCR)</summary><img src={planImage} alt="Planimetria del caso preparato; superficie totale non verificata" loading="lazy" /></details>}
          {(!!m.questions?.length || !!m.choices?.length) && <div className="quote-chat-follow-up">
            {!!m.questions?.length && <ul className="quote-chat-questions">{m.questions.map(q => <li key={q}><QuoteChatResponse content={q.replace(/^\s*(?:[-*•]\s*)?(?:\d{1,3}[.)]\s*)?/, "")} /></li>)}</ul>}
            {!!m.choices?.length && <QuoteChatChoices hideCaption={!!m.questions?.length} choices={m.choices} selectedId={m.selectedChoiceId} active={!memory?.blocked && i === latestConversationAssistant && m.choiceRevision === document.revision} busy={busy} draftText={input} onChoose={choice => void choose(i, choice)} onCustomize={customize} />}
            {!!m.questions?.length && !m.choices?.length && i === latestAssistant && <div className="quote-chat-quick-help">
              {!simulated && m.questions.some(q => /prezzari[oi]|listino|edizione/i.test(q)) && <button type="button" disabled={busy || memory?.blocked} onClick={() => void send('Mostra prezzari')}>Scegli prezzario</button>}
              {!simulated && <button type="button" disabled={busy || memory?.blocked} onClick={prepareStartingPoint}>Proposta iniziale</button>}
              <button type="button" disabled={busy || memory?.blocked} onClick={() => { setInput(v => v.trim() ? v : 'Non lo so ancora: aiutami a capire quali dati servono prima di scegliere.'); composer.current?.querySelector('textarea')?.focus(); }}>Aiutami a scegliere</button>
            </div>}
          </div>}
          {m.editorSummary && <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3" aria-label="Valori del computo al momento della risposta"><QuoteChatResponse content={m.editorSummary} /></div>}
          <QuoteTurnDetails warnings={m.warnings} receipt={m.receipt} revision={m.actionRevision} onReview={() => setPane('lines')} />
          {m.preliminaryBudget && <QuotePreliminaryBudget budget={m.preliminaryBudget} stale={m.budgetRevision !== document.revision || i !== latestBudgetMessage || !savedBudget} model={m.budgetModel} vat={budgetVat} />}
          {m.benchmarkRaw?.map((t, n) => <details className="quote-chat-caveats" key={`raw-${n}`}><summary>Risposta grezza del modello · passaggio {n + 1}</summary><QuoteChatResponse content={t.message} />{t.questions.map(q => <QuoteChatResponse key={q} content={q} />)}<p>Proposte: {t.proposals.map(p => `${p.id}: ${p.title}`).join("; ") || "nessuna"}</p><p>Esclusioni proposte: {t.excludeIds?.join(", ") || "nessuna"}</p></details>)}
          {i === latestAssistant && m.actions?.some(a => /^Escludi voce \d+$/.test(a) && document.lines[Number(a.match(/\d+$/)?.[0]) - 1]?.included) && <p className="quote-chat-confirmation"><strong>Esclusione ancora da confermare.</strong> La scelta tecnica non ha tolto importi dal totale: usa il pulsante «Escludi voce» qui sotto per applicarla.</p>}
          {m.actions?.some(a => /^Escludi voce \d+$/.test(a)) && m.actionRevision !== document.revision && <p className="quote-chat-confirmation">Proposta precedente: prima di escludere, richiedi una nuova verifica delle voci attuali in chat.</p>}
          {m.actions && <div className="quote-lab-suggestions">{m.actions.filter(a => !(m.diagnostic && m.text.includes('**Risultato ') && a.startsWith('Collega codice '))).map(a => <button key={a} disabled={busy || memory?.blocked || / · revisione \d+$/.test(a) && Number(a.match(/(\d+)$/)?.[1]) !== document.revision || /^Componi parti confermate/.test(a) && i !== latestAssistant || /^Escludi voce \d+$/.test(a) && m.actionRevision !== document.revision || a === 'Prepara proposta indicativa dal budget' && (i !== latestBudgetMessage || !savedBudget) || /^Conferma proposta indicativa dal budget/.test(a) && i !== latestAssistant} onClick={() => void send(a)}>{a.startsWith('Usa modello preventivo ') ? `Usa ${workspaceOfferTemplates(templateLibrary).find(t => a.endsWith(t.id))?.name ?? 'modello non disponibile'}` : actionLabel(a, m.text)}</button>)}</div>}
          {m.sources && <QuoteSourcePicker options={m.sources} selectedId={sourceId} disabled={busy || !!memory?.blocked || i !== latestSourceMessage} loading={sources.isFetching} error={!!sources.error} onRetry={() => void send('Mostra prezzari')} onSelect={id => send(`usa fonte ${id}`)} />}
          {!flow && m.picker === 'simulations' && <QuoteSimulationPicker currentId={scenarioId} disabled={busy || !!memory?.blocked || i !== latestSimulationPicker} onSelect={id => send(`Simulazione ${quoteSimulationScenario(id)!.label.toLocaleLowerCase('it')}`)} />}
          {!embedded && !flow && (m.picker === 'templates' || i === 0 && m.role === 'assistant' && !simulated) && <QuoteTemplatePicker library={templateLibrary} selectedId={templateId}
            expanded={m.picker === 'templates' || templateId === undefined && !initial?.messages.some(message => message.role === 'user' && !message.diagnostic)}
            disabled={busy || !!memory?.blocked || (m.picker === 'templates' ? i !== latestTemplatePicker : latestTemplatePicker >= 0)}
            onSelect={id => send(id === null ? 'Usa preventivo classico' : `Usa modello preventivo ${id}`)} />}
        </article>)}
        {pendingEdits && <section className="rounded-xl border border-orange-200 bg-orange-50 p-4" aria-label="Modifiche proposte alle righe protette">
          <strong>Modifiche da approvare · non ancora applicate</strong>
          {protectedQuoteEdits(document, pendingEdits.proposals).map(edit => <div className="my-3" key={edit.proposal.id}><b>{document.lines.find(l => l.id === edit.proposal.id)?.title}</b><ul>{edit.fields.map(key => <li key={key}>{({ title: 'Titolo', description: 'Descrizione', quantity: 'Quantità', unit: 'Unità' })[key]}: {String(document.lines.find(l => l.id === edit.proposal.id)?.[key] ?? 'da definire')} → {String(edit.proposal[key] ?? 'da definire')}</li>)}</ul></div>)}
          <p className="my-2 text-xs">Nessun prezzo scritto dall’AI viene applicato. Il cambio di unità richiede un nuovo prezzo; costi e inclusione vanno rivisti.</p>
          <button className="rounded-lg border px-3 py-2 disabled:opacity-50" disabled={busy || memory?.blocked || pendingEdits.revision !== document.revision} onClick={() => void send(`Conferma modifiche proposte · revisione ${pendingEdits.revision}`)}>Approva queste modifiche</button><button className="ml-2 text-blue-700 underline" disabled={busy || memory?.blocked} onClick={() => setPendingEdits(null)}>Scarta proposta</button>
          {pendingEdits.revision !== document.revision && <p role="status">La bozza è cambiata: chiedi una nuova proposta prima di applicarla.</p>}
        </section>}
        {planningEnabled && planningOpen && <Suspense fallback={<p role="status">Apro gli scenari locali…</p>}><QuotePlanningChat key={`${ownerId}:${companyId}:${planningSession}`} ownerId={ownerId ?? ''} companyId={companyId} sessionId={planningSession} scope={planningScope} document={document} project={project} request={planningRequest} disabled={busy || !!memory?.blocked}
          onReply={text => appendDiagnostic({ role: 'assistant', text })} onClose={() => { setPlanningOpen(false); setPlanningRequest(null); }} /></Suspense>}
        {projectTools && <QuoteProjectTools document={document} project={project} vat={nativeBagniDraft?.iva ?? null} commercialTotals={taxTotal} discounts={Object.fromEntries(nativeBagniDraft?.rows.map(r => [r.id, r.discount]) ?? [])} memory={memory} disabled={busy || !!memory?.blocked}
          onChange={next => { setProject(next); if (JSON.stringify(next.target) !== JSON.stringify(project.target) || JSON.stringify(next.rooms) !== JSON.stringify(project.rooms)) setSavedBudget(null); }}
          onQuantities={revision => { try { change(applyQuoteRoomQuantities(current.current, project, revision)); appendDiagnostic({ role: 'assistant', text: 'Quantità collegate ricalcolate dalle misure dichiarate. Prezzi conservati; inclusione e costi precedenti da rivedere.' }); } catch (e) { appendDiagnostic({ role: 'assistant', text: (e as Error).message }); } }}
          onPricing={(id, pricing) => change({ ...current.current, revision: current.current.revision + 1, lines: current.current.lines.map(l => l.id === id ? { ...l, pricing } : l) })} />}
        {taxOpen && <QuoteTaxPanel settings={taxSettings} total={taxTotal} rows={document.lines.filter(line => !line.supersededBy?.length).map(line => ({ id: line.id, title: line.title, rate: linkedDraft?.items?.find(item => item.client_temp_id === line.id)?.vat_rate ?? null }))} onChange={changeTax} singleRate={!!nativeBagniDraft} disabled={busy || !!memory?.blocked || !!embedded} />}
        {project.schedule && <QuoteSchedulePanel schedule={project.schedule} stale={project.schedule.sourceScope !== scheduleScope} disabled={busy || !!memory?.blocked} onChange={schedule => setProject(previous => ({ ...previous, schedule }))} onRegenerate={() => void send('Rivedi il cronoprogramma preliminare sulle lavorazioni e sulle esclusioni attuali.', 'schedule')} />}
        {projectTools && nativeBagniDraft && <QuoteLocalPdfButton document={document} draft={nativeBagniDraft} project={project} companyId={companyId} companyName={companyName} scheduleScope={scheduleScope} />}
        <QuoteFormulaSuggestions document={document} disabled={busy || !!memory?.blocked}
          onConfirm={(id, revision) => { try { const row = current.current.lines.find(r => r.id === id); if (!row?.proposedCalculation) throw new Error('Proposta non più presente.'); change(setChatQuantityFormula(current.current, id, row.proposedCalculation.expression, revision)); appendDiagnostic({ role: 'assistant', text: 'Formula AI controllata e confermata. Quantità aggiornata dal software; inclusione da riconfermare e prezzi invariati.' }); } catch (e) { appendDiagnostic({ role: 'assistant', text: (e as Error).message }); } }}
          onDismiss={(id, revision) => { if (revision !== current.current.revision) return; change({ ...current.current, revision: revision + 1, lines: current.current.lines.map(r => r.id === id ? { ...r, proposedCalculation: undefined } : r) }); appendDiagnostic({ role: 'assistant', text: 'Formula proposta scartata. Quantità e importi precedenti conservati.' }); }} />
        {calculationTool && <QuoteCalculationTools mode={calculationTool} document={document} disabled={busy || !!memory?.blocked}
          onFormula={(id, expression, revision) => { try { const next = setChatQuantityFormula(current.current, id, expression, revision); change(next); appendDiagnostic({ role: 'assistant', text: `${next.lines.find(r => r.id === id)!.quantityBasis}\nInclusione da riconfermare; nessuna chiamata AI.` }); } catch (e) { appendDiagnostic({ role: 'assistant', text: (e as Error).message }); } }}
          onEstimate={(id, estimate, revision) => { try { change(setChatIndicativeEstimate(current.current, id, estimate, revision)); appendDiagnostic({ role: 'assistant', text: `Stima indicativa salvata separatamente: ${formatCurrency(estimate.low)}–${formatCurrency(estimate.high)} / ${estimate.unit}.\nBase: ${estimate.basis}\nIpotesi: ${estimate.assumptions}\nNon è un prezzo regionale verificato e non entra nel totale confermato.` }); } catch (e) { appendDiagnostic({ role: 'assistant', text: (e as Error).message }); } }}
          onSearchEstimate={index => void send(`Stima da prezzario voce ${index + 1}`)} />}
        {cad && <QuoteCadCard cad={cad} disabled={busy || !!memory?.blocked} onAction={text => void send(text)} />}
        {plan && planBlob && <article className="quote-lab-message assistant quote-plan-card"><details><summary>{plan.name} · {plan.reading ? `pagina ${plan.reading.page}/${plan.reading.pages}` : "da leggere"}</summary><LocalPlanPreview blob={planBlob} name={plan.name} reading={plan.reading} selected={plan.reading && selectedRoom ? plan.reading.lines[rooms.find(r => r.id === selectedRoom)?.line ?? -1] : undefined} />
          {plan.reading && <details><summary>Testi e posizioni OCR ({plan.reading.lines.length})</summary><ol>{plan.reading.lines.slice(0, 100).map((l, i) => <li key={i}>{i + 1}. {l.text} · posizione {l.bbox.map(n => n.toFixed(3)).join(", ")} · confidenza OCR {Math.round(l.confidence * 100)}% (non accuratezza metrica)</li>)}</ol>{plan.reading.lines.length > 100 && <p>Mostrati i primi 100 testi.</p>}</details>}</details></article>}
        {busy && operation === 'chat' && <QuoteStreamingReply ref={streamingReply} log={log} />}
        {busy && <ThinkingProgress status="thinking" elapsedSeconds={elapsedSeconds} steps={[{ id: "turn", text: operation === 'cad' ? 'Leggo testi e layer del DWG sul computer. Nessuna chiamata AI.' : operation === "ocr" ? "Lettura locale OCR del documento (primo avvio: preparo il motore)" : operation === "catalogue" ? "Leggo la fonte selezionata, senza chiamare l’AI" : simulated ? "Riproduco il caso di prova" : progress ? quoteProgressLabel[progress] : "Collegamento all’assistente…", status: "active" }]} />}</div>
        {chatScroll.unread && <div className="quote-chat-unread"><button type="button" onClick={chatScroll.jumpToLatest} aria-label="Vai all’ultima risposta">Nuova risposta ↓</button></div>}
        {(dossier.length > 0 || dossierOpen) && <details open={dossierOpen} onToggle={e => setDossierOpen(e.currentTarget.open)} className="mx-4 my-2 rounded-lg border border-blue-100 p-3 text-xs"><summary className="cursor-pointer text-blue-800">Documenti del progetto · {dossier.length} {dossier.length === 1 ? 'pagina' : 'pagine'}</summary><p className="my-2 text-slate-500">Estratti locali richiamabili dall’AI. OCR e specifiche non sono misure o prezzi certificati.</p>{dossier.map(page => <details key={`${page.id}:${page.page}`} className="my-2"><summary>{page.name} · p. {page.page} · {page.origin === 'ocr' ? 'OCR da verificare' : 'estratto controllato'}</summary><p className="my-2 text-slate-500">D-{page.id.slice(0, 8)}-P{page.page}{page.excerpt ? ' · estratto parziale' : ''}</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap font-sans">{page.text}</pre><button className="mt-2 text-blue-700 underline" disabled={busy || memory?.blocked} onClick={() => setDossier(previous => readQuoteDossier(previous.filter(p => p.id !== page.id || p.page !== page.page)))}>Rimuovi estratto dal dossier</button></details>)}</details>}
        {plan?.localFileMissing && <p role="status" className="mx-4 my-2 text-xs text-orange-800">Dossier ripreso, originale non presente su questo dispositivo. Riallega «{plan.name}» per vedere o analizzare di nuovo l’immagine.</p>}
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,application/pdf,.dwg" aria-label="File planimetria" hidden onChange={e => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (file) void attach(file); }} />
        <div ref={composer} className="quote-chat-compose-region"><QuoteChatComposer value={input} onValueChange={setInput} onSubmit={() => void send()} onStop={stop} busy={busy} disabled={memory?.blocked} real={!simulated} hasPlan={!!plan} hasLines={!!document.lines.length} planningEnabled={planningEnabled} onAttachPlan={() => fileInput.current?.click()} onAction={composerAction} transcribe={transcribeAudio} onEvidence={page => { try { setDossier(upsertQuoteDossier(dossier, page)); return true; } catch (e) { appendDiagnostic({ role: 'assistant', text: (e as Error).message }); return false; } }} /></div>
        <details className="quote-chat-privacy"><summary>Scelte e importi da confermare <span>· Dati e privacy</span></summary><p>{!simulated && 'Invio: messaggi, voci ed estratti pertinenti del dossier a OpenRouter. Analizza immagine invia una copia PNG/JPEG senza metadati; l’originale resta locale. Materiali e audio si controllano nel messaggio prima di inviarli. '}{memory ? 'Salvataggio automatico su questo browser. Dai controlli puoi salvare e riprendere una copia nell’area backend Demo 2 del tuo account, oppure attivarne esplicitamente l’aggiornamento automatico per questa sessione. Nessuna fusione automatica tra dispositivi; file originali esclusi.' : embedded ? 'Usa «Salva e chiudi» per conservare chat, voci e allegati solo in questo browser, separati per account, azienda e preventivo. Non è un salvataggio del preventivo nel gestionale né una sincronizzazione tra dispositivi.' : 'Sessione senza memoria persistente.'} Interrompi scarta la risposta in arrivo; una chiamata già avviata al provider può comunque essere conteggiata. Nessun invio ai clienti.</p></details>
      </section>
      </TabsContent>
      <TabsContent value="lines" forceMount hidden={pane !== "lines"} className="quote-workbench-panel quote-lines-panel">
      {!!document.lines.length && <div className="quote-chat-review"><span>{items.length} incluse · {incomplete} da completare · {awaiting} da confermare</span><button onClick={() => void send("Conferma voci complete")} disabled={busy || memory?.blocked || !awaiting}>Conferma voci complete</button></div>}
      {!document.lines.length && <div className="quote-lines-empty"><h2>Il tuo preventivo, voce per voce</h2><p>Descrivi il progetto a Silvio AI. Qui troverai le lavorazioni proposte e potrai modificare titolo, descrizione, quantità, unità e prezzo.</p><button onClick={() => setPane("chat")}>Inizia dalla chat</button></div>}
      <fieldset disabled={memory?.blocked}><QuoteLineEditor rows={rows} onPatch={(id, patch) => { const { approved, ...rest } = patch; change(patchChatLine(current.current, id, { ...rest, ...(approved == null ? {} : { included: approved }) })); }} onReset={id => change(resetChatLine(current.current, id))} /></fieldset>
      </TabsContent>
      </Tabs>
      {!!undoDepth && <div className="quote-workspace-undo"><span>Ultima modifica alle voci · questa sessione</span><button disabled={busy || memory?.blocked} onClick={() => { const previous = undo.current.pop(); setUndoDepth(undo.current.length); if (!previous) return; const next = { ...previous, revision: current.current.revision + 1 }; current.current = next; setDocument(next); appendDiagnostic({ role: 'assistant', text: 'Ultima modifica al documento annullata. Ripristinati voci e importi precedenti; memoria delle scelte, chat e modello restano invariati.' }); }}>Annulla ultima modifica</button></div>}
      {!embedded && <button className="quote-chat-back" onClick={onBack}>{flow ? 'Torna ai preventivi' : 'Torna alle altre simulazioni locali'}</button>}
    </div><aside>{latestBudget?.preliminaryBudget && <QuotePreliminaryBudget budget={latestBudget.preliminaryBudget} stale={latestBudget.budgetRevision !== document.revision} model={latestBudget.budgetModel} compact />}{!!(estimates.count || estimates.unquantified) && <section className="quote-indicative-summary" aria-label="Stime indicative fuori dal totale"><strong>Stime indicative · non incluse nel documento</strong><p>{estimates.count} voci quantificate: {formatCurrency(estimates.low)}–{formatCurrency(estimates.high)} netti.</p>{!!estimates.unquantified && <p>{estimates.unquantified} stime senza quantità, non sommate.</p>}<small>Intervallo parziale, non prezzo dell’intero progetto. Le altre lavorazioni mancanti non valgono zero; IVA e condizioni da verificare.</small></section>}{embedded ? embedded.preview(document) : nativeBagniDraft ? <QuoteBagniPreview document={document} draft={nativeBagniDraft} project={project} companyId={companyId} companyName={companyName} scheduleScope={scheduleScope} /> : <QuoteTemplateDocument library={templateLibrary} templateId={templateId} companyName={companyName} incomplete={incomplete} awaiting={awaiting} pending={rows.filter(r => !r.included && !r.archived)} focusWork={!!flow} onModels={flow ? undefined : () => { setPane('chat'); void send('Mostra modelli preventivo'); }} onReview={() => setPane('lines')}
      data={{ title: document.title, clientName: classicDraft?.clientName || 'Cliente DEMO', clientAddress: classicDraft?.clientAddress, siteAddress: project.address, date: new Date().toLocaleDateString('it-IT'), taxPending: taxTotal.gross == null, net: taxTotal.net, tax: taxTotal.tax, gross: taxTotal.gross, taxBreakdown: taxTotal.breakdown, globalDiscountPercent: linkedDraft?.discountPercent, displayGross: taxSettings.display === 'gross', commonNotes: documentNotes.notes, scheduleText, paymentMethod: classicDraft?.paymentMethod, paymentPhases: classicDraft?.paymentPhases, rows: items.map((item, index) => ({ id: item.client_temp_id ?? item.id ?? `row-${index}`, name: item.name, description: documentNotes.descriptions.get(item.client_temp_id ?? '') ?? item.description ?? '', quantity: item.quantity, unit: item.unit_of_measure || 'pz', price: item.unit_price, amount: importoRiga(item) })) }} />}</aside></div>
  </main>;
}
