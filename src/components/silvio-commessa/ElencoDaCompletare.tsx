/**
 * «Da completare» (31/10/2026, fase 2, lotto 2.3): la scheda delle Commesse con le commesse
 * aperte che hanno dei buchi, le più urgenti per prime (inizio vicino, poi importo), col
 * punteggio e cosa manca. «Completa» apre il popup di Silvio su una; «Completa le prossime 5»
 * le apre una dopo l'altra: dopo «Completa» (o «Salta») arriva la prossima, senza tornare qui.
 */
import { lazy, Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  attuale, avanza, avviaSequenza, cosaManca, erroreElenco, leggiDaCompletare, PROSSIME, quando,
  type CommessaDaCompletare, type Sequenza,
} from "@/lib/silvio-commessa/daCompletare";
import { euro } from "./presentazione";
import type { ServiziSilvioCommessa } from "./servizi";

const CreaConSilvioDialog = lazy(() => import("./CreaConSilvioDialog"));

export interface ElencoDaCompletareProps {
  companyId: string;
  userId: string;
  /** Per i test: la lettura dell'elenco e i servizi del popup. */
  leggi?: (companyId: string) => Promise<CommessaDaCompletare[]>;
  servizi?: ServiziSilvioCommessa;
}

function colorePunteggio(p: number) {
  return p < 40 ? "text-red-700" : p < 70 ? "text-amber-700" : "text-emerald-700";
}

export function ElencoDaCompletare({ companyId, userId, leggi = (id) => leggiDaCompletare(id), servizi }: ElencoDaCompletareProps) {
  const queryClient = useQueryClient();
  const chiave = ["silvio-commessa", "da-completare", companyId];
  const elenco = useQuery({ queryKey: chiave, queryFn: () => leggi(companyId), retry: false });
  const [singola, setSingola] = useState<string | null>(null);
  const [sequenza, setSequenza] = useState<Sequenza | null>(null);
  const [fatto, setFatto] = useState<Sequenza | null>(null);

  const righe = elenco.data ?? [];
  const perId = new Map(righe.map((r) => [r.order_id, r]));
  const aperta = singola ?? attuale(sequenza);
  const riga = aperta ? perId.get(aperta) : undefined;

  const ricarica = () => queryClient.invalidateQueries({ queryKey: chiave });
  const prossima = (come: "completata" | "saltata") => {
    if (!sequenza) return;
    const dopo = avanza(sequenza, come);
    if (attuale(dopo) === null) {
      setSequenza(null);
      setFatto(dopo);
      void ricarica();
    } else setSequenza(dopo);
  };
  const chiudi = () => {
    if (sequenza) {
      setFatto(sequenza.completate.length || sequenza.saltate.length ? sequenza : null);
      setSequenza(null);
    }
    setSingola(null);
    void ricarica();
  };

  if (elenco.isLoading) {
    return <p className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Conto cosa manca alle commesse…</p>;
  }
  if (elenco.error) {
    return (
      <p role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />{erroreElenco(elenco.error)}
      </p>
    );
  }

  const totale = righe[0]?.totale ?? 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-slate-900">Da completare</h2>
          <p className="text-sm text-slate-500">
            {totale
              ? `${totale} ${totale === 1 ? "commessa aperta ha" : "commesse aperte hanno"} dei buchi: prima quelle che partono o finiscono prima, poi le più grandi.`
              : "Tutte le commesse aperte sono complete."}
          </p>
        </div>
        {righe.length > 0 && (
          <Button type="button" className="gap-2 bg-orange-600 hover:bg-orange-700 max-sm:w-full"
            onClick={() => { setFatto(null); setSequenza(avviaSequenza(righe)); }}>
            <Sparkles className="h-4 w-4" aria-hidden />Completa le prossime {Math.min(PROSSIME, righe.length)}
          </Button>
        )}
      </div>

      {fatto && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            {fatto.completate.length} {fatto.completate.length === 1 ? "commessa completata" : "commesse completate"}
            {fatto.saltate.length ? `, ${fatto.saltate.length} ${fatto.saltate.length === 1 ? "saltata" : "saltate"}` : ""}.
          </p>
          <button type="button" className="rounded p-1 hover:bg-emerald-100" aria-label="Chiudi" onClick={() => setFatto(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      {righe.length > 0 && (
        <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Commesse da completare">
          {righe.map((r, i) => {
            const tempo = quando(r);
            return (
              <li key={r.order_id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 sm:grid-cols-[2rem_minmax(0,1.6fr)_minmax(0,1fr)_9rem_auto] sm:px-4">
                <span className="hidden text-xs tabular-nums text-slate-400 sm:block">{i + 1}</span>
                <div className="col-start-1 row-start-1 min-w-0 sm:col-start-auto sm:row-start-auto">
                  <Link to={`/azienda/ordini/${r.order_id}`} className="block truncate text-sm font-medium text-slate-900 hover:underline">
                    {r.order_code ?? "—"}{r.titolo ? ` · ${r.titolo}` : ""}
                  </Link>
                  <p className="truncate text-xs text-slate-500">
                    {[r.cliente, tempo, r.importo != null && r.importo > 0 ? euro(r.importo) : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <p className="col-start-1 row-start-2 min-w-0 truncate text-xs text-slate-600 sm:col-start-auto sm:row-start-auto" title={cosaManca(r.mancano, 99)}>
                  <span className="text-slate-400">Manca: </span>{cosaManca(r.mancano)}
                </p>
                <div className="col-start-2 row-start-1 flex items-center justify-end gap-2 sm:col-start-auto sm:row-start-auto">
                  <Progress value={r.punteggio} className="hidden h-1.5 w-16 sm:block" aria-hidden />
                  <span className={cn("text-sm font-semibold tabular-nums", colorePunteggio(r.punteggio))}>
                    {r.punteggio} %<span className="sr-only"> completa</span>
                  </span>
                </div>
                <Button type="button" size="sm" variant="outline" className="col-start-2 row-start-2 h-8 gap-1 sm:col-start-auto sm:row-start-auto"
                  onClick={() => setSingola(r.order_id)} aria-label={`Completa ${r.order_code ?? "la commessa"} con Silvio`}>
                  <Sparkles className="h-3.5 w-3.5 text-orange-600" aria-hidden />Completa
                </Button>
              </li>
            );
          })}
        </ol>
      )}
      {righe.length > 0 && totale > righe.length && (
        <p className="px-1 text-xs text-slate-500">Le prime {righe.length} di {totale}: completate queste, arrivano le altre.</p>
      )}

      {aperta && (
        <Suspense fallback={null}>
          <CreaConSilvioDialog
            key={aperta}
            open
            onOpenChange={(o) => { if (!o) chiudi(); }}
            companyId={companyId}
            userId={userId}
            servizi={servizi}
            orderId={aperta}
            etichettaCommessa={riga?.order_code ?? null}
            sequenza={sequenza ? { posizione: sequenza.indice + 1, totale: sequenza.coda.length, onSalta: () => prossima("saltata") } : null}
            onCompletata={() => { if (sequenza) prossima("completata"); else chiudi(); }}
          />
        </Suspense>
      )}
    </div>
  );
}

export default ElencoDaCompletare;
