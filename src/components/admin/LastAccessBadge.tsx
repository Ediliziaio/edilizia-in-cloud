import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";

type Tone = "green" | "amber" | "slate" | "muted";

/** Formatta l'ultimo accesso in italiano + un "tono" per il colore del badge. */
function formatLastAccess(iso: string | null | undefined, nowMs: number): { label: string; tone: Tone } {
  if (!iso) return { label: "Mai entrato", tone: "slate" };
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return { label: "—", tone: "muted" };
  const days = Math.floor((nowMs - t) / 86_400_000);
  let when: string;
  if (days <= 0) when = "oggi";
  else if (days === 1) when = "ieri";
  else if (days < 30) when = `${days} giorni fa`;
  else if (days < 60) when = "1 mese fa";
  else when = `${Math.floor(days / 30)} mesi fa`;
  if (days >= 30) return { label: `Inattivo · ${when}`, tone: "amber" };
  if (days <= 7) return { label: `Attivo · ${when}`, tone: "green" };
  return { label: `Visto ${when}`, tone: "muted" };
}

/** Badge "Ultimo accesso al portale" per le dashboard admin (produttori/studi). */
export function LastAccessBadge({ lastSignIn, nowMs, loading }: {
  lastSignIn: string | null | undefined;
  nowMs: number;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <Clock className="h-3 w-3 animate-pulse" /> …
      </Badge>
    );
  }
  const { label, tone } = formatLastAccess(lastSignIn, nowMs);
  const cls =
    tone === "green" ? "border-emerald-300 bg-emerald-50 text-emerald-700"
      : tone === "amber" ? "border-amber-300 bg-amber-50 text-amber-700"
        : tone === "slate" ? "border-slate-300 bg-slate-50 text-slate-600"
          : "text-muted-foreground";
  return (
    <Badge variant="outline" className={cn("gap-1", cls)} title="Ultimo accesso al portale">
      <Clock className="h-3 w-3" /> {label}
    </Badge>
  );
}
