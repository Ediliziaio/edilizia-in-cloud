import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Mail, Clock, GitBranch, Flag, AlertTriangle, Check, X, MessageCircle, Smartphone, FileText, Phone } from "lucide-react";
import { htmlToPreviewText } from "../_shared";

/**
 * Nodi custom del builder a grafo delle SEQUENZE CONDIZIONALI (outreach).
 *
 * Mappano 1:1 il modello dati `outreach_sequence_steps` (Fase 1 + multicanale):
 *   • email      → 📧  oggetto + corpo + ritardo (1 in, 1 out → next_default)
 *   • whatsapp   → 💬  corpo + ritardo            (1 in, 1 out → next_default) — niente oggetto
 *   • sms        → 📱  corpo + ritardo            (1 in, 1 out → next_default) — niente oggetto
 *   • wait       → ⏱️  solo ritardo               (1 in, 1 out → next_default)
 *   • condition  → 🔀  condition_type             (1 in, 2 out: SÌ → next_default, NO → next_alt)
 *   • end        → 🏁  terminale                  (1 in)
 *
 * LINGUAGGIO VISIVO (stile Instantly/Smartlead): card bianche pulite con bordo
 * sottile a peso singolo, una STRISCIA-ACCENT colorata a sinistra per il tipo, un
 * chip-icona colorato in testa, pill ritardo discreta. Ring di selezione = primary.
 * Handle ben leggibili, colorati per tipo; sulle condizioni i due rami SÌ/NO sono
 * etichettati e gli handle distinti (verde/rosso). Markup/handle/id invariati.
 */

const HANDLE = "!w-3 !h-3 !border-2 !border-background";

type NodeData = {
  label?: string;
  subject?: string;
  body?: string;
  delay_days?: number;
  delay_hours?: number;
  condition_type?: string | null;
  hasWarning?: boolean;
  // Template WhatsApp approvato (solo nodi whatsapp): mostrato come badge sul nodo.
  template_name?: string | null;
};

function delayLabel(d?: number, h?: number): string {
  const days = Math.max(0, Math.trunc(d ?? 0));
  const hours = Math.max(0, Math.trunc(h ?? 0));
  if (days === 0 && hours === 0) return "subito";
  const parts: string[] = [];
  if (days > 0) parts.push(`G+${days}`);
  if (hours > 0) parts.push(`${hours}h`);
  return parts.join(" ");
}

// Classi base condivise dalle card-nodo (shell pulita stile Instantly). Il bordo
// di selezione/warning si sovrappone via classi aggiuntive nei singoli componenti.
const CARD_BASE =
  "relative min-w-[236px] max-w-[292px] overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:shadow-md";

/** Stato di selezione/warning come anello (primary) o bordo ambra, comune a tutti. */
function ringClasses(selected?: boolean, hasWarning?: boolean): string {
  if (hasWarning) return "ring-1 ring-amber-300 dark:ring-amber-600/60";
  if (selected) return "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg";
  return "";
}

