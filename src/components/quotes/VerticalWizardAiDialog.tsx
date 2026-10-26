import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { QuoteChatComposer } from "./dev/QuoteChatComposer";
import { QuoteChatResponse } from "./dev/QuoteChatResponse";
import { createWizardQuoteChatTransport } from "@/lib/preventivi/wizardQuoteTransport";
import { createLocalQuoteAudioTransport, createQuoteAudioTransport } from "@/lib/preventivi/localQuoteAudioTransport";
import { consentiSimulazionePreventivoAi } from "@/lib/preventivi/localSimulation";
import { quoteChatReleaseFlag } from "@/lib/preventivi/quoteRollout";
import { quoteEvidenceMessages } from "@/lib/preventivi/quoteChatContext";
import { prepareQuoteVision } from "@/lib/preventivi/quoteVision";
import { quoteCadEvidence, quoteCadQuestions, type QuoteCadState } from '@/lib/preventivi/quoteCad';
import { createQuoteCadReader } from '@/lib/preventivi/quoteCadTransport';
import { QuoteCadCard } from './dev/QuoteCadCard';
import {
  mergeNativeTurns,
  validateNativeTurn,
  type NativeContext,
  type NativeTurn,
  type NativeOperation,
} from "../../../supabase/functions/_shared/quoteNative";
import {
  quoteTurnIsHypothetical,
  quoteTurnIsReadOnly,
} from "../../../supabase/functions/_shared/quoteScopeMemory";
import type { QuoteChatMessage } from "../../../supabase/functions/_shared/quoteConversation";
import type { QuoteVision } from "../../../supabase/functions/_shared/quoteAdvanced";
import type { QuoteChatTransport } from "@/lib/preventivi/quoteChatDocument";
import "./QuoteWizardAiDialog.css";
import "./dev/QuoteChatComposer.css";

type Message = QuoteChatMessage & {
  choices?: Array<{ id: string; label: string; reply: string }>;
};
const labels: Record<string, string> = {
  title: "Descrizione",
  quantity: "Quantità",
  width: "Larghezza (mm)",
  height: "Altezza (mm)",
  depth: "Profondità (mm)",
  room: "Ambiente",
  material: "Materiale",
  series: "Serie",
  glass: "Vetro",
  opening: "Apertura",
  insideColor: "Colore interno",
  outsideColor: "Colore esterno",
  installationExcluded: "Escludi posa",
  parentId: "Serramento collegato",
  catalogueId: "Voce di listino",
  supplierLineId: "Linea fornitore",
  notes: "Note",
  unit: "Unità",
  panelId: "Pannello",
  inverterId: "Inverter",
  batteryId: "Accumulo",
  kitId: "Kit",
  panelCount: "Numero pannelli",
  withBattery: "Con accumulo",
  withWallbox: "Con wallbox",
  withOptimizers: "Con ottimizzatori",
};
export type VerticalWizardAiProps<T> = {
  title: string;
  companyId: string;
  current: T;
  fingerprint: string;
  onClose: () => void;
  context: (draft: T, query?: string) => NativeContext;
  /** Finché c'è una frase, il campo di scrittura è fermo e la mostra (es. «Carico il listino…»): meglio che far fallire il messaggio. */
  loadingNote?: string | null;
  applyProposal: (
    draft: T,
    proposal: NativeTurn,
    manualPrices: Record<string, number>,
  ) => Promise<T>;
  preview: (draft: T) => ReactNode;
  summary: (draft: T) => ReactNode;
  onCommit: (draft: T) => void | Promise<void>;
  transport?: QuoteChatTransport;
  variants?: (
    draft: T,
    operation: NativeOperation,
  ) => Array<{
    axis: string;
    label: string;
    required: boolean;
    value: string | null;
    choice: string | null;
    values: Array<{ id: string; label: string; choices: string[] }>;
  }>;
};
/** Only technical proposals are accepted here. Prices, VAT, company/model,
 * persistence and final document generation stay owned by the native wizard. */
