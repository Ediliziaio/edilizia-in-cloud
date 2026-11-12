// src/components/orders/generali/piano/CostiComuni.tsx
// I costi registrati sulla generale (terreno, notaio, progettazione, allacci…) divisi in
// lettura sulle commesse dentro: per millesimi, altrimenti m², altrimenti importo. Niente
// viene scritto: ogni euro resta dov'è, la quota serve a vedere il margine pieno di ognuna.
import { Link } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { euro, percento } from "@/components/orders/generali/piano/formato";
import { DEFINIZIONI_MODELLI, type RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import type { PianoCalcolato, RigaReale } from "@/lib/orders/generali/pianoConti";
import { cn } from "@/lib/utils";

export function CostiComuni({ piano, riepilogo, onApriRighe }: {
  piano: PianoCalcolato;
  riepilogo: RiepilogoGenerale;
  onApriRighe: (titolo: string, righe: RigaReale[]) => void;
}) {
  const { totale, righe, ripartizione } = piano.costiComuni;
  const [mostraRipartizione, setMostraRipartizione] = useState(false);
  const def = DEFINIZIONI_MODELLI[riepilogo.generale.modello];
  const figlie = new Map(riepilogo.figlie.map((f) => [f.id, f]));
  const p = riepilogo.permessi;
  const costoOperazione = piano.confronto.totali.costi.reale;
  const costoUnita = Math.round((costoOperazione - totale) * 100) / 100;
  const registrazioni = piano.confronto.costi.filter(r => r.righe.length > 0);
  const base = (n: number) =>
    ripartizione.criterio === "millesimi" ? `${n.toLocaleString("it-IT")} ‰`
      : ripartizione.criterio === "mq" ? `${n.toLocaleString("it-IT")} m²`
        : ripartizione.criterio === "importo" ? euro(n) : "1";

  if (!p.costi) return <p className="rounded-lg border p-4 text-sm text-muted-foreground">Per leggere i costi di commessa serve il permesso di vedere i costi.</p>;

  return (
    <section aria-labelledby="comuni-titolo" className="space-y-3">
      <div className="rounded-lg border bg-card px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="comuni-titolo" className="text-sm font-semibold">Costi dell'intera commessa</h3>
          <span className="text-2xl font-semibold tabular-nums">{euro(costoOperazione)}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Totale consolidato delle registrazioni sulla generale e sulle commesse collegate. Le quote di ripartizione non vengono sommate una seconda volta.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Registrati sulla generale</p>{righe.length > 0 ? (
            <button type="button" className="text-lg font-semibold tabular-nums text-sky-800 underline-offset-2 hover:underline dark:text-sky-300" onClick={() => onApriRighe("Costi comuni · registrati sulla generale", righe)}>
              {euro(totale)}
            </button>
          ) : (
            <span className="text-lg font-semibold tabular-nums">{euro(0)}</span>
          )}</div>
          <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Registrati sulle {def.figlia.tante.toLowerCase()}</p><p className="text-lg font-semibold tabular-nums">{euro(costoUnita)}</p></div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {righe.length === 0
            ? "Le spese, gli ordini d'acquisto e le fatture ricevute collegati alla generale compariranno qui, anche senza unità."
            : "Queste spese sono registrate sull'operazione. Non serve assegnarle a un appartamento per controllare il costo complessivo."}
        </p>
      </div>
      {registrazioni.length > 0 && <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm"><caption className="border-b px-4 py-3 text-left text-sm font-semibold text-foreground">Costi registrati per voce del piano</caption>
          <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-4 py-2 font-medium">Voce</th><th className="px-4 py-2 text-right font-medium">Registrazioni</th><th className="px-4 py-2 text-right font-medium">Importo</th></tr></thead>
          <tbody className="divide-y">{registrazioni.map(r => <tr key={r.chiave}><td className="px-4 py-3">{r.etichetta}</td><td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{r.righe.length}</td><td className="px-4 py-3 text-right tabular-nums"><button className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => onApriRighe(r.etichetta, r.righe)} aria-label={`Apri registrazioni: ${r.etichetta}`}>{euro(r.reale)}</button></td></tr>)}</tbody>
        </table>
      </div>}
      {riepilogo.figlie.length > 0 ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-4 py-3">
        <div><p className="text-sm font-medium">Analisi per {def.figlia.tante.toLowerCase()}</p><p className="text-xs text-muted-foreground">Facoltativa. {ripartizione.motivo} Le quote sono una simulazione e non spostano i costi.</p></div>
        <Button size="sm" variant="outline" aria-expanded={mostraRipartizione} onClick={() => setMostraRipartizione(v => !v)}>{mostraRipartizione ? "Nascondi ripartizione" : "Mostra ripartizione"}</Button>
      </div> : <p className="text-sm text-muted-foreground">Puoi gestire l'operazione e registrare costi prima di aggiungere le unità da vendere.</p>}
      {mostraRipartizione && riepilogo.figlie.length > 0 && <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">{def.figlia.tante}</th>
              <th className="px-2 py-2 text-right font-medium">Base</th>
              <th className="px-2 py-2 text-right font-medium">Quota</th>
              <th className="px-2 py-2 text-right font-medium">Costi comuni</th>
              {p.costi && <th className="px-2 py-2 text-right font-medium">Costo proprio</th>}
              {p.costi && <th className="px-2 py-2 text-right font-medium">Costo pieno</th>}
              {p.margini && <th className="px-4 py-2 text-right font-medium">Margine pieno</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {ripartizione.quote.map((q) => {
              const f = figlie.get(q.figliaId);
              const pieno = f?.costo === null || f?.costo === undefined ? null : f.costo + q.importo;
              const marginePieno = f?.margine === null || f?.margine === undefined ? null : f.margine - q.importo;
              return (
                <tr key={q.figliaId}>
                  <td className="px-4 py-1.5">
                    <Link to={`/azienda/ordini/${q.figliaId}`} className="hover:underline">{q.nome}</Link>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{base(q.base)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{percento(q.quota)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{euro(q.importo)}</td>
                  {p.costi && <td className="px-2 py-1.5 text-right tabular-nums">{euro(f?.costo ?? null)}</td>}
                  {p.costi && <td className="px-2 py-1.5 text-right font-medium tabular-nums">{euro(pieno)}</td>}
                  {p.margini && (
                    <td className={cn("px-4 py-1.5 text-right font-medium tabular-nums", marginePieno !== null && marginePieno < 0 && "text-destructive")}>
                      {euro(marginePieno)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          Costo proprio e margine vengono dalla marginalità di ogni commessa; il margine pieno toglie la sua quota dei costi comuni.
        </p>
      </div>}
    </section>
  );
}