/** Pill ritardo discreta nell'header delle card-nodo. */
function DelayPill({ d, h, tone }: { d?: number; h?: number; tone: string }) {
  return (
    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold tabular-nums ${tone}`}>
      {delayLabel(d, h)}
    </span>
  );
}

// ── 📧 Email ─────────────────────────────────────────────────────────────────
function EmailNodeComponent({ data, selected }: NodeProps) {
  const d = data as NodeData;
  return (
    <div className={`${CARD_BASE} ${ringClasses(selected, d.hasWarning)}`}>
      {/* striscia-accent sinistra per tipo */}
      <span className="absolute inset-y-0 left-0 w-1 bg-orange-400 dark:bg-orange-500" aria-hidden />
      <Handle type="target" position={Position.Top} className={`!bg-orange-500 ${HANDLE}`} />
      <div className="flex items-center gap-2 px-3 py-2 pl-4">
        <div className="rounded-lg bg-orange-100 p-1.5 text-orange-600 dark:bg-orange-900/60 dark:text-orange-400">
          <Mail className="h-4 w-4" />
        </div>
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Email</span>
        <DelayPill d={d.delay_days} h={d.delay_hours} tone="bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-300" />
        {d.hasWarning && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
      </div>
      <div className="border-t border-border/70 px-3 py-2 pl-4">
        <p className="truncate text-sm font-medium text-foreground">
          {d.subject?.trim() || d.label || "Oggetto email…"}
        </p>
        {d.body?.trim() && (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-muted-foreground">
            {htmlToPreviewText(d.body)}
          </p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className={`!bg-orange-500 ${HANDLE}`} />
    </div>
  );
}

// ── Card generica per i nodi MESSAGGIO non-email (WhatsApp / SMS) ────────────
// Stessa anatomia dell'email (1 in + 1 out, striscia-accent, pill ritardo,
// anteprima testo) ma SENZA oggetto: il corpo è l'unico contenuto. Parametrica
// sul colore/icona/label per riusare lo stesso markup (DRY) tra WhatsApp e SMS.
function MessageNodeCard({
  data, selected, accent, Icon, label,
}: {
  data: NodeData;
  selected: boolean | undefined;
  accent: "emerald" | "sky" | "indigo";
  Icon: typeof Mail;
  label: string;
}) {
  // Classi statiche per-accent (Tailwind non supporta interpolazione dinamica).
  const ACCENTS = {
    emerald: {
      strip: "bg-emerald-400 dark:bg-emerald-500",
      iconWrap: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-400",
      pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
      handle: "!bg-emerald-500",
    },
    sky: {
      strip: "bg-sky-400 dark:bg-sky-500",
      iconWrap: "bg-sky-100 text-sky-600 dark:bg-sky-900/60 dark:text-sky-400",
      pill: "bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300",
      handle: "!bg-sky-500",
    },
    indigo: {
      strip: "bg-indigo-400 dark:bg-indigo-500",
      iconWrap: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/60 dark:text-indigo-400",
      pill: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300",
      handle: "!bg-indigo-500",
    },
  } as const;
  const styles = ACCENTS[accent];
  return (
    <div className={`${CARD_BASE} ${ringClasses(selected, data.hasWarning)}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${styles.strip}`} aria-hidden />
      <Handle type="target" position={Position.Top} className={`${styles.handle} ${HANDLE}`} />
      <div className="flex items-center gap-2 px-3 py-2 pl-4">
        <div className={`rounded-lg p-1.5 ${styles.iconWrap}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <DelayPill d={data.delay_days} h={data.delay_hours} tone={styles.pill} />
        {data.hasWarning && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
      </div>
      <div className="border-t border-border/70 px-3 py-2 pl-4">
        {/* Badge template approvato (WhatsApp): segnala invio conforme Meta (cold-ready). */}
        {data.template_name?.trim() && (
          <span className="mb-1 inline-flex max-w-full items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
            <FileText className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">Template: {data.template_name.trim()}</span>
          </span>
        )}
        <p className="line-clamp-2 text-[12px] leading-tight text-foreground">
          {data.body?.trim() ? htmlToPreviewText(data.body) : (data.label || (data.template_name?.trim() ? "Template approvato" : "Messaggio…"))}
        </p>
      </div>
      <Handle type="source" position={Position.Bottom} className={`${styles.handle} ${HANDLE}`} />
    </div>
  );
}

// ── 💬 WhatsApp ──────────────────────────────────────────────────────────────
function WhatsappNodeComponent({ data, selected }: NodeProps) {
  return <MessageNodeCard data={data as NodeData} selected={selected} accent="emerald" Icon={MessageCircle} label="WhatsApp" />;
}

// ── 📱 SMS ───────────────────────────────────────────────────────────────────
function SmsNodeComponent({ data, selected }: NodeProps) {
  return <MessageNodeCard data={data as NodeData} selected={selected} accent="sky" Icon={Smartphone} label="SMS" />;
}

// ── 📞 Chiamata ──────────────────────────────────────────────────────────────
// Non invia nulla: crea un promemoria di chiamata per il commerciale. Il corpo è
// lo script/nota per la telefonata. Stessa anatomia dei nodi messaggio.
function CallNodeComponent({ data, selected }: NodeProps) {
  return <MessageNodeCard data={data as NodeData} selected={selected} accent="indigo" Icon={Phone} label="Chiamata" />;
}

// ── ⏱️ Attesa ────────────────────────────────────────────────────────────────
// Nodo "logico" compatto a pill (non è una card-messaggio): resta riconoscibile
// come connettore di tempo, in viola, coerente con la palette/Logica.
function WaitNodeComponent({ data, selected }: NodeProps) {
  const d = data as NodeData;
  return (
    <div className="flex flex-col items-center">
      <Handle type="target" position={Position.Top} className={`!bg-purple-500 ${HANDLE}`} />
      <div
        className={`flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-4 py-2 shadow-sm transition-all hover:shadow-md dark:border-purple-700/60 dark:bg-purple-950/40 ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg" : ""} ${d.hasWarning ? "ring-1 ring-amber-300" : ""}`}
      >
        <div className="rounded-full bg-purple-100 p-1 text-purple-600 dark:bg-purple-900/60 dark:text-purple-400">
          <Clock className="h-3.5 w-3.5" />
        </div>
        <span className="whitespace-nowrap text-sm font-medium text-purple-700 dark:text-purple-300">
          Attesa {delayLabel(d.delay_days, d.delay_hours)}
        </span>
        {d.hasWarning && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
      </div>
      <Handle type="source" position={Position.Bottom} className={`!bg-purple-500 ${HANDLE}`} />
    </div>
  );
}

// ── 🔀 Condizione ────────────────────────────────────────────────────────────
const CONDITION_LABELS: Record<string, string> = {
  opened: "Ha aperto",
  not_opened: "Non ha aperto",
  replied: "Ha risposto",
  not_replied: "Non ha risposto",
};

function ConditionNodeComponent({ data, selected }: NodeProps) {
  const d = data as NodeData;
  const condLabel = d.condition_type ? CONDITION_LABELS[d.condition_type] : null;
  return (
    <div className={`relative min-w-[226px] max-w-[284px] overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:shadow-md ${ringClasses(selected, d.hasWarning)}`}>
      <span className="absolute inset-y-0 left-0 w-1 bg-amber-400 dark:bg-amber-500" aria-hidden />
      <Handle type="target" position={Position.Top} className={`!bg-amber-500 ${HANDLE}`} />
      <div className="flex items-center gap-2 px-3 py-2 pl-4">
        <div className="rounded-lg bg-amber-100 p-1.5 text-amber-600 dark:bg-amber-900/60 dark:text-amber-400">
          <GitBranch className="h-4 w-4" />
        </div>
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Condizione</span>
        {d.hasWarning && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
      </div>
      <div className="border-t border-border/70 px-3 py-2 pl-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Se il contatto</p>
        <p className="mt-0.5 truncate text-sm font-medium text-foreground">
          {condLabel || "Scegli condizione…"}
        </p>
      </div>
      <div className="flex justify-between px-4 pb-2 text-[10px] font-bold">
        <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
          <Check className="h-3 w-3" /> SÌ
        </span>
        <span className="flex items-center gap-0.5 text-red-500 dark:text-red-400">
          <X className="h-3 w-3" /> NO
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        className={`!bg-emerald-500 ${HANDLE}`}
        style={{ left: "30%" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        className={`!bg-red-500 ${HANDLE}`}
        style={{ left: "70%" }}
      />
    </div>
  );
}

// ── 🏁 Fine ──────────────────────────────────────────────────────────────────
function EndNodeComponent({ selected }: NodeProps) {
  return (
    <div className="flex flex-col items-center">
      <Handle type="target" position={Position.Top} className={`!bg-muted-foreground ${HANDLE}`} />
      <div
        className={`flex items-center gap-1.5 rounded-full border border-border bg-muted px-5 py-2.5 shadow-sm transition-all ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
      >
        <Flag className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Fine</span>
      </div>
    </div>
  );
}

export const EmailNode = memo(EmailNodeComponent);
export const WhatsappNode = memo(WhatsappNodeComponent);
export const SmsNode = memo(SmsNodeComponent);
export const CallNode = memo(CallNodeComponent);
export const WaitNode = memo(WaitNodeComponent);
export const ConditionNode = memo(ConditionNodeComponent);
export const EndNode = memo(EndNodeComponent);
