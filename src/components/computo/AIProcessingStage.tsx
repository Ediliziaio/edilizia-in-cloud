/**
 * AIProcessingStage — UI animata per la fase di estrazione AI di un computo.
 *
 * Sostituisce lo Step 3 "spinner + progress" con:
 *   1. Pipeline timeline (5 fasi) — icone che si attivano in sequenza
 *   2. Icona centrale animata (sparkles + document) con glow pulsante
 *   3. Contatore tempo reale + ETA adattivo (~18s baseline misurato in produzione)
 *   4. Tips contestuali che ruotano ogni 3s
 *   5. Progress bar con effetto shimmer
 *
 * Motion library: framer-motion (già in deps). Tutto self-contained.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CloudUpload,
  FileSearch,
  BrainCircuit,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Sparkles,
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ComputoExtractionStatus } from "@/types/computo";

// ───────────────────────────────────────────────────────────────────────────
// Pipeline phases ordinate. Pesi % derivati da telemetry reale (~18s totale,
// AI ~70% del tempo).
// ───────────────────────────────────────────────────────────────────────────
type Phase = {
  key: ComputoExtractionStatus;
  label: string;
  icon: typeof CloudUpload;
  weight: number;
};

const PHASES: Phase[] = [
  { key: "uploading",       label: "Caricamento",       icon: CloudUpload,  weight: 8  },
  { key: "extracting_text", label: "Lettura testo",     icon: FileSearch,   weight: 12 },
  { key: "analyzing_ai",    label: "Analisi AI",        icon: BrainCircuit, weight: 65 },
  { key: "validating",      label: "Validazione",       icon: ShieldCheck,  weight: 10 },
  { key: "review",          label: "Pronto",            icon: CheckCircle2, weight: 5  },
];

// Tempo medio osservato in field-validation: PDF 3 pagine = 17.7s
// Stima conservativa che si adatta a file più grandi.
const ETA_BASELINE_MS = 18_000;

const TIPS_BY_PHASE: Record<string, string[]> = {
  uploading: [
    "Sto caricando il file in modo sicuro (cifrato in transito)…",
    "Multi-tenancy attiva: i tuoi dati restano isolati nella tua azienda.",
  ],
  extracting_text: [
    "Estraggo il testo grezzo dal documento PDF…",
    "Riconosco struttura, intestazioni, numerazione voci.",
    "Per i PDF scansionati attivo OCR/Vision se serve.",
  ],
  analyzing_ai: [
    "L'AI identifica voci, quantità e prezzi unitari…",
    "Sto confrontando con i prezzari di mercato Italia 2025-2026.",
    "Riconosco capitoli, sub-voci e categorie merceologiche.",
    "Calcolo confidence per ogni voce estratta.",
    "Verifico coerenza tra subtotali parziali e totale dichiarato.",
  ],
  validating: [
    "Cross-check tra somma voci e totale del computo…",
    "Segnalo eventuali anomalie o voci sotto-prezzo.",
  ],
  review: [
    "Tutto pronto: ora puoi rivedere ed editare le voci.",
  ],
};

interface Props {
  status: ComputoExtractionStatus | null;
  progress: string;
  error: string | null;
  onRetry: () => void;
  onCancel?: () => void;
  /** Fix 8: nodo React opzionale che sostituisce il bottone Annulla default
   * (usato da ComputoUploadModal per inserire un AlertDialog di conferma). */
  cancelButton?: React.ReactNode;
}

/** Fix 19: mappa errori tecnici → messaggi leggibili dall'utente */
const ERROR_MESSAGES: Record<string, { title: string; hint: string }> = {
  corrupted: {
    title: "File danneggiato o non leggibile",
    hint: "Prova a riesportare il PDF dall'applicazione originale (senza protezione).",
  },
  unsupported: {
    title: "Formato non supportato",
    hint: "Usa PDF, Excel (.xlsx) o XPWE. Immagini: JPG o PNG.",
  },
  timeout: {
    title: "Tempo di elaborazione superato",
    hint: "Il file potrebbe essere troppo grande o complesso. Prova con un file ridotto.",
  },
  no_text: {
    title: "Testo non rilevato nel documento",
    hint: "Il documento potrebbe essere solo immagini. Usa la modalità 'Da Foto'.",
  },
  empty: {
    title: "Nessuna voce trovata nel documento",
    hint: "Verifica che il file contenga un computo metrico con prezzi e quantità.",
  },
  rate_limit: {
    title: "Troppi documenti in elaborazione",
    hint: "Riprova tra qualche istante.",
  },
};

