import { LayoutPanelTop } from "lucide-react";
import type { AnteprimaPianta as Anteprima } from "@/lib/planimetrie/anteprime";
import { cn } from "@/lib/utils";

export function AnteprimaPianta({ anteprima, titolo, caricando = false, compact = false, className }: { anteprima?: Anteprima; titolo: string; caricando?: boolean; compact?: boolean; className?: string }) {
  return <div className={cn("flex items-center justify-center overflow-hidden bg-slate-50 p-4", className)}>
    {anteprima ? <img src={anteprima.src} alt={`Pianta di ${titolo} · ${anteprima.piano}`} loading="lazy" decoding="async" className="h-full w-full object-contain" /> : <div className="flex flex-col items-center gap-2 text-muted-foreground"><LayoutPanelTop className={cn("h-9 w-9", caricando && "animate-pulse")} /><span className={compact ? "sr-only" : "text-xs"}>{caricando ? "Preparo l'anteprima…" : "Apri il disegno"}</span></div>}
  </div>;
}
