import { LayoutPanelTop } from "lucide-react";
import type { AnteprimaPianta as Anteprima } from "@/lib/planimetrie/anteprime";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function AnteprimaPianta({ anteprima, titolo, caricando = false, compact = false, className }: { anteprima?: Anteprima; titolo: string; caricando?: boolean; compact?: boolean; className?: string }) {
  const t = useT();
  return <div className={cn("flex items-center justify-center overflow-hidden bg-slate-50 p-4", className)}>
    {anteprima ? <img src={anteprima.src} alt={t("Pianta di {titolo} · {piano}", { titolo: String(titolo ?? ""), piano: String(anteprima.piano ?? "") })} loading="lazy" decoding="async" className="h-full w-full object-contain" /> : <div className="flex flex-col items-center gap-2 text-muted-foreground"><LayoutPanelTop className={cn("h-9 w-9", caricando && "animate-pulse")} /><span className={compact ? "sr-only" : "text-xs"}>{caricando ? t("Preparo l'anteprima…") : t("Apri il disegno")}</span></div>}
  </div>;
}
