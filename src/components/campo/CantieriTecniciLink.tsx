import { ChevronRight, ClipboardList } from "lucide-react";
import { Link } from "react-router-dom";
import { useCantieriTecnici } from "@/hooks/campo/useSchedaCantiere";
import { percorsoCantiereTecnico } from "@/lib/campo/schedaCantiere";

export function CantieriTecniciLink() {
  const cantieri = useCantieriTecnici();
  if (cantieri.isError || !cantieri.data?.length) return null;
  return <Link to={percorsoCantiereTecnico(cantieri.data.length === 1 ? cantieri.data[0].id : undefined)}
    className="flex min-h-12 items-center gap-2.5 rounded-xl border bg-card px-3 py-2 text-sm font-semibold text-card-foreground">
    <ClipboardList className="size-5 shrink-0 text-primary" aria-hidden="true" />
    <span className="min-w-0 flex-1">Cantieri da seguire</span>
    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  </Link>;
}