function friendlyError(raw: string | null): { title: string; hint: string } {
  if (!raw) return { title: "Errore sconosciuto", hint: "Riprova o contatta il supporto." };
  const lower = raw.toLowerCase();
  for (const [key, msg] of Object.entries(ERROR_MESSAGES)) {
    if (lower.includes(key)) return msg;
  }
  return { title: "Errore durante l'estrazione", hint: raw };
}

export function AIProcessingStage({ status, progress, error, onRetry, onCancel, cancelButton }: Props) {
  const isFailed = status === "failed";
  const startedAtRef = useRef<number>(Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);

  // ── Timer 1Hz ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isFailed) return;
    const id = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 250);
    return () => clearInterval(id);
  }, [isFailed]);

  // ── Tip rotator ──────────────────────────────────────────────────────────
  const phaseTips = TIPS_BY_PHASE[status ?? "uploading"] ?? TIPS_BY_PHASE.uploading;
  useEffect(() => {
    setTipIdx(0);
    if (isFailed) return;
    const id = setInterval(() => setTipIdx((i) => (i + 1) % phaseTips.length), 3200);
    return () => clearInterval(id);
  }, [status, phaseTips.length, isFailed]);

  // ── Phase index + cumulative weight ──────────────────────────────────────
  const phaseIdx = useMemo(() => {
    if (!status || status === "failed") return 0;
    const i = PHASES.findIndex((p) => p.key === status);
    return i < 0 ? 0 : i;
  }, [status]);

  const cumulativeWeight = useMemo(() => {
    let w = 0;
    for (let i = 0; i < phaseIdx; i++) w += PHASES[i].weight;
    return w;
  }, [phaseIdx]);

  // Progresso reale combinato: pesi delle fasi completate +
  // progresso *temporale* dentro la fase corrente (riempie smooth fino a max).
  const intraPhaseRatio = useMemo(() => {
    const phaseStartMs = (cumulativeWeight / 100) * ETA_BASELINE_MS;
    const phaseDurMs = (PHASES[phaseIdx].weight / 100) * ETA_BASELINE_MS;
    const intra = (elapsedMs - phaseStartMs) / phaseDurMs;
    // Cap al 92% per non "ingannare" l'utente: l'ultimo 8% si conquista col passaggio reale di stato.
    return Math.max(0, Math.min(0.92, intra));
  }, [elapsedMs, cumulativeWeight, phaseIdx]);

  const progressPct = Math.min(
    100,
    cumulativeWeight + PHASES[phaseIdx].weight * intraPhaseRatio
  );

  const elapsedSec = Math.floor(elapsedMs / 1000);
  const etaRemainingMs = Math.max(0, ETA_BASELINE_MS - elapsedMs);
  const etaRemainingSec = Math.ceil(etaRemainingMs / 1000);
  const isOvertime = elapsedMs > ETA_BASELINE_MS;

  // ─────────────────────────────────────────────────────────────────────────
  // Fix 19: messaggio di errore leggibile
  const errInfo = friendlyError(error);

  if (isFailed) {
    return (
      <div className="space-y-6 py-6">
        <div className="text-center">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", duration: 0.5 }}
          >
            <XCircle className="h-14 w-14 mx-auto text-red-500 mb-3" />
          </motion.div>
          <p className="text-base font-semibold text-red-600">{errInfo.title}</p>
          <p className="text-xs text-muted-foreground mt-2 max-w-md mx-auto">{errInfo.hint}</p>
          {errInfo.hint !== error && error && (
            <details className="mt-2 text-[10px] text-muted-foreground">
              <summary className="cursor-pointer">Dettaglio tecnico</summary>
              <p className="mt-1 font-mono break-all">{error}</p>
            </details>
          )}
        </div>
        <div className="flex justify-center gap-2">
          {cancelButton ?? (onCancel ? <Button variant="outline" onClick={onCancel}>Chiudi</Button> : null)}
          <Button onClick={onRetry}>
            <RotateCw className="h-4 w-4 mr-1" /> Riprova
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-2">
      {/* ── HERO: Icona centrale animata ─────────────────────────────────── */}
      <div className="relative h-32 flex items-center justify-center">
        {/* Glow pulsante */}
        <motion.div
          className="absolute h-28 w-28 rounded-full bg-orange-300/30 blur-2xl"
          animate={{ scale: [1, 1.25, 1], opacity: [0.45, 0.75, 0.45] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Anello rotante */}
        <motion.div
          className="absolute h-24 w-24 rounded-full border-2 border-orange-400/40 border-t-orange-500"
          animate={{ rotate: 360 }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "linear" }}
        />
        {/* Icona fase corrente con cross-fade */}
        <AnimatePresence mode="wait">
          <motion.div
            key={status ?? "init"}
            initial={{ scale: 0.6, opacity: 0, rotateY: -90 }}
            animate={{ scale: 1, opacity: 1, rotateY: 0 }}
            exit={{ scale: 0.6, opacity: 0, rotateY: 90 }}
            transition={{ duration: 0.4 }}
            className="relative z-10 h-14 w-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shadow-lg shadow-orange-300/40"
          >
            {(() => {
              const Icon = PHASES[phaseIdx].icon;
              return <Icon className="h-7 w-7 text-white" strokeWidth={2.4} />;
            })()}
          </motion.div>
        </AnimatePresence>
        {/* Sparkles flottanti */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute"
            initial={{
              x: 0, y: 0, opacity: 0, scale: 0.5,
            }}
            animate={{
              x: [0, (i - 1) * 50, (i - 1) * 70],
              y: [0, -30 - i * 10, -60 - i * 15],
              opacity: [0, 1, 0],
              scale: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.6,
              ease: "easeOut",
            }}
          >
            <Sparkles className="h-3 w-3 text-amber-400" fill="currentColor" />
          </motion.div>
        ))}
      </div>

      {/* ── Pipeline timeline ────────────────────────────────────────────── */}
      <div className="px-1">
        <div className="flex items-start justify-between gap-1">
          {PHASES.map((phase, i) => {
            const Icon = phase.icon;
            const state =
              i < phaseIdx ? "done" : i === phaseIdx ? "active" : "pending";
            return (
              <div key={phase.key} className="flex-1 flex flex-col items-center min-w-0">
                <motion.div
                  className={`h-9 w-9 rounded-full flex items-center justify-center border-2 transition-colors ${
                    state === "done"
                      ? "bg-green-500 border-green-500 text-white"
                      : state === "active"
                      ? "bg-orange-500 border-orange-500 text-white"
                      : "bg-slate-100 border-slate-200 text-slate-400"
                  }`}
                  animate={
                    state === "active"
                      ? { boxShadow: [
                          "0 0 0 0 rgba(249,115,22,0.55)",
                          "0 0 0 10px rgba(249,115,22,0)",
                        ] }
                      : {}
                  }
                  transition={{ duration: 1.4, repeat: Infinity }}
                >
                  {state === "done" ? (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 15 }}
                    >
                      <CheckCircle2 className="h-5 w-5" strokeWidth={2.6} />
                    </motion.div>
                  ) : (
                    <Icon className="h-4 w-4" strokeWidth={2.2} />
                  )}
                </motion.div>
                <p
                  className={`text-[10px] mt-1.5 text-center leading-tight ${
                    state === "pending" ? "text-slate-400" : "text-slate-700 font-medium"
                  }`}
                >
                  {phase.label}
                </p>
              </div>
            );
          })}
        </div>
        {/* Linea connettore sotto i pallini */}
        <div className="relative h-0.5 bg-slate-100 rounded-full -mt-9 mx-5 z-[-1]">
          <motion.div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-500 via-orange-500 to-orange-300 rounded-full"
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* ── Progress bar con shimmer ─────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-orange-500 to-amber-400 rounded-full"
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
          {/* Shimmer overlay */}
          <motion.div
            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent"
            animate={{ x: ["-100%", "300%"] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
          <span>{Math.round(progressPct)}%</span>
          {/* Fix 11: ETA come range invece di valore puntuale */}
          <span>
            {elapsedSec}s trascorsi
            {!isOvertime && etaRemainingSec > 10 && (
              <span className="text-orange-500 font-medium">
                {" "}· ~{Math.ceil(etaRemainingSec / 10) * 10}–{Math.ceil(etaRemainingSec / 10) * 10 + 10}s rimanenti
              </span>
            )}
            {!isOvertime && etaRemainingSec <= 10 && etaRemainingSec > 0 && (
              <span className="text-orange-500 font-medium">{" "}· quasi pronto…</span>
            )}
            {isOvertime && (
              <span className="text-amber-600 font-medium">
                {" "}· ancora qualche secondo…
              </span>
            )}
          </span>
        </div>
      </div>

      {/* ── Status text + tip rotante ────────────────────────────────────── */}
      <div className="text-center min-h-[3rem]">
        <p className="text-sm font-medium text-slate-800">{progress || "Avvio…"}</p>
        <AnimatePresence mode="wait">
          <motion.p
            key={`${status}-${tipIdx}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35 }}
            className="text-xs text-muted-foreground mt-1.5 italic"
          >
            {phaseTips[tipIdx] ?? phaseTips[0]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Fix 8: pulsante annulla (con AlertDialog se cancelButton fornito) */}
      {(cancelButton ?? onCancel) && (
        <div className="flex justify-center pt-1">
          {cancelButton ?? (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onCancel}>
              Annulla
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
