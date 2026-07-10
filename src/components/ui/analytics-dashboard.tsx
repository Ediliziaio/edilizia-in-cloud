import { cn } from "@/lib/utils";
import React, { useRef, useEffect, useState, type ReactNode } from "react";

/**
 * analytics-dashboard — card "mini dashboard" con tilt 3D al passaggio del
 * mouse, anello di progresso, tab con underline animata e metric card.
 *
 * Adattamento del componente 21st.dev "MinimalProfessionalCard" alle
 * convenzioni del progetto:
 *   • tema: token shadcn (bg-card/border-border/text-muted-foreground) +
 *     varianti `dark:` — NIENTE toggle dark interno (il tema è dell'app,
 *     tailwind darkMode: ["class"]);
 *   • niente wrapper min-h-screen: è una card componibile, non una pagina;
 *   • dati via props/children (il demo aveva numeri finti hardcoded);
 *   • underline tab MISURATA sui bottoni reali (il demo usava offset px
 *     fissi che si rompono con label di lunghezza diversa);
 *   • accent brand arancio/ambra del cockpit (il demo era blu/viola);
 *   • tilt disattivato con prefers-reduced-motion e su dispositivi touch.
 *
 * Sub-componenti esportati per comporre i contenuti delle tab:
 * DashboardStatCard, DashboardStatGrid, DashboardListRows, DashboardInsight.
 */

export interface AnalyticsDashboardTab {
  key: string;
  label: string;
  content: ReactNode;
}

export interface AnalyticsDashboardCardProps {
  title: string;
  subtitle?: string;
  /** Anello di progresso 0-100 (opzionale) con etichetta sotto al valore. */
  ring?: { value: number; label?: string };
  tabs: AnalyticsDashboardTab[];
  /** Azioni in fondo alla card (bottoni, link…). */
  footer?: ReactNode;
  /** Tilt 3D on-hover (default true; auto-off con reduced-motion). */
  tilt?: boolean;
  className?: string;
}

export function AnalyticsDashboardCard({
  title, subtitle, ring, tabs, footer, tilt = true, className,
}: AnalyticsDashboardCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState(tabs[0]?.key ?? "");
  // Underline animata: misurata sul bottone attivo (robusta a label variabili).
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [underline, setUnderline] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const el = tabRefs.current[activeTab];
    if (el) setUnderline({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeTab, tabs.length]);

  // Tilt 3D: solo pointer fine + no reduced-motion (in cantiere/touch è rumore).
  useEffect(() => {
    const card = cardRef.current;
    if (!card || !tilt) return;
    if (typeof window !== "undefined") {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (!window.matchMedia("(pointer: fine)").matches) return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const rotateY = ((x - rect.width / 2) / (rect.width / 2)) * 4;
      const rotateX = ((y - rect.height / 2) / (rect.height / 2)) * -4;
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    };
    const handleMouseLeave = () => {
      card.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg)";
    };

    card.addEventListener("mousemove", handleMouseMove);
    card.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      card.removeEventListener("mousemove", handleMouseMove);
      card.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [tilt]);

  const circumference = 2 * Math.PI * 20;
  const ringValue = Math.max(0, Math.min(100, Math.round(ring?.value ?? 0)));
  const strokeDashoffset = circumference - (circumference * ringValue) / 100;

  const active = tabs.find((t) => t.key === activeTab) ?? tabs[0];

  return (
    <div
      ref={cardRef}
      className={cn(
        "rounded-2xl border border-border bg-card p-6 transition-all duration-300 ease-out",
        "shadow-[0_1px_3px_rgba(0,0,0,0.05),0_10px_40px_rgba(0,0,0,0.06)]",
        "hover:shadow-[0_1px_3px_rgba(0,0,0,0.05),0_20px_60px_rgba(0,0,0,0.12)]",
        "dark:shadow-[0_1px_3px_rgba(0,0,0,0.3),0_10px_40px_rgba(0,0,0,0.35)]",
        className,
      )}
      style={{ transformStyle: "preserve-3d" }}
    >
      {/* header: titolo + anello */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-tight text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {ring && (
          <div className="relative shrink-0" title={ring.label}>
            <svg width="60" height="60">
              <defs>
                <linearGradient id="adc-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f97316" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
              </defs>
              <circle cx="30" cy="30" r="20" fill="none" strokeWidth="4" className="stroke-muted" />
              <circle
                cx="30" cy="30" r="20" fill="none"
                stroke="url(#adc-ring-gradient)" strokeWidth="4" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                className="origin-center -rotate-90 transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-semibold tabular-nums text-foreground">{ringValue}%</span>
            </div>
            {ring.label && (
              <p className="mt-0.5 text-center text-[9px] leading-tight text-muted-foreground">{ring.label}</p>
            )}
          </div>
        )}
      </div>

      {/* tab con underline animata misurata */}
      {tabs.length > 1 && (
        <div className="relative mb-4 flex gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.key}
              ref={(el) => { tabRefs.current[t.key] = el; }}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={cn(
                "relative z-10 px-3 py-2 text-sm font-medium transition-colors",
                t.key === active?.key ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
          <div
            className="absolute bottom-0 h-0.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-300 ease-in-out"
            style={{ left: underline.left, width: underline.width }}
          />
        </div>
      )}

      <div className="space-y-3">{active?.content}</div>

      {footer && <div className="mt-6 flex gap-3">{footer}</div>}
    </div>
  );
}

// ── Sub-componenti per i contenuti delle tab ─────────────────────────────────

/** Stat principale con badge e barra di avanzamento (stile "Monthly Revenue" del demo). */
export function DashboardStatCard({
  label, value, badge, badgeTone = "good", progress,
}: {
  label: string;
  value: string;
  badge?: string;
  badgeTone?: "good" | "warn";
  progress?: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {badge && (
          <span className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            badgeTone === "good"
              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
              : "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
          )}>
            {badge}
          </span>
        )}
      </div>
      <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {progress != null && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-400 transition-all duration-500"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}

/** Griglia di mini-metriche (3 colonne come il demo). */
export function DashboardStatGrid({ metrics }: { metrics: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {metrics.map((m) => (
        <div key={m.label} className="rounded-lg border border-border bg-muted/40 p-3">
          <p className="mb-1 truncate text-xs text-muted-foreground">{m.label}</p>
          <p className="truncate text-lg font-semibold tabular-nums text-foreground">{m.value}</p>
        </div>
      ))}
    </div>
  );
}

/** Righe puntino-colorato · label · valore (stile tab "analytics" del demo). */
export function DashboardListRows({ rows }: { rows: { color: string; label: string; value: string }[] }) {
  return (
    <div>
      {rows.map((r, i) => (
        <div
          key={r.label}
          className={cn("flex items-center justify-between py-2.5", i < rows.length - 1 && "border-b border-border/70")}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", r.color)} />
            <span className="truncate text-sm text-foreground">{r.label}</span>
          </div>
          <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Blocco insight testuale con bullet (stile tab "reports" del demo). */
export function DashboardInsight({ title, bullets }: { title: string; bullets: string[] }) {
  return (
    <div className="rounded-lg border border-border bg-gradient-to-r from-orange-50 to-amber-50 p-4 dark:from-orange-950/20 dark:to-amber-950/20">
      <h4 className="mb-2 text-sm font-medium text-foreground">{title}</h4>
      <ul className="space-y-1.5">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2">
            <span className="mt-0.5 text-xs text-muted-foreground">•</span>
            <span className="text-xs leading-relaxed text-muted-foreground">{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
