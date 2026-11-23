import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export interface MacrofaseSubappalto {
  id: string;
  nome: string;
  voci: number;
  dettaglio?: string;
}

export function MacrofasiSubappalto({ fasi, attiva, onSeleziona, children }: {
  fasi: readonly MacrofaseSubappalto[];
  attiva: string;
  onSeleziona: (id: string) => void;
  children: ReactNode;
}) {
  const t = useT();
  return <div className="grid min-h-0 min-w-0 gap-3 md:grid-cols-[11.5rem_minmax(0,1fr)]">
    <nav aria-label={t("Macrofasi")} className="flex min-w-0 self-start overflow-x-auto rounded-lg border md:max-h-full md:flex-col md:overflow-y-auto">
      {[{ id: "", nome: t("Tutte le fasi"), voci: fasi.reduce((n, f) => n + f.voci, 0), dettaglio: undefined }, ...fasi].map(fase => (
        <button key={fase.id} type="button" aria-pressed={attiva === fase.id}
          onClick={() => onSeleziona(fase.id)}
          className={cn("flex shrink-0 items-baseline justify-between gap-2 border-r px-2.5 py-2 text-left text-xs md:border-r-0 md:border-b md:last:border-b-0",
            attiva === fase.id ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted/50")}>
          <span className="min-w-0 break-words">{fase.nome}{fase.dettaglio && <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{fase.dettaglio}</span>}</span>
          <span className="shrink-0 tabular-nums">{fase.voci}</span>
        </button>
      ))}
    </nav>
    <div className="min-h-0 min-w-0">{children}</div>
  </div>;
}
