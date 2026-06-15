import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Mail, Clock, GitBranch, Flag, AlertTriangle, Check, X, MessageCircle, Smartphone, FileText } from "lucide-react";
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
 * Stile e pattern (Handle, memo, ring di selezione, badge warning) ricalcati dai
 * nodi delle Automazioni (src/components/flow-builder/nodes) per coerenza visiva.
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

// ── 📧 Email ─────────────────────────────────────────────────────────────────
function EmailNodeComponent({ data, selected }: NodeProps) {
  const d = data as NodeData;
  return (
    <div
      className={`min-w-[230px] max-w-[290px] rounded-xl border-2 bg-card shadow-sm transition-all hover:shadow-md border-orange-300 dark:border-orange-700 ${selected ? "ring-2 ring-primary ring-offset-1 shadow-lg" : ""} ${d.hasWarning ? "!border-amber-500 ring-1 ring-amber-300" : ""}`}
    >
      <Handle type="target" position={Position.Top} className={`!bg-orange-500 ${HANDLE}`} />
      <div className="flex items-center gap-2 rounded-t-[10px] bg-orange-50 dark:bg-orange-950/40 px-3 py-2">
        <div className="rounded-lg bg-orange-100 dark:bg-orange-900/60 p-1.5 text-orange-600 dark:text-orange-400">
          <Mail className="h-4 w-4" />
        </div>
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">
          Email
        </span>
        <span className="rounded bg-orange-200 dark:bg-orange-800 px-1.5 py-0.5 text-[9px] font-bold text-orange-700 dark:text-orange-300">
          {delayLabel(d.delay_days, d.delay_hours)}
        </span>
        {d.hasWarning && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
      </div>
      <div className="px-3 py-2">
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
// Stessa anatomia dell'email (1 in + 1 out, badge ritardo, anteprima testo) ma
// SENZA oggetto: il corpo è l'unico contenuto. Parametrica sul colore/icona/label
// per riusare lo stesso markup (DRY) tra WhatsApp e SMS.
function MessageNodeCard({
  data, selected, accent, Icon, label,
}: {
  data: NodeData;
  selected: boolean | undefined;
  accent: "emerald" | "sky";
  Icon: typeof Mail;
  label: string;
}) {
  // Classi statiche per-accent (Tailwind non supporta interpolazione dinamica).
  const styles = accent === "emerald"
    ? {
        border: "border-emerald-300 dark:border-emerald-700",
        head: "bg-emerald-50 dark:bg-emerald-950/40",
        iconWrap: "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400",
        title: "text-emerald-600 dark:text-emerald-400",
        badge: "bg-emerald-200 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-300",
        handle: "!bg-emerald-500",
      }
    : {
        border: "border-sky-300 dark:border-sky-700",
        head: "bg-sky-50 dark:bg-sky-950/40",
        iconWrap: "bg-sky-100 dark:bg-sky-900/60 text-sky-600 dark:text-sky-400",
        title: "text-sky-600 dark:text-sky-400",
        badge: "bg-sky-200 dark:bg-sky-800 text-sky-700 dark:text-sky-300",
        handle: "!bg-sky-500",
      };
  return (
    <div
      className={`min-w-[230px] max-w-[290px] rounded-xl border-2 bg-card shadow-sm transition-all hover:shadow-md ${styles.border} ${selected ? "ring-2 ring-primary ring-offset-1 shadow-lg" : ""} ${data.hasWarning ? "!border-amber-500 ring-1 ring-amber-300" : ""}`}
    >
      <Handle type="target" position={Position.Top} className={`${styles.handle} ${HANDLE}`} />
      <div className={`flex items-center gap-2 rounded-t-[10px] px-3 py-2 ${styles.head}`}>
        <div className={`rounded-lg p-1.5 ${styles.iconWrap}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className={`flex-1 text-[10px] font-semibold uppercase tracking-wide ${styles.title}`}>
          {label}
        </span>
        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${styles.badge}`}>
          {delayLabel(data.delay_days, data.delay_hours)}
        </span>
        {data.hasWarning && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
      </div>
      <div className="px-3 py-2">
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

// ── ⏱️ Attesa ────────────────────────────────────────────────────────────────
function WaitNodeComponent({ data, selected }: NodeProps) {
  const d = data as NodeData;
  return (
    <div className="flex flex-col items-center">
      <Handle type="target" position={Position.Top} className={`!bg-purple-500 ${HANDLE}`} />
      <div
        className={`flex items-center gap-2 rounded-full border-2 px-4 py-2 shadow-sm transition-all hover:shadow-md bg-purple-50 dark:bg-purple-950/40 border-purple-300 dark:border-purple-600 ${selected ? "ring-2 ring-primary ring-offset-1 shadow-lg" : ""} ${d.hasWarning ? "!border-amber-500 ring-1 ring-amber-300" : ""}`}
      >
        <div className="rounded-full bg-purple-100 dark:bg-purple-900/60 p-1 text-purple-600 dark:text-purple-400">
          <Clock className="h-3.5 w-3.5" />
        </div>
        <span className="whitespace-nowrap text-sm font-medium text-purple-700 dark:text-purple-300">
          Attesa {delayLabel(d.delay_days, d.delay_hours)}
        </span>
        {d.hasWarning && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
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
    <div
      className={`min-w-[220px] max-w-[280px] rounded-xl border-2 bg-card shadow-sm transition-all hover:shadow-md border-amber-400 dark:border-amber-600 ${selected ? "ring-2 ring-primary ring-offset-1 shadow-lg" : ""} ${d.hasWarning ? "!border-amber-500 ring-1 ring-amber-300" : ""}`}
    >
      <Handle type="target" position={Position.Top} className={`!bg-amber-500 ${HANDLE}`} />
      <div className="flex items-center gap-2 rounded-t-[10px] bg-amber-50 dark:bg-amber-950/40 px-3 py-2">
        <div className="rounded-lg bg-amber-100 dark:bg-amber-900/60 p-1.5 text-amber-600 dark:text-amber-400">
          <GitBranch className="h-4 w-4" />
        </div>
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
          Condizione
        </span>
        {d.hasWarning && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
      </div>
      <div className="px-3 py-2">
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
        className={`flex items-center gap-1.5 rounded-full border-2 px-5 py-2.5 shadow-sm bg-muted border-border transition-all ${selected ? "ring-2 ring-primary ring-offset-1" : ""}`}
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
export const WaitNode = memo(WaitNodeComponent);
export const ConditionNode = memo(ConditionNodeComponent);
export const EndNode = memo(EndNodeComponent);