export default function VerticalWizardAiDialog<T>(
  props: VerticalWizardAiProps<T>,
) {
  const { effectiveCompany, user } = useAuth();
  const [ownerId] = useState(user?.id ?? null);
  const [seed] = useState(() => ({
    draft: structuredClone(props.current),
    fingerprint: props.fingerprint,
    companyId: props.companyId,
  }));
  const [draft, setDraft] = useState(seed.draft),
    [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: `Lavoriamo su **${props.title}**, con il modello già scelto. Descrivi il lavoro o allega un rilievo. Ti proporrò i dati tecnici da verificare; il preventivo originale cambia soltanto dopo la conferma finale.`,
    },
  ]);
  const [pending, setPending] = useState<NativeTurn | null>(null),
    [manual, setManual] = useState<Record<string, number>>({});
  const [undo, setUndo] = useState<{ draft: T; brief: string } | null>(null);
  const [busy, setBusy] = useState(false),
    [applying, setApplying] = useState(false),
    [reviewing, setReviewing] = useState(false),
    [closing, setClosing] = useState(false),
    [error, setError] = useState("");
  const [vision, setVision] = useState<QuoteVision | null>(null),
    [imageName, setImageName] = useState("");
  const [cad, setCad] = useState<QuoteCadState | null>(null);
  const [readingCad, setReadingCad] = useState(false);
  const [visionStatus, setVisionStatus] = useState<
    "ready" | "requested" | "sent"
  >("ready");
  const [lastContext, setLastContext] = useState<NativeContext | null>(null);
  const controller = useRef<AbortController | null>(null),
    revision = useRef(0),
    run = useRef(0),
    writeLock = useRef(false),
    session = useRef(crypto.randomUUID());
  const upload = useRef<HTMLInputElement>(null),
    log = useRef<HTMLDivElement>(null);
  const brief = useRef(""),
    confirmedBrief = useRef(""),
    receipts = useRef<string[]>([]),
    alive = useRef(true);
  const recordAction = (text: string) => {
    receipts.current = [...receipts.current, text.slice(0, 700)].slice(-4);
  };
  const conflict =
    props.fingerprint !== seed.fingerprint ||
    props.companyId !== seed.companyId || effectiveCompany?.id !== seed.companyId ||
    (user?.id ?? null) !== ownerId;
  const endpoint =
    import.meta.env.VITE_QUOTE_CHAT_LOCAL_ENDPOINT ??
    `${window.location.origin}/functions/v1/ai-preventivo-conversazione`;
  const getToken = useCallback(async () => {
    if (!ownerId) return null;
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user.id === ownerId ? session.access_token : null;
  }, [ownerId]);
  const transport = useMemo(
    () =>
      props.transport ??
      createWizardQuoteChatTransport({
        localEndpoint: endpoint,
        backendUrl: import.meta.env.VITE_SUPABASE_URL,
        companyId: props.companyId,
        dev: import.meta.env.DEV,
        hostname: window.location.hostname,
        productionEnabled: quoteChatReleaseFlag(),
        getToken,
        publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      }),
    [props.transport, endpoint, getToken, props.companyId],
  );
  const transcribe = useMemo(
    () =>
      consentiSimulazionePreventivoAi(import.meta.env.DEV, window.location.hostname, props.companyId) ? createLocalQuoteAudioTransport({
        endpoint,
        companyId: props.companyId,
        getToken,
        publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      }) : createQuoteAudioTransport({backendUrl:import.meta.env.VITE_SUPABASE_URL,companyId:props.companyId,getToken,publishableKey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}),
    [endpoint, props.companyId, getToken],
  );
  const cadReader = useMemo(() => createQuoteCadReader({ companyId: props.companyId, dev: import.meta.env.DEV, hostname: window.location.hostname,
    enabled: import.meta.env.VITE_QUOTE_CAD_ENABLED, endpoint: import.meta.env.VITE_QUOTE_CAD_ENDPOINT, getToken }), [props.companyId, getToken]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (conflict) {
      run.current++;
      controller.current?.abort();
    }
  }, [conflict]);
  useEffect(() => {
    log.current?.scrollTo?.({
      top: log.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, pending]);
  const { preview } = props;
  const livePreview = useMemo(() => preview(draft), [draft, preview]);
  const changed = JSON.stringify(seed.draft) !== JSON.stringify(draft);
  const stop = () => {
    run.current++;
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setReadingCad(false);
  };
  const send = async (text = input, withImage = false) => {
    if (
      !text.trim() ||
      text.length > 3000 ||
      controller.current ||
      writeLock.current ||
      conflict
    )
      return;
    if (cad && /^Usa stato di (?:fatto|progetto) del DWG$/i.test(text.trim())) {
      setCad({ ...cad, selectedState: /progetto/i.test(text) ? 'project' : 'existing' });
      setInput(''); setMessages(m => [...m, { role: 'user', text }, { role: 'assistant', text: 'Riferimento registrato. Indica la porzione e i dati tecnici da preventivare: nessuna misura o componente è stato confermato automaticamente.' }]); return;
    }
    const ctrl = new AbortController(),
      generation = ++run.current,
      currentRevision = revision.current;
    controller.current = ctrl;
    setBusy(true);
    setError("");
    setInput("");
    const history: QuoteChatMessage[] = messages
      .slice(-7)
      .map(({ role, text }) => ({ role, text }));
    history.push({ role: "user", text });
    setMessages((m) => [...m, { role: "user", text }]);
    try {
      const baseContext = props.context(draft, text);
      const context = {
          ...baseContext,
          current: [
            ...baseContext.current,
            ...(pending?.operations
              .filter(
                (op) =>
                  op.action === "upsert" &&
                  !baseContext.current.some((r) => r.id === op.id),
              )
              .map((op) => ({ id: op.id, kind: op.kind, fields: op.fields })) ??
              []),
          ],
        },
        evidence: string[] = [...receipts.current];
      if (cad) evidence.push(quoteCadEvidence(cad, text));
      if (pending) {
        const json = JSON.stringify(pending);
        if (json.length > 20000)
          throw new Error(
            "Rivedi la proposta tecnica prima di avviare un altro gruppo di lavorazioni.",
          );
        for (let i = 0; i < json.length; i += 2700)
          evidence.push(
            `PROPOSTA TECNICA ANCORA NON APPLICATA, parte ${Math.floor(i / 2700) + 1}: ${json.slice(i, i + 2700)}`,
          );
      }
      const turnId = crypto.randomUUID();
      if (withImage && vision) setVisionStatus("requested");
      const result = await transport(
        {
          version: 1,
          companyId: props.companyId,
          sessionId: session.current,
          turnId,
          revision: currentRevision,
          sourceId: null,
          messages: quoteEvidenceMessages(history, evidence),
          lines: [],
          nativeContext: context,
          advanced: {
            model: "anthropic/claude-sonnet-5.5",
            mode: "conversation",
            ...(withImage && vision ? { vision } : {}),
          },
          context: {
            brief: brief.current,
            protectedLineIds: [],
            plan:
              withImage && vision
                ? {
                    attachmentId: vision.attachmentId,
                    page: vision.page,
                    pages: vision.page,
                    texts: [],
                    rooms: [],
                    selectedRoom: null,
                    rectangle: null,
                  }
                : null,
          },
        },
        ctrl.signal,
      );
      if (
        ctrl.signal.aborted ||
        run.current !== generation ||
        currentRevision !== revision.current
      )
        return;
      if (withImage && vision) setVisionStatus("sent");
      if (
        result.turnId !== turnId ||
        result.revision !== currentRevision ||
        result.turn.proposals.length ||
        result.turn.searches.length
      )
        throw new Error(
          "Risposta non coerente con il configuratore. Bozza invariata.",
        );
      if (result.turn.nativeTurn === undefined)
        throw new Error(
          "Endpoint locale non aggiornato per questo configuratore. Nessuna proposta importata.",
        );
      const readOnly =
        quoteTurnIsReadOnly(text) || quoteTurnIsHypothetical(text);
      // New rows from a still-pending proposal may be completed in a follow-up.
      const enriched = {
        ...context,
        current: [
          ...context.current,
          ...(pending?.operations
            .filter(
              (op) =>
                op.action === "upsert" &&
                !context.current.some((r) => r.id === op.id),
            )
            .map((op) => ({ id: op.id, kind: op.kind, fields: op.fields })) ??
            []),
        ],
      };
      validateNativeTurn(result.turn.nativeTurn, enriched, readOnly);
      if (!readOnly) {
        const merged = mergeNativeTurns(
          pending,
          result.turn.nativeTurn,
          new Set(baseContext.current.map((r) => r.id)),
        );
        setPending(merged?.operations.length ? merged : null);
        setManual((values) => {
          const next = { ...values };
          for (const op of result.turn.nativeTurn?.operations ?? [])
            if (
              op.action === "remove" ||
              op.axes.length ||
              op.fields.some((f) => !["title", "room", "notes"].includes(f.key))
            )
              delete next[op.id];
          return next;
        });
        setLastContext(context);
        brief.current = result.turn.brief;
      }
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: [
            result.turn.message,
            ...result.turn.questions.map((q) => `\n${q}`),
          ].join("\n"),
          choices: result.turn.choices,
        },
      ]);
    } catch (e) {
      if (generation === run.current && !ctrl.signal.aborted) {
        setError((e as Error).message);
        setInput((value) => (value.trim() ? value : text));
      }
    } finally {
      if (controller.current === ctrl) {
        controller.current = null;
        if (alive.current) setBusy(false);
      }
    }
  };
  const accept = async () => {
    if (!pending || writeLock.current || busy || controller.current || conflict)
      return;
    const generation = ++run.current;
    writeLock.current = true;
    setApplying(true);
    setError("");
    try {
      const next = await props.applyProposal(
        structuredClone(draft),
        pending,
        manual,
      );
      if (!alive.current || generation !== run.current) return;
      setUndo({ draft: structuredClone(draft), brief: confirmedBrief.current });
      confirmedBrief.current = brief.current;
      setDraft(next);
      setReviewing(false);
      revision.current++;
      setPending(null);
      setManual({});
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "Dati tecnici aggiornati nella **bozza di lavoro** e nell’anteprima. Il wizard originale è ancora invariato: puoi continuare oppure rivedere e applicare le modifiche.",
        },
      ]);
    } catch (e) {
      if (alive.current && generation === run.current)
        setError((e as Error).message);
    } finally {
      writeLock.current = false;
      if (alive.current) setApplying(false);
    }
  };
  const undoLastChange = () => {
    if (!undo || pending || controller.current || writeLock.current || conflict)
      return;
    setDraft(structuredClone(undo.draft));
    brief.current = confirmedBrief.current = undo.brief;
    revision.current++;
    setUndo(null);
    setReviewing(false);
    setError("");
    recordAction(
      "L’utente ha annullato l’ultima applicazione tecnica. Il contesto corrente è quello ripristinato; non reintrodurre le modifiche annullate senza una nuova richiesta esplicita.",
    );
    setMessages((m) => [
      ...m,
      {
        role: "assistant",
        text: "Ultima modifica **annullata nella bozza**. Ho ripristinato i dati tecnici precedenti; il wizard originale resta invariato.",
      },
    ]);
  };
  const commit = async () => {
    if (!changed || pending || busy || conflict || writeLock.current) return;
    writeLock.current = true;
    setApplying(true);
    setError("");
    try {
      await props.onCommit(structuredClone(draft));
      props.onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      writeLock.current = false;
      setApplying(false);
    }
  };
  const attach = async (file: File) => {
    if (controller.current || writeLock.current || conflict) return;
    const ctrl = new AbortController(),
      generation = ++run.current;
    controller.current = ctrl;
    setBusy(true);
    setError("");
    try {
      // readCadLocally verifies the actual magic bytes before the conversion.
      const isCad = /\.dwg$/i.test(file.name);
      if (ctrl.signal.aborted || generation !== run.current) return;
      if (isCad) {
        if (vision) throw new Error('Rimuovi prima l’immagine allegata, per non confondere fonti e misure.');
        setReadingCad(true);
        const reading = await cadReader(file, ctrl.signal);
        if (ctrl.signal.aborted || generation !== run.current || !alive.current) return;
        if (cad && cad.reading.id !== reading.id) throw new Error('La chat contiene già un altro DWG. Chiudi e riapri la bozza di lavoro prima di sostituirlo.');
        setCad({ reading, selectedState: cad?.selectedState ?? 'unknown' });
        setMessages(m => [...m, { role: 'user', text: `Leggi il DWG «${reading.name}».` }, { role: 'assistant', text: `**DWG letto ${reading.processedBy === 'service' ? 'dal convertitore dedicato' : 'in locale'}.** ${reading.totalTexts} testi, ${reading.layers.length} layer riportati. Misure, componenti e prezzi non sono confermati.\n\n${quoteCadQuestions(reading).join('\n\n')}` }]);
        return;
      }
      if (cad) throw new Error('Questa chat contiene un DWG. Chiudi e riapri la bozza di lavoro prima di sostituirlo con un’immagine.');
      const prepared = await prepareQuoteVision(
        file,
        crypto.randomUUID(),
        1,
        ctrl.signal,
      );
      if (run.current === generation && !ctrl.signal.aborted) {
        setVision(prepared);
        setImageName(file.name);
        setVisionStatus("ready");
      }
    } catch (e) {
      if (run.current === generation && !ctrl.signal.aborted)
        setError((e as Error).message);
    } finally {
      if (controller.current === ctrl) {
        controller.current = null;
        if (alive.current) { setBusy(false); setReadingCad(false); }
      }
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !writeLock.current) setClosing(true);
      }}
    >
      <DialogContent
        className="quote-wizard-ai-dialog p-0"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <header className="quote-wizard-ai-title">
          <div>
            <DialogTitle>Silvio AI · {props.title}</DialogTitle>
            <DialogDescription>
              Configuratore originale, dati tecnici completi e stesso modello
              del preventivo.
            </DialogDescription>
          </div>
          <span className="quote-wizard-ai-badge">Bozza di lavoro</span>
        </header>
        {conflict ? (
          <p role="alert" className="quote-wizard-ai-alert">
            Account, azienda o preventivo cambiati: chiudi e riapri la chat. Nessuna
            modifica applicabile.
          </p>
        ) : (
          <fieldset
            disabled={applying}
            className="quote-wizard-ai-body min-w-0 p-4"
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,1fr)]">
              <section
                className="chat-only-workspace flex min-w-0 flex-col rounded-2xl border bg-white"
                aria-label="Chat tecnica del preventivo"
              >
                <div
                  ref={log}
                  role="log"
                  aria-label="Conversazione tecnica"
                  className="min-h-[280px] flex-1 space-y-5 overflow-auto p-5"
                  style={{
                    height: "calc(100dvh - 350px)",
                    maxHeight: "calc(100dvh - 350px)",
                  }}
                >
                  {messages.map((m, i) => (
                    <article
                      key={i}
                      className={
                        m.role === "user"
                          ? "ml-10 rounded-2xl bg-blue-50 p-4"
                          : "text-slate-800"
                      }
                    >
                      <small className="mb-2 block text-xs text-slate-500">
                        {m.role === "user" ? "Tu" : "Silvio AI"}
                      </small>
                      <QuoteChatResponse content={m.text} />
                      {i === messages.length - 1 &&
                        m.choices?.map((c) => (
                          <Button
                            key={c.id}
                            variant="outline"
                            className="mr-2 mt-3 rounded-full"
                            disabled={busy || applying}
                            onClick={() => void send(c.reply)}
                          >
                            {c.label}
                          </Button>
                        ))}
                    </article>
                  ))}
                  {cad && <QuoteCadCard cad={cad} disabled={busy || applying || conflict} onAction={text => void send(text)} />}
                  {pending && (
                    <section
                      aria-label="Proposta tecnica da confermare"
                      className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4"
                    >
                      <fieldset
                        disabled={busy || applying}
                        className="min-w-0 space-y-3"
                      >
                        <strong>Rivedi i dati tecnici proposti</strong>
                        {pending.operations.map((op, index) => (
                          <details
                            key={op.id}
                            open
                            className="rounded-lg border bg-white p-3"
                          >
                            <summary className="cursor-pointer font-medium">
                              {op.action === "remove" ? "Rimuovi" : "Aggiorna"}{" "}
                              · {op.kind} ·{" "}
                              {String(
                                op.fields.find((f) => f.key === "title")
                                  ?.value ?? op.id,
                              )}
                            </summary>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              {op.fields.map((f, field) => {
                                const ctx = lastContext ?? props.context(draft),
                                  choices =
                                    f.key === "parentId"
                                      ? [...ctx.current, ...pending.operations]
                                          .filter(
                                            (r) => r.kind === "serramento",
                                          )
                                          .map((r) => ({
                                            id: r.id,
                                            label: String(
                                              r.fields.find(
                                                (v) => v.key === "title",
                                              )?.value ?? "Serramento",
                                            ),
                                          }))
                                      : /Id$/.test(f.key)
                                        ? ctx.catalogue.filter((c) =>
                                            f.key === "catalogueId"
                                              ? c.kind === op.kind ||
                                                c.kind === "famiglia"
                                              : f.key === "supplierLineId"
                                                ? c.kind === "supplierLine"
                                                : c.kind ===
                                                  (
                                                    {
                                                      panelId: "pannello",
                                                      inverterId: "inverter",
                                                      batteryId: "accumulo",
                                                      kitId: "kit",
                                                    } as Record<string, string>
                                                  )[f.key],
                                          )
                                        : null;
                                const update = (value: string) => {
                                  if (
                                    controller.current ||
                                    writeLock.current ||
                                    conflict
                                  )
                                    return;
                                  const next = structuredClone(pending);
                                  next.operations[index].fields[field].value =
                                    typeof f.value === "boolean"
                                      ? value === "true"
                                      : [
                                            "quantity",
                                            "width",
                                            "height",
                                            "depth",
                                            "panelCount",
                                          ].includes(f.key)
                                        ? value === ""
                                          ? null
                                          : Number(value)
                                        : value || null;
                                  setPending(next);
                                  setManual((v) => {
                                    const n = { ...v };
                                    delete n[op.id];
                                    return n;
                                  });
                                };
                                return (
                                  <label
                                    key={f.key}
                                    className="text-xs text-slate-500"
                                  >
                                    {labels[f.key] ?? f.key}
                                    {choices || typeof f.value === "boolean" ? (
                                      <select
                                        aria-label={`${op.id} ${f.key}`}
                                        className="mt-1 w-full rounded-md border p-2 text-sm text-slate-900"
                                        value={
                                          f.value == null ? "" : String(f.value)
                                        }
                                        onChange={(e) => update(e.target.value)}
                                      >
                                        {choices ? (
                                          <>
                                            <option value="">
                                              Da definire / nessuno
                                            </option>
                                            {[
                                              ...new Map(
                                                choices.map((c) => [c.id, c]),
                                              ).values(),
                                            ].map((c) => (
                                              <option key={c.id} value={c.id}>
                                                {c.label}
                                              </option>
                                            ))}
                                          </>
                                        ) : (
                                          <>
                                            <option value="true">Sì</option>
                                            <option value="false">No</option>
                                          </>
                                        )}
                                      </select>
                                    ) : (
                                      <input
                                        aria-label={`${op.id} ${f.key}`}
                                        className="mt-1 w-full rounded-md border p-2 text-sm text-slate-900"
                                        value={
                                          f.value == null ? "" : String(f.value)
                                        }
                                        onChange={(e) => update(e.target.value)}
                                      />
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                            {props.variants && op.action !== "remove" && (
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                {props.variants(draft, op).map((axis) => {
                                  const change = (
                                    value: string,
                                    choice: string | null,
                                  ) => {
                                    if (
                                      controller.current ||
                                      writeLock.current ||
                                      conflict
                                    )
                                      return;
                                    const next = structuredClone(pending);
                                    next.operations[index].axes = [
                                      ...next.operations[index].axes.filter(
                                        (a) => a.axis !== axis.axis,
                                      ),
                                      { axis: axis.axis, value, choice },
                                    ];
                                    setPending(next);
                                    setManual((prices) => {
                                      const n = { ...prices };
                                      delete n[op.id];
                                      return n;
                                    });
                                  };
                                  const choices =
                                    axis.values.find((v) => v.id === axis.value)
                                      ?.choices ?? [];
                                  return (
                                    <div key={axis.axis}>
                                      <label className="block text-xs text-slate-500">
                                        {axis.label}
                                        {axis.required ? " *" : ""}
                                        <select
                                          aria-label={`${op.id} variante ${axis.label}`}
                                          className="mt-1 w-full rounded border p-2 text-sm text-slate-900"
                                          value={axis.value ?? ""}
                                          onChange={(e) =>
                                            change(e.target.value, null)
                                          }
                                        >
                                          <option value="" disabled>
                                            Da scegliere
                                          </option>
                                          {axis.values.map((v) => (
                                            <option key={v.id} value={v.id}>
                                              {v.label}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      {choices.length > 0 && (
                                        <label className="mt-2 block text-xs text-slate-500">
                                          Dettaglio {axis.label}
                                          <select
                                            aria-label={`${op.id} scelta ${axis.label}`}
                                            className="mt-1 w-full rounded border p-2 text-sm text-slate-900"
                                            value={axis.choice ?? ""}
                                            onChange={(e) =>
                                              change(
                                                axis.value!,
                                                e.target.value,
                                              )
                                            }
                                          >
                                            <option value="" disabled>
                                              Da confermare
                                            </option>
                                            {choices.map((c) => (
                                              <option key={c} value={c}>
                                                {c}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {!props.variants && op.axes.length > 0 && (
                              <p className="mt-2 text-xs text-slate-600">
                                Varianti:{" "}
                                {op.axes
                                  .map(
                                    (a) => `${a.axis}: ${a.choice ?? a.value}`,
                                  )
                                  .join(" · ")}
                                . Puoi correggerle rispondendo in chat.
                              </p>
                            )}
                            {op.action !== "remove" &&
                              op.kind !== "configurazione" && (
                                <label className="mt-3 block text-xs text-slate-500">
                                  Prezzo unitario manuale · facoltativo, IVA
                                  esclusa
                                  <input
                                    aria-label={`Prezzo manuale ${op.id}`}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="ml-2 w-28 rounded border p-2"
                                    value={manual[op.id] ?? ""}
                                    onChange={(e) => {
                                      if (
                                        controller.current ||
                                        writeLock.current ||
                                        conflict
                                      )
                                        return;
                                      setManual((values) => {
                                        const next = { ...values };
                                        if (e.target.value === "")
                                          delete next[op.id];
                                        else
                                          next[op.id] = Number(e.target.value);
                                        return next;
                                      });
                                    }}
                                  />
                                </label>
                              )}
                            {op.action === "remove" && (
                              <p className="mt-2 text-xs text-orange-700">
                                La rimozione viene riepilogata prima della
                                conferma finale; controlla anche gli accessori
                                collegati.
                              </p>
                            )}
                          </details>
                        ))}
                        <Button
                          disabled={busy || applying}
                          onClick={() => void accept()}
                        >
                          Conferma proposta nella bozza
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busy || applying}
                          onClick={() => {
                            if (
                              controller.current ||
                              writeLock.current ||
                              conflict
                            )
                              return;
                            recordAction(
                              `Proposta tecnica scartata dall’utente, non applicata: ${pending.operations.map((op) => op.id).join(", ")}. Non riproporla senza una nuova richiesta esplicita.`,
                            );
                            setPending(null);
                            setManual({});
                            brief.current = confirmedBrief.current;
                            setMessages((m) => [
                              ...m,
                              {
                                role: "assistant",
                                text: "Proposta **scartata**. La bozza e il preventivo originale non sono stati modificati.",
                              },
                            ]);
                          }}
                        >
                          Scarta proposta
                        </Button>
                      </fieldset>
                    </section>
                  )}
                  {busy && (
                    <p
                      role="status"
                      className="animate-pulse text-sm text-blue-800"
                    >
                      {readingCad ? 'Leggo il DWG sul computer. Nessuna chiamata AI.' : 'Silvio sta analizzando i dati tecnici…'}
                    </p>
                  )}
                </div>
                <div className="border-t p-3">
                  {vision && (
                    <div className="mb-2 flex items-center gap-3 text-xs">
                      <span>
                        {imageName} · pagina 1 ·{" "}
                        {visionStatus === "ready"
                          ? "non ancora inviata"
                          : visionStatus === "requested"
                            ? "analisi richiesta"
                            : "inviata per l’analisi"}
                      </span>
                      <button
                        onClick={() => {
                          setVision(null);
                          setImageName("");
                        }}
                        disabled={busy}
                      >
                        Rimuovi
                      </button>
                    </div>
                  )}
                  <input
                    ref={upload}
                    type="file"
                    accept="image/png,image/jpeg,application/pdf,.dwg"
                    className="hidden"
                    aria-label="Allega rilievo tecnico"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void attach(file);
                      e.target.value = "";
                    }}
                  />
                  {props.loadingNote && (
                    <p role="status" className="px-1 pb-1 text-xs text-muted-foreground">
                      {props.loadingNote}
                    </p>
                  )}
                  <QuoteChatComposer
                    value={input}
                    busy={busy}
                    disabled={applying || conflict || !!props.loadingNote}
                    real
                    hasPlan={!!vision}
                    hasLines={changed}
                    onValueChange={setInput}
                    onSubmit={() => void send()}
                    onStop={stop}
                    onAttachPlan={() => upload.current?.click()}
                    transcribe={transcribe}
                    onAction={(action) => {
                      if (action === "vision" && vision)
                        void send(
                          input.trim() ||
                            "Analizza il rilievo allegato e chiedimi i dati tecnici mancanti prima di proporre il preventivo.",
                          true,
                        );
                      else
                        setMessages((m) => [
                          ...m,
                          {
                            role: "assistant",
                            text: "Qui lavoriamo sui dati tecnici. Cliente, IVA, condizioni, cronoprogramma e calcolo economico restano nei rispettivi passi del wizard. Puoi chiedermi spiegazioni e alternative in chat.",
                          },
                        ]);
                    }}
                  />
                </div>
              </section>
              <aside className="min-w-0">{livePreview}</aside>
            </div>
          </fieldset>
        )}
        {reviewing && (
          <section
            className="quote-wizard-ai-review"
            aria-label="Confronto tecnico prima di applicare"
          >
            <h3>Modifiche al configuratore originale</h3>
            {props.summary(draft)}
          </section>
        )}
        {error && (
          <p role="alert" className="quote-wizard-ai-alert">
            {error}
          </p>
        )}
        <footer className="quote-wizard-ai-footer">
          {closing ? (
            <>
              <p>
                Scartare la bozza di lavoro? Il wizard originale resta
                invariato.
              </p>
              <Button variant="outline" onClick={() => setClosing(false)}>
                Continua
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  stop();
                  props.onClose();
                }}
              >
                Scarta e chiudi
              </Button>
            </>
          ) : (
            <>
              <p>
                {changed
                  ? "Modifiche solo nella bozza di lavoro"
                  : "Nessuna modifica al preventivo originale"}
              </p>
              <Button
                disabled={applying}
                variant="outline"
                onClick={() => setClosing(true)}
              >
                Chiudi
              </Button>
              {reviewing && (
                <Button variant="ghost" onClick={() => setReviewing(false)}>
                  Torna alla chat
                </Button>
              )}
              {undo && (
                <Button
                  variant="ghost"
                  disabled={!!pending || busy || applying || conflict}
                  onClick={undoLastChange}
                >
                  Annulla ultima modifica
                </Button>
              )}
              <Button
                disabled={!changed || !!pending || busy || applying || conflict}
                onClick={() => (reviewing ? void commit() : setReviewing(true))}
              >
                {applying
                  ? "Applico…"
                  : reviewing
                    ? "Conferma e applica al wizard"
                    : "Rivedi e applica"}
              </Button>
            </>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
