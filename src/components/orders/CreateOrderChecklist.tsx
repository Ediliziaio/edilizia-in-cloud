import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  checks: ReadonlyArray<{ label: string; done: boolean }>;
}

/**
 * Cosa manca per creare la commessa, in una riga sola accanto a «Crea commessa» (14/11/2026).
 * Prima era una scheda alta in cima alla pagina, con un pallino per ogni controllo anche quando era a posto:
 * ora si legge solo quello che manca.
 */
export function CreateOrderChecklist({ checks }: Props) {
  const mancanti = checks.filter((check) => !check.done).map((check) => check.label);
  const pronto = mancanti.length === 0;
  return (
    <p
      aria-label={pronto ? "Controlli commessa: tutto pronto" : `Controlli commessa: manca ${mancanti.join(", ")}`}
      className={cn("flex min-w-0 items-center gap-1.5 text-xs", pronto ? "text-emerald-700" : "text-amber-800")}
    >
      {pronto
        ? <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        : <Circle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
      <span className="min-w-0 truncate">{pronto ? "Tutto pronto" : `Manca: ${mancanti.join(" · ")}`}</span>
    </p>
  );
}
