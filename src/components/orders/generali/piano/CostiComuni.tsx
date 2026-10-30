// src/components/orders/generali/piano/CostiComuni.tsx
// I costi registrati sulla generale (terreno, notaio, progettazione, allacci…) divisi in
// lettura sulle commesse dentro: per millesimi, altrimenti m², altrimenti importo. Niente
// viene scritto: ogni euro resta dov'è, la quota serve a vedere il margine pieno di ognuna.
import { Link } from "react-router-dom";
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
  const def = DEFINIZIONI_MODELLI[riepilogo.generale.modello];
  const figlie = new Map(riepilogo.figlie.map((f) => [f.id, f]));
  const p = riepilogo.permessi;
  const base = (n: number) =>
    ripartizione.criterio === "millesimi" ? `${n.toLocaleString("it-IT")} ‰`
      : ripartizione.criterio === "mq" ? `${n.toLocaleString("it-IT")} m²`
        : ripartizione.criterio === "importo" ? euro(n) : "1";

  if (riepilogo.figlie.length === 0) {
    return (
      <div className="rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        Aggiungi {def.figlia.tante.toLowerCase()} alla generale: i costi registrati qui si divideranno su di loro.
      </div>
    );
  }

  return (
    <section aria-labelledby="comuni-titolo" className="space-y-3">
      <div className="rounded-lg border bg-card px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="comuni-titolo" className="text-sm font-semibold">Costi comuni registrati sulla generale</h3>
          {righe.length > 0 ? (
            <button type="button" className="text-lg font-semibold tabular-nums text-sky-800 underline-offset-2 hover:underline dark:text-sky-300" onClick={() => onApriRighe("Costi comuni · registrati sulla generale", righe)}>
              {euro(totale)}
            </button>
          ) : (
            <span className="text-lg font-semibold tabular-nums">{euro(0)}</span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {righe.length === 0
            ? "Per ora non ci sono spese, ordini d'acquisto o fatture ricevute portati sulla generale. Quelli che arriveranno (terreno, notaio, progettazione, allacci…) si divideranno qui."
            : `${ripartizione.motivo} La divisione è solo in lettura: le spese restano sulla generale.`}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
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
      </div>
    </section>
  );
}
