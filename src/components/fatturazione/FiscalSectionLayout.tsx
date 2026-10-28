import type { ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Shared presentation only: each section retains its own sources and period rules. */
export function FiscalSectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

export function FiscalMetric({
  label,
  value,
  description,
  warning = false,
  onClick,
  active = false,
}: {
  label: string;
  value: ReactNode;
  description?: ReactNode;
  warning?: boolean;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`relative min-w-0 rounded-xl border p-4 ${warning ? "border-amber-200 bg-amber-50" : "bg-white"} ${active ? "ring-2 ring-blue-300" : ""} ${onClick ? "transition-shadow hover:shadow-sm" : ""}`}
    >
      {onClick && (
        <button
          type="button"
          aria-label={`Filtra: ${label}`}
          aria-pressed={active}
          onClick={onClick}
          className="absolute inset-0 cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <span className="sr-only">Mostra le righe corrispondenti</span>
        </button>
      )}
      {onClick && (
        <span
          aria-hidden="true"
          className="absolute right-3 top-3 text-xs text-blue-600"
        >
          ↗
        </span>
      )}
      <p className="pr-4 text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-2xl font-semibold tabular-nums text-slate-950">
        {value}
      </p>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export function FiscalSelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-auto min-w-40 rounded-xl">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72 rounded-xl">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
