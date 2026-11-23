import type { OperationalScope } from "@/hooks/useOperationalArchive";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
export function OperationalArchive({
  scope,
  onChange,
  active,
  history,
  label,
}: {
  scope: OperationalScope;
  onChange: (value: OperationalScope) => void;
  active: number;
  history: number;
  label: string;
}) {
  const t = useT();
  return (
    <div
      className="flex flex-wrap items-center gap-1"
      role="group"
      aria-label={t("Ambito {label}", { label })}
    >
      {(
        [
          ["active", "Da gestire", active],
          ["history", "Storico", history],
          ["all", "Tutti", active + history],
        ] as const
      ).map(([value, title, count]) => (
        <button
          key={value}
          type="button"
          aria-label={`${t(title)} ${count}`}
          aria-pressed={scope === value}
          onClick={() => onChange(value)}
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-md px-2.5 text-xs font-medium focus-visible:ring-2 focus-visible:ring-primary",
            scope === value
              ? "bg-slate-900 text-white"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {t(title)}
          <span
            className={cn(
              "rounded-full px-1.5 text-[10px] tabular-nums",
              scope === value ? "bg-white/15" : "bg-slate-100",
            )}
          >
            {count}
          </span>
        </button>
      ))}
    </div>
  );
}
