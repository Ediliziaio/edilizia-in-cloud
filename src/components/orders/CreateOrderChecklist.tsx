import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  checks: ReadonlyArray<{ label: string; done: boolean }>;
}

/**
 * Cosa manca per creare la commessa, in una riga sola accanto a «Crea commessa» (14/11/2026).
 * Prima era una scheda alta in cima alla pagina, con un pallino per ogni controllo anche quando era a posto:
 * ora si legge solo quello che manca.
 */
export function CreateOrderChecklist({ checks }: Props) {
  const t = useT();
  const mancanti = checks.filter((check) => !check.done).map((check) => t(check.label));
  const pronto = mancanti.length === 0;
  return (
    <p
      aria-label={pronto ? t("Controlli commessa: tutto pronto") : t("Controlli commessa: manca {voci}", { voci: mancanti.join(", ") })}
      className={cn("flex min-w-0 items-center gap-1.5 text-xs", pronto ? "text-emerald-700" : "text-amber-800")}
    >
      {pronto
        ? <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        : <Circle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
      <span className="min-w-0 truncate">{pronto ? t("Tutto pronto") : t("Manca: {voci}", { voci: mancanti.join(" · ") })}</span>
    </p>
  );
}
