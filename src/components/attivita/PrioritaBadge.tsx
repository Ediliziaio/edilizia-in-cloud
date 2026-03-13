import { cn } from "@/lib/utils";

const CONFIG: Record<string, { label: string; className: string }> = {
  urgente: { label: "Urgente", className: "bg-destructive/10 text-destructive border-destructive/20" },
  alta: { label: "Alta", className: "bg-warning/10 text-warning border-warning/20" },
  normale: { label: "Normale", className: "bg-primary/10 text-primary border-primary/20" },
  bassa: { label: "Bassa", className: "bg-muted text-muted-foreground border-border" },
};

export function PrioritaBadge({ priorita }: { priorita: string }) {
  const cfg = CONFIG[priorita] ?? CONFIG.normale;
  return (
    <span className={cn("inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border", cfg.className)}>
      {cfg.label}
    </span>
  );
}
