import type { LucideIcon } from "lucide-react";
import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Atomi di presentazione condivisi per la tab "Deliverability" (caselle mittenti,
 * warm-up, brand, DNS) — linguaggio visivo stile Instantly/Smartlead "Email Accounts":
 * dot di stato colorati, badge provider, pill salute, heat-bar. Solo UI, nessuna logica.
 */

/* ───────────────────────── stato casella ───────────────────────── */

export type SenderTone = "active" | "warming" | "paused" | "error" | "untested";

const SENDER_STATUS_META: Record<SenderTone, { label: string; dot: string; text: string }> = {
  active: { label: "Attiva", dot: "bg-emerald-500", text: "text-emerald-700" },
  warming: { label: "Warm-up", dot: "bg-amber-500", text: "text-amber-700" },
  paused: { label: "In pausa", dot: "bg-slate-400", text: "text-slate-600" },
  error: { label: "Errore", dot: "bg-red-500", text: "text-red-700" },
  untested: { label: "Non testata", dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
};

/** Normalizza lo `status` della casella (DB) nel tono di stato visivo. */
export function senderTone(status: string, connectionStatus?: string | null): SenderTone {
  if (status === "error") return "error";
  if (connectionStatus === "error") return "error";
  if (status === "active") return "active";
  if (status === "warming") return "warming";
  if (status === "paused" || status === "disabled") return "paused";
  return "untested";
}

/** Dot di stato + etichetta, stile Instantly (pallino colorato accanto all'email). */
export function StatusDot({ tone, label, className }: { tone: SenderTone; label?: string; className?: string }) {
  const meta = SENDER_STATUS_META[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} />
      <span className={cn("text-[11px] font-medium", meta.text)}>{label ?? meta.label}</span>
    </span>
  );
}

/* ───────────────────────── provider badge ───────────────────────── */

const PROVIDER_META: Record<string, { label: string; cls: string }> = {
  smtp: { label: "SMTP", cls: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  google: { label: "Google", cls: "bg-sky-50 text-sky-700 ring-sky-600/20" },
  gmail: { label: "Gmail · OAuth", cls: "bg-sky-50 text-sky-700 ring-sky-600/20" },
  outlook: { label: "Outlook", cls: "bg-blue-50 text-blue-700 ring-blue-600/20" },
  elastic_email: { label: "Elastic Email", cls: "bg-orange-50 text-orange-700 ring-orange-600/20" },
  ses: { label: "Amazon SES", cls: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  resend: { label: "Resend", cls: "bg-zinc-100 text-zinc-700 ring-zinc-600/20" },
  sendgrid: { label: "SendGrid", cls: "bg-blue-50 text-blue-700 ring-blue-600/20" },
  brevo: { label: "Brevo", cls: "bg-teal-50 text-teal-700 ring-teal-600/20" },
  mailgun: { label: "Mailgun", cls: "bg-red-50 text-red-700 ring-red-600/20" },
};

/**
 * Badge provider stile Instantly. Per SMTP prova a riconoscere Google/Outlook
 * dall'host (più leggibile del generico "SMTP"), come fa la pagina Email Accounts.
 */
export function providerKey(provider: string, host?: string | null): string {
  if (provider === "smtp" && host) {
    const h = host.toLowerCase();
    if (h.includes("gmail") || h.includes("google")) return "google";
    if (h.includes("office365") || h.includes("outlook") || h.includes("microsoft")) return "outlook";
  }
  return provider;
}

export function ProviderBadge({ provider, host, className }: { provider: string; host?: string | null; className?: string }) {
  const key = providerKey(provider, host);
  const meta = PROVIDER_META[key] ?? { label: provider, cls: "bg-muted text-muted-foreground ring-border" };
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset", meta.cls, className)}>
      {meta.label}
    </span>
  );
}

/* ───────────────────────── salute reputazione ───────────────────────── */

export type Health = "ok" | "attenzione" | "a rischio";

export const HEALTH_META: Record<Health, { label: string; cls: string; Icon: LucideIcon }> = {
  ok: { label: "ok", cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", Icon: ShieldCheck },
  attenzione: { label: "attenzione", cls: "bg-amber-50 text-amber-700 ring-amber-600/20", Icon: ShieldAlert },
  "a rischio": { label: "a rischio", cls: "bg-red-50 text-red-700 ring-red-600/20", Icon: ShieldX },
};

export function HealthPill({ health, className }: { health: Health; className?: string }) {
  const meta = HEALTH_META[health];
  const Icon = meta.Icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset", meta.cls, className)}>
      <Icon className="h-3 w-3" /> {meta.label}
    </span>
  );
}

/* ───────────────────────── label / heat-bar ───────────────────────── */

/** Micro-label maiuscola stile Instantly (sopra ai valori). */
export function FieldLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("text-[10px] font-medium uppercase tracking-wide text-muted-foreground", className)}>{children}</span>;
}

/** Barra warm-up/progress elegante con riempimento colorato (track tenue). */
export function HeatBar({ pct, className, indicatorClassName, height = "h-1.5" }: { pct: number; className?: string; indicatorClassName?: string; height?: string }) {
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-muted", height, className)}>
      <div
        className={cn("h-full rounded-full transition-all", indicatorClassName ?? "bg-primary")}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}
