/**
 * Componenti UI condivisi del wizard Fotovoltaico (replica mockup v2 EiC).
 * Estratti dal wizard principale per mantenere FotovoltaicoWizard.tsx leggibile.
 *
 * Convenzione colori (allineata al mockup):
 *   navy   = #1E3A5F  (primario)
 *   navy-l = #2C5184  (gradiente)
 *   orange = #F97316  (accent + CTA)
 *   green  = #16A34A  (success / completato)
 *   red    = #DC2626  (errore)
 *   yellow = #FACC15  (warning)
 */

import { ReactNode, useEffect, useRef } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── TAB BAR ORIZZONTALE STICKY ───────────────────────────────────────────────

export interface FvTabDef {
  /** Numero fase 1..N */
  num: number;
  /** Etichetta breve (es. "Cliente") */
  label: string;
  /** Categoria (es. "Fase 1") */
  small?: string;
  /** Telefono: nome corto nella pillola (es. «Finanza» per «Anteprima finanziaria»). */
  breve?: string;
}

interface FvTabBarProps {
  tabs: FvTabDef[];
  current: number;
  /** Tab numerici già visitati / completati con successo */
  completed: Set<number>;
  /** True se l'utente può cliccare su tab futuri (di solito false) */
  allowJumpForward?: boolean;
  /** Callback navigazione */
  onSelect: (n: number) => void;
}

export function FvTabBar({ tabs, current, completed, allowJumpForward, onSelect }: FvTabBarProps) {
  const pct = Math.round((current / tabs.length) * 100);
  const remaining = tabs.length - current;
  const minutesRemaining = remaining > 0 ? Math.max(1, Math.round(remaining * 1.5)) : 0;
  const rigaRef = useRef<HTMLDivElement | null>(null);

  // Telefono: le otto pillole scorrono; quella della fase attiva si porta al centro.
  useEffect(() => {
    const riga = rigaRef.current;
    const attiva = riga?.querySelector<HTMLElement>(`[data-tab="${current}"]`);
    if (!riga || !attiva || riga.scrollWidth <= riga.clientWidth) return;
    riga.scrollTo({ left: attiva.offsetLeft - (riga.clientWidth - attiva.clientWidth) / 2, behavior: "smooth" });
  }, [current]);

  return (
    <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-[0_1px_0_rgba(15,23,42,0.05)]">
      <div ref={rigaRef} className="px-4 sm:px-8 flex gap-0 overflow-x-auto fv-tab-scroll max-md:gap-1 max-md:px-2 max-md:py-1.5">
        {tabs.map((t) => {
          const isActive = t.num === current;
          const isCompleted = completed.has(t.num);
          // Indietro SEMPRE consentito (t.num <= current): una fase già vista si può
          // sempre rivedere/correggere. In avanti solo se completata, la successiva o jump.
          const isClickable =
            isCompleted || t.num <= current || (allowJumpForward ?? false) || t.num === current + 1;
          return (
            <button
              key={t.num}
              type="button"
              data-tab={t.num}
              data-state={isActive ? "active" : isCompleted ? "completed" : "pending"}
              onClick={() => isClickable && onSelect(t.num)}
              disabled={!isClickable}
              className={cn(
                "shrink-0 flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-3 sm:py-3.5 border-b-[3px] border-transparent whitespace-nowrap transition-all text-sm font-medium",
                "hover:bg-slate-50",
                isActive && "border-orange-500 text-slate-900 bg-white font-semibold",
                isCompleted && !isActive && "text-slate-700",
                !isActive && !isCompleted && "text-slate-500",
                !isClickable && "opacity-45 cursor-not-allowed hover:bg-transparent",
                // Telefono: pillola col nome corto — fatte in verde, l'attiva piena, le altre spente.
                "tap-compact max-md:gap-0 max-md:rounded-full max-md:border max-md:px-2.5 max-md:py-1 max-md:text-[11px]",
                isActive && "max-md:border-orange-500 max-md:bg-orange-500 max-md:text-white",
                isCompleted && !isActive && "max-md:border-emerald-200 max-md:bg-emerald-50 max-md:text-emerald-800",
                !isActive && !isCompleted && "max-md:border-slate-200",
              )}
              aria-current={isActive ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex items-center justify-center w-6 h-6 rounded-full border text-[11px] font-bold flex-shrink-0 transition-all max-md:hidden",
                  !isActive && !isCompleted && "bg-slate-100 border-slate-300 text-slate-500",
                  isActive && "border-orange-500 text-white shadow-[0_2px_8px_rgba(249,115,22,0.4)] bg-gradient-to-br from-orange-500 to-amber-400",
                  isCompleted && "bg-emerald-600 border-emerald-600 text-white",
                )}
              >
                {isCompleted ? <Check className="h-3 w-3" strokeWidth={3} /> : t.num}
              </span>
              <span className="flex flex-col items-start leading-tight text-left">
                {t.small && (
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider max-md:hidden">
                    {t.small}
                  </span>
                )}
                <span className="max-md:hidden">{t.label}</span>
                <span className="md:hidden">{t.breve ?? t.label}</span>
              </span>
            </button>
          );
        })}
      </div>
      {/* Progress bar */}
      {/* Telefono: la fase la dicono già le pillole. */}
      <div className="bg-slate-50 px-4 sm:px-8 py-2 flex items-center gap-3 text-xs text-slate-500 border-t border-slate-100 max-md:hidden">
        <span>
          <strong className="text-slate-900">Fase {current} di {tabs.length}</strong> ·{" "}
          {tabs[current - 1]?.label}
        </span>
        <div className="flex-1 max-w-[200px] h-1 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span>
          {pct}% completato
          {remaining > 0 && ` · ~${minutesRemaining} min`}
        </span>
      </div>
    </div>
  );
}

