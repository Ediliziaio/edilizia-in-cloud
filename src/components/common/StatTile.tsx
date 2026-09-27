/**
 * Riquadro numerico delle testate «famiglia» (Assistenza, Manutenzioni, …):
 * numero grande + etichetta, colore per tono. Se ha `onClick` è un filtro
 * cliccabile, altrimenti un dato. Un solo componente così le schermate sono
 * identiche.
 */
import { cn } from "@/lib/utils";

export type StatTileTone = "red" | "amber" | "blue" | "green" | "violet" | "neutral";

const TONI: Record<StatTileTone, string> = {
  red: "border-red-200 bg-red-50 text-red-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
  neutral: "border-slate-200 bg-white text-slate-500",
};

export function StatTile({
  label, value, tone = "neutral", hint, active, onClick,
}: {
  label: string;
  value: string | number;
  tone?: StatTileTone;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const cls = cn(
    "flex flex-col items-start rounded-xl border px-4 py-3 text-left transition-colors",
    TONI[tone],
    active && "ring-2 ring-slate-900/40 ring-offset-1",
  );
  const inner = (
    <>
      <span className="text-2xl font-bold leading-none tabular-nums">{value}</span>
      <span className="mt-1 text-xs font-semibold uppercase tracking-wide">{label}</span>
      {hint && <span className="mt-0.5 text-[11px] font-normal normal-case opacity-70">{hint}</span>}
    </>
  );
  if (onClick) {
    return <button type="button" onClick={onClick} aria-pressed={active} className={cls}>{inner}</button>;
  }
  return <div className={cls}>{inner}</div>;
}
