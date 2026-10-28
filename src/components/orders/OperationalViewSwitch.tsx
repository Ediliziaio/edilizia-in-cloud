import { Columns3, List } from "lucide-react";
import { cn } from "@/lib/utils";

export function OperationalViewSwitch({
  value,
  onChange,
  label = "Vista",
}: {
  value: "pipeline" | "elenco";
  onChange: (value: "pipeline" | "elenco") => void;
  label?: string;
}) {
  return (
    <div
      className="inline-flex shrink-0 gap-0.5 rounded-lg bg-muted/50 p-0.5"
      role="group"
      aria-label={label}
    >
      {(
        [
          ["pipeline", "Pipeline", Columns3],
          ["elenco", "Elenco", List],
        ] as const
      ).map(([id, nome, Icona]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            value === id
              ? "bg-orange-50 text-orange-800 ring-1 ring-inset ring-orange-100"
              : "text-slate-500 hover:text-slate-900",
          )}
        >
          <Icona className="h-3.5 w-3.5" />
          {nome}
        </button>
      ))}
    </div>
  );
}
