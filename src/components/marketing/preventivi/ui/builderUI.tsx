/**
 * Componenti UI condivisi per il preventivatore "classico" (lista, builder,
 * dettaglio). Replica la palette + struttura del wizard Fotovoltaico
 * (`src/lib/fotovoltaico/wizardUI.tsx`) ma con naming module-neutral, così
 * gli stessi pattern grafici sono utilizzabili anche dagli altri moduli vendita
 * (serramenti, tetti, ecc.) senza dipendenze cross-modulo.
 *
 * Convenzione colori (allineata al brand EiC):
 *   navy   = #1E3A5F  (primario / hero)
 *   orange = #F97316  (accent + CTA)
 *   amber  = #FBBF24  (gradiente CTA)
 *   green  = #16A34A  (success / margine ok)
 *   red    = #DC2626  (errore / margine sotto soglia)
 *   yellow = #FACC15  (warning)
 */

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── PAGE HEADER (titolo + chips + actions) ───────────────────────────────────

interface QuotePageHeaderProps {
  /** Numero progetto (es. "PV-2026-00128") */
  numero?: string | null;
  /** Stato badge (es. "Bozza", "Inviata") */
  stato?: ReactNode;
  /** Titolo principale */
  title: ReactNode;
  /** Sottotitolo (cliente · indirizzo) */
  subtitle?: ReactNode;
  /** Icona lead (lucide) wrappata in chip orange */
  icon?: ReactNode;
  /** Action buttons (Salva, Invia, Modifica, ecc.) */
  actions?: ReactNode;
  /** Chip extra (in linea con numero/stato) */
  chips?: ReactNode;
  /** Stringa info ultima modifica */
  lastModified?: ReactNode;
  /** Tailwind extra */
  className?: string;
  /** Telefono: azioni sulla riga del titolo (per una o due icone), non su una riga loro. */
  azioniInRiga?: boolean;
}

export function QuotePageHeader({
  numero,
  stato,
  title,
  subtitle,
  icon,
  actions,
  chips,
  lastModified,
  className,
  azioniInRiga,
}: QuotePageHeaderProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white px-3 sm:px-6 pt-3 sm:pt-5 pb-3 sm:pb-5 shadow-sm",
        className,
      )}
    >
      {(numero || stato || chips || lastModified) && (
        <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 mb-2">
          {numero && (
            <span className="font-mono bg-slate-100 text-slate-800 font-semibold px-2 py-0.5 rounded text-[11px]">
              {numero}
            </span>
          )}
          {stato}
          {chips}
          {lastModified && <span>· {lastModified}</span>}
        </div>
      )}
      <div className={cn("flex items-start justify-between gap-3 sm:gap-4 flex-wrap", azioniInRiga && "max-sm:flex-nowrap max-sm:items-center")}>
        <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
          {icon && (
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-2xl font-bold text-slate-900 tracking-tight leading-tight truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="hidden sm:block text-slate-500 text-sm mt-1 truncate max-w-xl">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className={cn("flex w-full sm:w-auto shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2", azioniInRiga && "max-sm:w-auto")}>{actions}</div>
        )}
      </div>
    </div>
  );
}

// ─── CARD con accent orange (replica FvCard) ──────────────────────────────────

interface QuoteCardProps {
  title?: ReactNode;
  /** Icona accanto al titolo */
  icon?: ReactNode;
  /** Action a destra del titolo (link/bottone) */
  action?: ReactNode;
  /** Sottotitolo riga successiva al titolo */
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Padding ridotto */
  compact?: boolean;
  /** Nasconde l'header anche se title fornito (debug) */
  noHeader?: boolean;
  /** Telefono: niente titolo quando ripete il passo già acceso in alto. */
  titoloSoloDaComputer?: boolean;
}

