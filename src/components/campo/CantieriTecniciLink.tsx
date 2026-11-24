import { ChevronRight, ClipboardList } from "lucide-react";
import { Link } from "react-router-dom";
import { useCantieriTecnici } from "@/hooks/campo/useSchedaCantiere";
import { percorsoCantiereTecnico } from "@/lib/campo/schedaCantiere";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function CantieriTecniciLink() {
  const cantieri = useCantieriTecnici();
  const t = useT();
  if (cantieri.isError || !cantieri.data?.length) return null;
  return <Link to={percorsoCantiereTecnico(cantieri.data.length === 1 ? cantieri.data[0].id : undefined)}
    className="flex min-h-12 items-center gap-2.5 rounded-full border bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-sm active:bg-muted">
    <ClipboardList className="size-5 shrink-0 text-primary" aria-hidden="true" />
    <span className="min-w-0 flex-1">{t("Cantieri da seguire")}</span>
    <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
  </Link>;
}
