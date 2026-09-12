/**
 * Quale pipeline conta come marketing.
 *
 * Diversi clienti ne hanno più di una: quella viva, l'import storico, una per
 * canale. Contarle insieme gonfia l'imbuto e rende illeggibile il tasso di
 * lavorazione. Qui si scelgono quelle che contano; se non si sceglie niente
 * contano tutte, che è il comportamento di sempre.
 */
import { useState } from "react";
import { Check, GitBranch, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { numero } from "./formato";
import type { PipelineCliente } from "./useSchedaCliente";

function Elenco({
  pipeline, salvataggio, onSalva,
}: {
  pipeline: PipelineCliente[];
  salvataggio: boolean;
  onSalva: (ids: string[] | null) => void;
}) {
  const tutte = pipeline.every((p) => p.tutte);
  const [scelte, setScelte] = useState<Set<string>>(
    () => new Set(tutte ? [] : pipeline.filter((p) => p.scelta).map((p) => p.id)),
  );
  const cambiato = tutte
    ? scelte.size > 0
    : scelte.size !== pipeline.filter((p) => p.scelta).length
      || pipeline.filter((p) => p.scelta).some((p) => !scelte.has(p.id));

  const inverti = (id: string) => {
    setScelte((prec) => {
      const next = new Set(prec);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {pipeline.map((p) => {
          const attiva = scelte.has(p.id);
          return (
            <button key={p.id} type="button" onClick={() => inverti(p.id)}
              title={`${numero(p.opportunita)} opportunità in tutto, ${numero(p.nuove_30gg)} negli ultimi 30 giorni`}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                attiva ? "border-primary bg-primary/10 font-medium text-foreground"
                       : "text-muted-foreground hover:text-foreground")}>
              {attiva && <Check className="h-3 w-3" />}
              {p.nome}
              <span className="text-muted-foreground">{numero(p.nuove_30gg)} nuove</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
          disabled={!cambiato || salvataggio}
          onClick={() => onSalva(scelte.size > 0 ? [...scelte] : null)}>
          {salvataggio ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Usa solo queste
        </Button>
        {scelte.size === 0 && (
          <span className="text-[11px] text-muted-foreground">
            nessuna scelta: i numeri contano tutte le pipeline
          </span>
        )}
      </div>
    </div>
  );
}

export function PipelineScelta({
  pipeline, caricamento, salvataggio, onSalva,
}: {
  pipeline: PipelineCliente[];
  caricamento: boolean;
  salvataggio: boolean;
  onSalva: (ids: string[] | null) => void;
}) {
  if (caricamento || pipeline.length <= 1) return null;
  const tutte = pipeline.every((p) => p.tutte);

  return (
    <section className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Questo cliente ha {numero(pipeline.length)} pipeline
        </h4>
        {tutte && (
          <span className="text-[11px] text-amber-700 dark:text-amber-400">
            adesso i numeri le sommano tutte, import storici compresi
          </span>
        )}
      </div>
      <Elenco
        key={pipeline.map((p) => `${p.id}:${p.scelta}`).join("|")}
        pipeline={pipeline}
        salvataggio={salvataggio}
        onSalva={onSalva}
      />
    </section>
  );
}