export function QuoteCard({
  title,
  icon,
  action,
  subtitle,
  children,
  className,
  compact,
  noHeader,
  titoloSoloDaComputer,
}: QuoteCardProps) {
  return (
    <div
      className={cn(
        "bg-white border border-slate-200 rounded-2xl shadow-sm transition-shadow hover:shadow-md",
        compact ? "p-4" : "p-4 sm:p-6",
        className,
      )}
    >
      {!noHeader && (title || action) && (
        <div className={cn("flex items-center justify-between gap-3 flex-wrap mb-3 sm:mb-4", titoloSoloDaComputer && "max-sm:hidden")}>
          {title && (
            <div className="min-w-0">
              <h3 className="text-[15px] font-bold text-slate-900 flex items-center gap-2.5">
                <span className="block w-1 h-4 rounded-sm bg-gradient-to-b from-orange-500 to-amber-400" />
                {icon && <span className="text-orange-500">{icon}</span>}
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs text-slate-500 mt-1 ml-3.5">{subtitle}</p>
              )}
            </div>
          )}
          {action && <div className="text-xs text-orange-600 font-semibold">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── KPI metric card (replica FvKpi) ──────────────────────────────────────────

type KpiVariant =
  | "default"
  | "orange"
  | "green"
  | "red"
  | "navy"
  | "blue"
  | "slate";

interface QuoteKpiProps {
  label: ReactNode;
  value: ReactNode;
  unit?: string;
  variant?: KpiVariant;
  hint?: ReactNode;
  icon?: ReactNode;
  /** Trend "up" verde / "down" rosso */
  trend?: { dir: "up" | "down"; text: string };
}

export function QuoteKpi({
  label,
  value,
  unit,
  variant = "default",
  hint,
  icon,
  trend,
}: QuoteKpiProps) {
  const valueColor: Record<KpiVariant, string> = {
    default: "text-slate-900",
    orange: "text-orange-600",
    green: "text-emerald-600",
    red: "text-red-600",
    navy: "text-slate-900",
    blue: "text-blue-600",
    slate: "text-slate-700",
  };
  const accentBar: Record<KpiVariant, string> = {
    default: "bg-slate-300",
    orange: "bg-gradient-to-b from-orange-500 to-amber-400",
    green: "bg-emerald-500",
    red: "bg-red-500",
    navy: "bg-[#1E3A5F]",
    blue: "bg-blue-500",
    slate: "bg-slate-400",
  };
  const iconColor: Record<KpiVariant, string> = {
    default: "text-slate-400",
    orange: "text-orange-500",
    green: "text-emerald-500",
    red: "text-red-500",
    navy: "text-[#1E3A5F]",
    blue: "text-blue-500",
    slate: "text-slate-400",
  };

  return (
    <div
      className={cn(
        "relative bg-white border border-slate-200 rounded-xl p-4 transition-all overflow-hidden",
        "hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300",
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-3 bottom-3 w-1 rounded-r-sm",
          accentBar[variant],
        )}
      />
      <div className="pl-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] text-slate-500 font-semibold tracking-wider sm:uppercase">
            {label}
          </div>
          {icon && (
            <span className={cn("h-4 w-4 shrink-0", iconColor[variant])}>{icon}</span>
          )}
        </div>
        <div
          className={cn(
            "text-xl sm:text-2xl font-bold leading-tight tabular-nums mt-1",
            valueColor[variant],
          )}
        >
          {value}
          {unit && (
            <span className="text-sm text-slate-500 font-medium ml-1">{unit}</span>
          )}
        </div>
        {trend && (
          <div
            className={cn(
              "mt-1 text-[11px] font-semibold flex items-center gap-1",
              trend.dir === "up" ? "text-emerald-600" : "text-red-600",
            )}
          >
            {trend.dir === "up" ? "↑" : "↓"} {trend.text}
          </div>
        )}
        {hint && !trend && (
          <div className="text-[11px] text-slate-500 mt-1 truncate">{hint}</div>
        )}
      </div>
    </div>
  );
}

// ─── CALLOUT colored alert (replica FvCallout) ────────────────────────────────

type CalloutVariant = "info" | "success" | "warn" | "tip" | "error";

interface QuoteCalloutProps {
  variant?: CalloutVariant;
  icon?: ReactNode;
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function QuoteCallout({
  variant = "info",
  icon,
  title,
  children,
  action,
  className,
}: QuoteCalloutProps) {
  const styles: Record<CalloutVariant, string> = {
    info: "bg-blue-50 border-l-blue-500 text-blue-900",
    success: "bg-emerald-50 border-l-emerald-500 text-emerald-900",
    warn: "bg-amber-50 border-l-amber-500 text-amber-900",
    tip: "bg-orange-50 border-l-orange-500 text-orange-900",
    error: "bg-red-50 border-l-red-500 text-red-900",
  };
  const defaultIcon: Record<CalloutVariant, string> = {
    info: "ℹ",
    success: "✓",
    warn: "⚠",
    tip: "★",
    error: "✕",
  };
  return (
    <div
      role="status"
      className={cn(
        "rounded-lg border-l-[3px] px-4 py-3 flex gap-3 items-start text-sm",
        styles[variant],
        className,
      )}
    >
      <span className="text-base leading-none mt-0.5 shrink-0">
        {icon ?? defaultIcon[variant]}
      </span>
      <div className="flex-1 min-w-0">
        {title && <strong className="block mb-1">{title}</strong>}
        <div>{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ─── CHIP (pillola colore) — replica FvChip ───────────────────────────────────

type ChipVariant =
  | "default"
  | "green"
  | "orange"
  | "red"
  | "navy"
  | "purple"
  | "yellow"
  | "blue";

interface QuoteChipProps {
  variant?: ChipVariant;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function QuoteChip({
  variant = "default",
  children,
  icon,
  className,
}: QuoteChipProps) {
  const styles: Record<ChipVariant, string> = {
    default: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-800",
    orange: "bg-orange-100 text-orange-800",
    red: "bg-red-100 text-red-700",
    navy: "bg-blue-100 text-blue-900",
    purple: "bg-violet-100 text-violet-700",
    yellow: "bg-amber-100 text-amber-800",
    blue: "bg-blue-100 text-blue-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold",
        styles[variant],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

// ─── STEPPER (replica visual del FvTabBar ma per inline form steps) ───────────

export interface QuoteStep {
  key: string;
  label: string;
  /** Etichetta corta per il telefono (tre passi affiancati senza scorrere). */
  labelBreve?: string;
  icon?: ReactNode;
}

interface QuoteStepperProps {
  completedSteps?: boolean[];
  steps: QuoteStep[];
  current: number;
  onSelect?: (idx: number) => void;
  /** Permette di saltare ai successivi (default: solo precedenti + corrente) */
  allowJumpForward?: boolean;
  className?: string;
}

export function QuoteStepper({
  completedSteps,
  steps,
  current,
  onSelect,
  allowJumpForward,
  className,
}: QuoteStepperProps) {
  const completedCount = completedSteps?.filter(Boolean).length;
  const pct = Math.round(((completedCount ?? (current + 1)) / steps.length) * 100);
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden",
        className,
      )}
    >
      {/* Telefono: i passi dividono la riga in parti uguali (prima scorrevano di
          lato e il terzo non si vedeva); via la barra «Step 1 di 3» sotto. */}
      <div className="flex gap-0 overflow-x-auto max-sm:overflow-visible">
        {steps.map((s, i) => {
          const isActive = i === current;
          const isCompleted = completedSteps ? !!completedSteps[i] : i < current;
          const isClickable =
            i < current || isActive || allowJumpForward || i === current + 1;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => isClickable && onSelect?.(i)}
              disabled={!isClickable}
              className={cn(
                "shrink-0 flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-2.5 sm:py-3 border-b-[3px] border-transparent whitespace-nowrap transition-all text-sm font-medium",
                "tap-compact max-sm:min-w-0 max-sm:flex-1 max-sm:shrink max-sm:justify-center max-sm:gap-1.5 max-sm:px-1.5 max-sm:py-2 max-sm:text-xs",
                "hover:bg-slate-50",
                isActive && "border-orange-500 text-slate-900 bg-white font-semibold",
                isCompleted && !isActive && "text-slate-700",
                !isActive && !isCompleted && "text-slate-500",
                !isClickable &&
                  "opacity-45 cursor-not-allowed hover:bg-transparent",
              )}
              aria-current={isActive ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex items-center justify-center w-6 h-6 rounded-full border text-[11px] font-bold flex-shrink-0 transition-all max-sm:h-5 max-sm:w-5 max-sm:text-[10px]",
                  !isActive &&
                    !isCompleted &&
                    "bg-slate-100 border-slate-300 text-slate-500",
                  isActive &&
                    "border-orange-500 text-white shadow-[0_2px_8px_rgba(249,115,22,0.4)] bg-gradient-to-br from-orange-500 to-amber-400",
                  isCompleted &&
                    "bg-emerald-600 border-emerald-600 text-white",
                )}
              >
                {isCompleted ? "✓" : i + 1}
              </span>
              <span className="flex flex-col items-start leading-tight text-left">
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider hidden sm:inline">
                  Step {i + 1}
                </span>
                <span className={s.labelBreve ? "max-sm:hidden" : undefined}>{s.label}</span>
                {s.labelBreve && <span className="sm:hidden">{s.labelBreve}</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="bg-slate-50 px-4 sm:px-6 py-1.5 sm:py-2 flex items-center gap-3 text-xs text-slate-500 border-t border-slate-100 max-sm:hidden">
        <span className="shrink-0">
          <strong className="text-slate-900">
            Step {current + 1} di {steps.length}
          </strong>
          <span className="hidden sm:inline"> · {steps[current]?.label}</span>
        </span>
        <div className="flex-1 max-w-[240px] h-1 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="hidden sm:inline">{completedCount == null ? `${pct}% completato` : `${completedCount} di ${steps.length} sezioni compilate`}</span>
      </div>
    </div>
  );
}

// ─── HUB TAB BAR (la nav tab della pagina lista preventivi) ───────────────────

export interface HubTab {
  key: string;
  label: string;
  icon?: ReactNode;
  count?: number;
  badge?: ReactNode;
}

interface QuoteHubTabsProps {
  tabs: HubTab[];
  active: string;
  onSelect: (key: string) => void;
  className?: string;
}

export function QuoteHubTabs({
  tabs,
  active,
  onSelect,
  className,
}: QuoteHubTabsProps) {
  return (
    <div
      className={cn(
        "border-b border-slate-200 bg-white rounded-t-2xl max-sm:rounded-none max-sm:bg-transparent",
        className,
      )}
    >
      {/* Telefono: le schede dividono la riga, più basse e senza icone. */}
      <nav
        className="-mb-px flex gap-1 sm:gap-2 overflow-x-auto px-2 sm:px-3 max-sm:overflow-visible max-sm:px-0"
        role="tablist"
        aria-label="Sezioni preventivi"
      >
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(t.key)}
              className={cn(
                // v8.6.67 — `shrink-0` evita che il flex parent comprima il button:
                // senza, il testo della label tracimava fuori bound del button
                // e si sovrapponeva alle tab adiacenti su mobile.
                "relative flex shrink-0 items-center gap-1.5 px-3 sm:px-4 py-3 text-sm font-medium whitespace-nowrap transition-all border-b-[3px] -mb-px",
                "tap-compact max-sm:flex-1 max-sm:justify-center max-sm:py-2 max-sm:text-xs",
                isActive
                  ? "border-orange-500 text-slate-900 font-semibold"
                  : "border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50",
              )}
            >
              {t.icon && (
                <span
                  className={cn(
                    "h-4 w-4 shrink-0 max-sm:hidden",
                    isActive ? "text-orange-500" : "text-slate-400",
                  )}
                >
                  {t.icon}
                </span>
              )}
              <span>{t.label}</span>
              {typeof t.count === "number" && (
                <span
                  className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums",
                    isActive
                      ? "bg-orange-100 text-orange-700"
                      : "bg-slate-100 text-slate-500",
                  )}
                >
                  {t.count}
                </span>
              )}
              {t.badge}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// ─── STICKY ACTION BAR (sticky bottom con prev/next/save) ─────────────────────

interface QuoteActionBarProps {
  /** Lato sinistro (es. info save / total) */
  left?: ReactNode;
  /** Lato destro (azioni) */
  right?: ReactNode;
  /** Stato auto-save */
  saveState?: "idle" | "saving" | "saved" | "error";
  /** Tailwind extra (es. lg:left-[280px]) */
  className?: string;
  /** Indicatore numero progetto in alto a sx */
  numero?: string | null;
  /** Stringa "Ultimo salvataggio…" */
  lastSaveText?: string;
}

export function QuoteActionBar({
  left,
  right,
  saveState,
  className,
  numero,
  lastSaveText,
}: QuoteActionBarProps) {
  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_12px_rgba(15,23,42,0.06)]",
        className,
      )}
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 text-xs text-slate-500 min-w-0 flex-wrap">
          {saveState === "saving" && (
            <span className="flex items-center gap-1.5 text-blue-600 font-medium">
              <Loader2 className="h-3 w-3 animate-spin" /> Salvataggio…
            </span>
          )}
          {saveState === "saved" && (
            <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Salvato automaticamente
            </span>
          )}
          {saveState === "error" && (
            <span className="flex items-center gap-1.5 text-red-600 font-medium">
              <span className="w-2 h-2 rounded-full bg-red-500" /> Errore salvataggio
            </span>
          )}
          {saveState === "idle" && (
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="w-2 h-2 rounded-full bg-slate-300" /> Pronto
            </span>
          )}
          {lastSaveText && <span>· {lastSaveText}</span>}
          {numero && (
            <span>
              · <code className="font-mono text-[11px]">{numero}</code>
            </span>
          )}
          {left}
        </div>
        <div className="flex gap-2 items-center flex-wrap">{right}</div>
      </div>
    </div>
  );
}

// ─── PRIMARY CTA gradient orange ──────────────────────────────────────────────

interface QuotePrimaryButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  size?: "sm" | "md" | "lg";
}

/** Bottone principale gradient orange→amber, usabile come "Avanti", "Salva", "Genera PDF" */
export function QuotePrimaryButton({
  loading,
  size = "md",
  className,
  children,
  disabled,
  ...rest
}: QuotePrimaryButtonProps) {
  const sizeCls =
    size === "sm"
      ? "px-3 py-1.5 text-xs"
      : size === "lg"
        ? "px-6 py-3 text-base"
        : "px-4 py-2 text-sm";
  return (
    <button
      type="button"
      disabled={loading || disabled}
      className={cn(
        "inline-flex items-center gap-2 font-bold rounded-lg text-white transition-all",
        "bg-gradient-to-br from-orange-500 to-amber-400 shadow-[0_4px_12px_rgba(249,115,22,0.3)]",
        "hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(249,115,22,0.4)]",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:shadow-none",
        sizeCls,
        className,
      )}
      {...rest}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Attendere…</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
