// src/components/orders/generali/contratto/RiquadroContratto.tsx
// Il riquadro del contratto in Panoramica: scadenze vicine, ritenute trattenute e da svincolare,
// anticipazione da recuperare, ultimo SAL. Silenzioso se la lettura non riesce: la Panoramica
// non si ferma per un modulo.
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { PropsScheda } from "@/components/orders/generali/tipiScheda";
import { useDatiContratto } from "@/hooks/useGeneraleContratto";
import { anticipazione, oggiIso, ritenute, scadenzeContratto, totaliSal, valoreContratto } from "@/lib/orders/generali/contratto";
import { cn } from "@/lib/utils";
import { dataIt, euro } from "./formato";

export function RiquadroContratto({ riepilogo }: PropsScheda) {
  const { data: dati, isLoading, isError } = useDatiContratto(riepilogo.generale.id, riepilogo.permessi.importi);
  const [parametri] = useSearchParams();
  if (!riepilogo.permessi.importi || isError) return null;
  if (isLoading || !dati) return <Skeleton className="h-24 w-full rounded-lg" />;
  if (!dati.permessi.importi) return null;

  const link = (sezione?: string) => {
    const p = new URLSearchParams(parametri);
    p.set("scheda", "contratto");
    if (sezione) p.set("sezione", sezione); else p.delete("sezione");
    return { search: `?${p.toString()}` };
  };
  const valore = valoreContratto(dati.contratto, dati.atti);
  if (!valore) {
    return (
      <section aria-label="Contratto" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-3">
        <p className="text-sm text-muted-foreground">Inserisci il valore del contratto per vedere il residuo, le ritenute e le scadenze.</p>
        <Link to={link()} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          Vai al contratto <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </section>
    );
  }

  const t = totaliSal(dati.sal);
  const r = ritenute(dati.sal);
  const ant = anticipazione(dati.contratto, dati.sal);
  const scadenze = scadenzeContratto(dati, oggiIso()).slice(0, 3);
  const ultimo = [...dati.sal].filter((s) => s.stato !== "bozza").sort((a, b) => b.numero - a.numero)[0];

  return (
    <section aria-labelledby="riquadro-contratto-titolo" className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-2.5">
        <h2 id="riquadro-contratto-titolo" className="text-sm font-semibold">Contratto e SAL</h2>
        <Link to={link("sal")} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          {ultimo ? `Ultimo SAL n. ${ultimo.numero}${ultimo.al ? ` al ${dataIt(ultimo.al)}` : ""}` : "Nessun SAL emesso"} <ArrowRight className="h-3 w-3" />
        </Link>
      </header>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-sm md:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">A SAL</dt>
          <dd className="tabular-nums">{euro(t.aSal)} <span className="text-xs text-muted-foreground">su {euro(valore.aggiornato)}</span></dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Netto dei SAL</dt>
          <dd className="tabular-nums">{euro(t.netto)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Ritenute da svincolare</dt>
          <dd className="tabular-nums">
            {euro(r.daSvincolare)}
            {r.trattenute > 0 && <span className="text-xs text-muted-foreground"> su {euro(r.trattenute)} trattenute</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Anticipazione da recuperare</dt>
          <dd className="tabular-nums">{ant.importo > 0 ? euro(ant.daRecuperare) : <span className="text-muted-foreground">nessuna</span>}</dd>
        </div>
      </dl>
      {scadenze.length > 0 && (
        <ul className="space-y-1 border-t px-4 py-2.5">
          {scadenze.map((s) => (
            <li key={s.id} className={cn("flex items-start gap-2 text-sm", s.tono === "attenzione" && "text-amber-800 dark:text-amber-300")}>
              {s.tono === "attenzione" ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              <Link to={link(s.id === "sal-bozza" ? "sal" : undefined)} className="hover:underline">{s.testo}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
