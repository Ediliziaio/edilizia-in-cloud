import { ChevronRight, ClipboardList } from "lucide-react";
import { Link } from "react-router-dom";
import { useCantieriTecnici } from "@/hooks/campo/useSchedaCantiere";
import { percorsoCantiereTecnico } from "@/lib/campo/schedaCantiere";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Classe delle pastiglie della riga «Da sistemare» in Attività (25/11/2026). */
export const PASTIGLIA_DA_SISTEMARE = "inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted";

export function CantieriTecniciLink({ compatto = false }: { compatto?: boolean } = {}) {
  const cantieri = useCantieriTecnici();
  const t = useT();
  if (cantieri.isError || !cantieri.data?.length) return null;
  const href = percorsoCantiereTecnico(cantieri.data.length === 1 ? cantieri.data[0].id : undefined);
  if (compatto) return <Link to={href} className={PASTIGLIA_DA_SISTEMARE}>
    <ClipboardList className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
    {t("Cantieri da seguire")}
    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
  </Link>;
  return <Link to={percorsoCantiereTecnico(cantieri.data.length === 1 ? cantieri.data[0].id : undefined)}
    className="flex min-h-12 items-center gap-2.5 rounded-full border bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-sm active:bg-muted">
    <ClipboardList className="size-5 shrink-0 text-primary" aria-hidden="true" />
    <span className="min-w-0 flex-1">{t("Cantieri da seguire")}</span>
    <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
  </Link>;
}
