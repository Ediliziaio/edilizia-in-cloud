import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function StatoSalvataggio({ modificato, inCorso, descrizione }: {
  modificato: boolean;
  inCorso: boolean;
  descrizione?: string;
}) {
  const t = useT();
  return <div role="status" aria-live="polite" aria-atomic="true" className={cn("flex min-w-0 items-center gap-2 text-xs", modificato && !inCorso ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
    {inCorso ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" /> : !modificato ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />}
    <span>{inCorso ? t("Salvataggio…") : modificato ? t("Modifiche non salvate") : descrizione ?? t("Nessuna modifica da salvare")}</span>
  </div>;
}
