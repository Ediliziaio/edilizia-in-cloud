/**
 * src/lib/serramenti/wizardUI.tsx — Componenti UI condivisi del wizard.
 *
 * Estratti per mantenere SerramentiWizard.tsx leggibile e per garantire
 * coerenza estetica (tema verde elegante #2D7D5C come da PDF reference).
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  // Variant "highlight" usa ora il blu navy brand (#173b67) come accent
  // border-left invece di arancione pieno -> evita la saturazione "tutto
  // arancione" denunciata dall'utente. L'arancione resta per CTA + KPI
  // primary (es. "IVA inclusa").
  return (
    <Card className={cn(
      variant === "highlight" && "border-l-4 border-l-[#173b67] border-slate-200",
      variant === "muted" && "bg-muted/30",
      className,
    )}>
      {(title || icon) && (
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            {icon && <span className={variant === "highlight" ? "text-[#173b67]" : "text-slate-700"}>{icon}</span>}
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
  // Differenziazione semantica dei colori (prima `success` era identico a
  // `primary` -> tutto arancione monocromatico):
  //   - default: neutro (slate/bianco)
  //   - primary: arancione brand (KPI principale, es. "IVA inclusa")
  //   - success: verde emerald (valori positivi: detrazioni, risparmi)
  //   - warning: ambra (attenzione)
  const colors = {
    default: "bg-white text-slate-900 border-slate-200",
    primary: "bg-orange-50 text-orange-900 border-orange-200",
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
  // success ora e' VERDE (era arancione, identico a primary -> nessuna
  // differenziazione semantica). Pattern coerente con SrKpi.success.
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

// NB: i format helpers (formatEuro / formatPct / formatNumero) sono stati
// estratti in `@/lib/serramenti/format.ts` per silenziare i warning
// react-refresh (HMR non supporta moduli che esportano componenti +
// funzioni). Tutti i consumer ora importano direttamente da
// `@/lib/serramenti/format`.