// ─── PAGE HEADER (titolo + breadcrumb + chips + actions) ──────────────────────

interface FvPageHeaderProps {
  /** Codice progetto (es. "FV-2026-00128") oppure null se nuovo */
  numero?: string | null;
  /** Stato (badge) — es. "Bozza" / "In compilazione" */
  stato?: string;
  /** Titolo principale */
  title: string;
  /** Sottotitolo (cliente · indirizzo) */
  subtitle?: string;
  /** Action buttons (es. Salva, Duplica, Annulla) */
  actions?: ReactNode;
  /** Chip extra a destra del numero progetto */
  chips?: ReactNode;
  /** Stringa info ultima modifica */
  lastModified?: string;
}

export function FvPageHeader({
  numero,
  stato,
  title,
  subtitle,
  actions,
  chips,
  lastModified,
}: FvPageHeaderProps) {
  return (
    <div className="bg-white px-4 sm:px-8 pt-5 pb-1 border-b border-slate-200 max-md:pt-3">
      <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500 mb-2 max-md:mb-1 max-md:gap-2 max-md:flex-nowrap">
        {numero && (
          <span className="font-mono bg-slate-100 text-slate-800 font-semibold px-2 py-0.5 rounded text-[11px] shrink-0">
            {numero}
          </span>
        )}
        {stato && (
          <span className="bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded text-[11px] shrink-0">
            {stato}
          </span>
        )}
        <span className="contents max-md:hidden">{chips}</span>
        {lastModified && <span className="max-md:min-w-0 max-md:truncate">· {lastModified}</span>}
      </div>
      {/* Telefono: titolo e azioni (solo icone) sulla stessa riga. */}
      <div className="flex items-start justify-between gap-3 sm:gap-6 flex-wrap mb-4 sm:mb-5 max-md:mb-2 max-md:flex-nowrap max-md:items-center">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-2xl font-bold text-slate-900 tracking-tight leading-tight truncate">{title}</h1>
          {subtitle && (
            <p className="hidden sm:block text-slate-500 text-sm mt-1 truncate max-w-xl">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex w-full sm:w-auto gap-2 items-center flex-wrap justify-end max-md:w-auto max-md:shrink-0 max-md:flex-nowrap max-md:gap-1">{actions}</div>}
      </div>
    </div>
  );
}

// ─── PANNELLO STEP (titolo + sottotitolo dei contenuti) ───────────────────────

interface FvPanelTitleProps {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: ReactNode;
}

export function FvPanelTitle({ step, totalSteps: _totalSteps, title, subtitle }: FvPanelTitleProps) {
  return (
    <div className="mb-6 max-md:mb-3">
      <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mb-1 max-md:mb-0 max-md:text-base">
        Fase {step} — {title}
      </h2>
      {subtitle && <p className="text-sm text-slate-500 max-md:hidden">{subtitle}</p>}
    </div>
  );
}

// ─── CARD (replica .card mockup con orange-bar h3) ────────────────────────────

interface FvCardProps {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Padding ridotto (es. liste compatte) */
  compact?: boolean;
}

export function FvCard({ title, action, children, className, compact }: FvCardProps) {
  return (
    <div
      className={cn(
        "bg-white border border-slate-200 rounded-2xl shadow-sm transition-shadow hover:shadow-md",
        compact ? "p-4" : "p-5 sm:p-6",
        // Telefono: meno cornice attorno ai dati; min-w-0 perché nelle griglie a una
        // colonna un testo lungo (il nome del pannello) allargava la scheda oltre lo schermo.
        "max-md:p-3.5 max-md:min-w-0",
        className,
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap max-md:mb-2">
          {title && (
            <h3 className="text-[15px] font-bold text-slate-900 flex items-center gap-2.5 max-md:text-sm">
              <span className="block w-1 h-4 rounded-sm bg-gradient-to-b from-orange-500 to-amber-400" />
              {title}
            </h3>
          )}
          {action && <div className="text-xs text-orange-600 font-semibold">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── KPI BLOCK (replica .kpi mockup) ──────────────────────────────────────────

interface FvKpiProps {
  label: string;
  value: ReactNode;
  unit?: string;
  variant?: "default" | "orange" | "green" | "red" | "navy";
  hint?: ReactNode;
  trend?: { dir: "up" | "down"; text: string };
  className?: string;
}

export function FvKpi({ label, value, unit, variant = "default", hint, trend, className }: FvKpiProps) {
  const valueColor = {
    default: "text-slate-900",
    orange: "text-orange-600",
    green: "text-emerald-600",
    red: "text-red-600",
    navy: "text-slate-900",
  }[variant];

  return (
    <div className={cn("bg-white border border-slate-200 rounded-xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300 max-md:px-3 max-md:py-2.5", className)}>
      {/* Sprint 3 #20: su mobile (sm:) toglie uppercase aggressivo per leggibilità */}
      <div className="text-[11px] text-slate-500 font-semibold tracking-wider mb-1.5 sm:uppercase max-md:mb-0.5">
        {label}
      </div>
      <div className={cn("text-xl sm:text-2xl font-bold leading-tight tabular-nums max-md:text-lg", valueColor)}>
        {value}
        {unit && <span className="text-sm text-slate-500 font-medium ml-1">{unit}</span>}
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
      {hint && !trend && <div className="text-[11px] text-slate-500 mt-1 max-md:hidden">{hint}</div>}
    </div>
  );
}

// ─── CALLOUT (info / success / warn / tip) ────────────────────────────────────

type CalloutVariant = "info" | "success" | "warn" | "tip" | "error";

interface FvCalloutProps {
  variant?: CalloutVariant;
  icon?: ReactNode;
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}

export function FvCallout({ variant = "info", icon, title, children, action }: FvCalloutProps) {
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
      className={cn("rounded-lg border-l-[3px] px-4 py-3 flex gap-3 items-start text-sm", styles[variant])}
    >
      <span className="text-base leading-none mt-0.5">{icon ?? defaultIcon[variant]}</span>
      <div className="flex-1 min-w-0">
        {title && <strong className="block mb-1">{title}</strong>}
        <div>{children}</div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// ─── CHIP (pillola stato / etichetta) ─────────────────────────────────────────

type ChipVariant = "default" | "green" | "orange" | "red" | "navy" | "purple" | "yellow";

interface FvChipProps {
  variant?: ChipVariant;
  children: ReactNode;
  icon?: ReactNode;
}

export function FvChip({ variant = "default", children, icon }: FvChipProps) {
  const styles: Record<ChipVariant, string> = {
    default: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-800",
    orange: "bg-orange-100 text-orange-800",
    red: "bg-red-100 text-red-700",
    navy: "bg-blue-100 text-blue-900",
    purple: "bg-violet-100 text-violet-700",
    yellow: "bg-amber-100 text-amber-800",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold",
        styles[variant],
      )}
    >
      {icon}
      {children}
    </span>
  );
}

// ─── FOOTER ACTIONS STICKY (Indietro / Salva bozza / Avanti) ──────────────────

interface FvFooterProps {
  /** Stato auto-save (verde pulse, oppure spinner durante save) */
  autoSaveState: "idle" | "saving" | "saved" | "error";
  numero?: string | null;
  lastSaveText?: string;
  onPrev?: () => void;
  onSaveDraft?: () => void;
  onNext?: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  nextLabel?: string;
  /** Hide back button on first step */
  showPrev?: boolean;
  /** Hide next button on last step */
  showNext?: boolean;
  saving?: boolean;
}

export function FvFooter({
  autoSaveState,
  numero,
  lastSaveText,
  onPrev,
  onSaveDraft,
  onNext,
  prevDisabled,
  nextDisabled,
  nextLabel = "Avanti",
  showPrev = true,
  showNext = true,
  saving,
}: FvFooterProps) {
  return (
    <div className="sticky bottom-0 z-20 bg-white border-t border-slate-200 px-4 sm:px-8 py-3 flex items-center justify-between gap-3 flex-wrap shadow-[0_-4px_12px_rgba(15,23,42,0.04)] max-md:flex-nowrap max-md:px-3 max-md:py-2">
      {/* Telefono: lo stato del salvataggio c'è già in testata; restano i tre bottoni. */}
      <div className="flex items-center gap-3 text-xs text-slate-500 min-w-0 flex-wrap max-md:hidden">
        {autoSaveState === "saving" && (
          <span className="flex items-center gap-1.5 text-blue-600 font-medium">
            <Loader2 className="h-3 w-3 animate-spin" /> Salvataggio in corso…
          </span>
        )}
        {autoSaveState === "saved" && (
          <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Salvataggio automatico
          </span>
        )}
        {autoSaveState === "error" && (
          <span className="flex items-center gap-1.5 text-red-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-red-500" /> Errore salvataggio
          </span>
        )}
        {autoSaveState === "idle" && (
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-slate-300" /> Pronto
          </span>
        )}
        {lastSaveText && <span>· {lastSaveText}</span>}
        {numero && <span>· <code className="font-mono text-[11px]">{numero}</code></span>}
      </div>
      <div className="flex gap-2 items-center max-md:w-full">
        {showPrev && onPrev && (
          <button
            type="button"
            onClick={onPrev}
            disabled={prevDisabled || saving}
            aria-label="Indietro"
            className={cn(
              "px-4 py-2 text-sm font-semibold rounded-lg border border-slate-300 bg-white text-slate-700",
              "transition-all hover:bg-slate-50 hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0",
              "max-md:px-3.5",
            )}
          >
            ←<span className="max-md:hidden"> Indietro</span>
          </button>
        )}
        {onSaveDraft && (
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={saving}
            className={cn(
              "px-4 py-2 text-sm font-semibold rounded-lg border border-slate-300 bg-white text-slate-700",
              "transition-all hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed",
              "max-md:px-3",
            )}
          >
            Salva<span className="max-md:hidden"> bozza</span>
          </button>
        )}
        {showNext && onNext && (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled || saving}
            className={cn(
              "px-5 py-2 text-sm font-bold rounded-lg text-white transition-all",
              "bg-gradient-to-br from-orange-500 to-amber-400 shadow-[0_4px_12px_rgba(249,115,22,0.3)]",
              "hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(249,115,22,0.4)]",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:shadow-none",
              "max-md:flex-1",
            )}
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvataggio…
              </span>
            ) : (
              <>{nextLabel} →</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── FADE-IN WRAPPER per tab pane ─────────────────────────────────────────────

export function FvTabPane({ children, keyValue }: { children: ReactNode; keyValue: number | string }) {
  // Re-render con key fa partire l'animazione fadeIn dal CSS globale
  return (
    <div key={keyValue} className="animate-fv-fade-in">
      {children}
    </div>
  );
}
