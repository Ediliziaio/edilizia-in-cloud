/**
 * src/lib/serramenti/wizardUI.tsx — Componenti UI condivisi del wizard.
 *
 * Estratti per mantenere SerramentiWizard.tsx leggibile e per garantire
 * coerenza estetica (tema verde elegante #2D7D5C come da PDF reference).
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// ─── SrCard: container con bordo verde tenue, header opzionale ──────────────

interface SrCardProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
  /** Variant 'highlight' per evidenziare (verde più marcato) */
  variant?: "default" | "highlight" | "muted";
}

export function SrCard({ title, description, icon, className, children, variant = "default" }: SrCardProps) {
  return (
    <Card className={cn(
      variant === "highlight" && "border-emerald-300 bg-emerald-50/30",
      variant === "muted" && "bg-muted/30",
      className,
    )}>
      {(title || icon) && (
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            {icon && <span className="text-emerald-700">{icon}</span>}
            {title}
          </CardTitle>
          {description && (
            <p className="text-[11px] text-muted-foreground mt-1">{description}</p>
          )}
        </CardHeader>
      )}
      <CardContent className={cn("p-4", title && "pt-2")}>
        {children}
      </CardContent>
    </Card>
  );
}

// ─── SrKpi: blocco numerico evidenziato ─────────────────────────────────────

interface SrKpiProps {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  variant?: "default" | "primary" | "success" | "warning";
  className?: string;
}

export function SrKpi({ label, value, unit, hint, variant = "default", className }: SrKpiProps) {
  const colors = {
    default: "bg-muted/30 text-foreground",
    primary: "bg-emerald-50 text-emerald-900 border-emerald-200",
    success: "bg-emerald-50 text-emerald-900 border-emerald-200",
    warning: "bg-amber-50 text-amber-900 border-amber-200",
  };
  return (
    <div className={cn("rounded-md border p-3", colors[variant], className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-xl font-bold mt-0.5 tabular-nums">
        {value}
        {unit && <span className="text-xs font-normal opacity-70 ml-1">{unit}</span>}
      </p>
      {hint && <p className="text-[10px] opacity-60 mt-0.5">{hint}</p>}
    </div>
  );
}

// ─── SrCallout: box info/warning ────────────────────────────────────────────

interface SrCalloutProps {
  variant?: "info" | "success" | "warning" | "danger";
  icon?: ReactNode;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function SrCallout({ variant = "info", icon, title, children, className }: SrCalloutProps) {
  const colors = {
    info:    "bg-sky-50 border-sky-200 text-sky-900",
    success: "bg-emerald-50 border-emerald-200 text-emerald-900",
    warning: "bg-amber-50 border-amber-200 text-amber-900",
    danger:  "bg-rose-50 border-rose-200 text-rose-900",
  };
  return (
    <div className={cn("rounded-md border p-3 text-xs", colors[variant], className)}>
      {(icon || title) && (
        <div className="flex items-center gap-2 mb-1">
          {icon}
          {title && <p className="font-semibold">{title}</p>}
        </div>
      )}
      <div className={cn(title ? "" : "leading-relaxed")}>{children}</div>
    </div>
  );
}

// ─── SrBadgeStato: badge stato progetto ─────────────────────────────────────

export const SR_STATO_BADGE: Record<string, { label: string; className: string }> = {
  bozza:           { label: "Bozza",          className: "bg-slate-100 text-slate-700 border-slate-200" },
  da_consegnare:   { label: "Da consegnare",  className: "bg-amber-100 text-amber-700 border-amber-200" },
  consegnato:      { label: "Consegnato",     className: "bg-sky-100 text-sky-700 border-sky-200" },
  in_valutazione:  { label: "In valutazione", className: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  accettato:       { label: "Accettato",      className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  rifiutato:       { label: "Rifiutato",      className: "bg-rose-100 text-rose-700 border-rose-200" },
  scaduto:         { label: "Scaduto",        className: "bg-slate-100 text-slate-500 border-slate-200" },
  archiviato:      { label: "Archiviato",     className: "bg-slate-100 text-slate-400 border-slate-200" },
};

export function SrBadgeStato({ stato }: { stato: string }) {
  const cfg = SR_STATO_BADGE[stato] ?? SR_STATO_BADGE.bozza;
  return (
    <Badge variant="outline" className={cn("text-[10px]", cfg.className)}>
      {cfg.label}
    </Badge>
  );
}

// ─── Format helpers ─────────────────────────────────────────────────────────

export const formatEuro = (n: number | null | undefined, decimals = 0): string => {
  if (n == null || isNaN(Number(n))) return "—";
  return `€ ${Number(n).toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};

export const formatPct = (n: number | null | undefined, decimals = 0): string => {
  if (n == null || isNaN(Number(n))) return "—";
  return `${Number(n).toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
};

export const formatNumero = (n: number | null | undefined, decimals = 0): string => {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

// Colore primario del modulo Serramenti (verde elegante dal PDF reference)
export const SR_GREEN = "#2D7D5C";
export const SR_GREEN_LIGHT = "#E8F3EE";
