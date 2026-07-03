import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOrderScheduleHealth } from "@/hooks/useOrderScheduleHealth";
import { cn } from "@/lib/utils";

/**
 * Badge semaforo tempi della commessa (Fase C rapportini):
 * - in_linea → verde "In linea"
 * - in_anticipo → azzurro "In anticipo (+Ngg)"
 * - in_ritardo → rosso "In ritardo di Ngg — {fase critica}"
 * Non renderizza nulla se la commessa non ha fasi datate (non_configurato).
 * Tooltip con le fasi problematiche (reale sotto l'atteso a oggi).
 */
interface OrderScheduleBadgeProps {
  orderId: string;
  className?: string;
}

export function OrderScheduleBadge({ orderId, className }: OrderScheduleBadgeProps) {
  const { data: health } = useOrderScheduleHealth(orderId);

  if (!health || health.stato === "non_configurato") return null;

  const giorni = Math.round(Math.abs(Number(health.giorni_scarto ?? 0)));

  let label: string;
  let tone: string;
  if (health.stato === "in_ritardo") {
    label = `In ritardo di ${giorni}gg${health.fase_critica ? ` — ${health.fase_critica}` : ""}`;
    tone = "border-red-300 bg-red-50 text-red-700";
  } else if (health.stato === "in_anticipo") {
    label = `In anticipo (+${giorni}gg)`;
    tone = "border-sky-300 bg-sky-50 text-sky-700";
  } else {
    label = "In linea";
    tone = "border-emerald-300 bg-emerald-50 text-emerald-700";
  }

  const badge = (
    <Badge variant="outline" className={cn("gap-1 whitespace-nowrap", tone, className)}>
      {label}
    </Badge>
  );

  // Fasi problematiche: avanzamento reale sotto quello atteso a oggi
  const problematiche = health.fasi.filter((f) => Number(f.delta_pct) < 0);
  if (problematiche.length === 0) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="mb-1 font-semibold">Fasi indietro rispetto al previsto</p>
        <ul className="space-y-0.5">
          {problematiche.map((f) => (
            <li key={f.id} className="text-xs">
              {f.name}: reale {Math.round(Number(f.actual_pct))}% vs atteso{" "}
              {Math.round(Number(f.expected_pct))}%
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}
