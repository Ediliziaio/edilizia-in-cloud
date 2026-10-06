/**
 * L'anteprima veloce del preventivo: il documento come lo vede il cliente (o
 * l'impresa, con costi e margine), che si ricalcola a ogni tasto.
 *
 * È una «bozza visiva»: righe, totali e dati del cliente di `AnteprimaPreventivo`.
 * Il documento definitivo (PDF) resta un'altra cosa e il pannello lo dice.
 * Puro: nessuna query, nessuno stato. Vedi `lib/preventivatore/anteprima.ts`.
 */
import { memo } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { MiniaturaProdotto } from "./MiniaturaProdotto";
import {
  type AnteprimaPreventivo,
  type VistaAnteprima,
  formattaEuro,
  formattaNumero,
  formattaQuantita,
  rigaDaPrezzare,
  righeSenzaPrezzo,
} from "@/lib/preventivatore/anteprima";

interface Props {
  dati: AnteprimaPreventivo;
  vista?: VistaAnteprima;
  /** L'id della riga che si sta toccando: si evidenzia anche qui. */
  evidenzia?: string | null;
  className?: string;
}

/** «€ 120 cad.» per i pezzi, «€ 18 / mq» per le misure: il prezzo unitario dice a cosa si riferisce. */
function perUnita(unita?: string | null): string {
  const u = (unita ?? "").trim().toLowerCase();
  return !u || u === "pz" || u === "cad" ? "cad." : `/ ${u}`;
}

function Mancante({ children }: { children: string }) {
  return <span className="italic text-slate-300">{children}</span>;
}

function AnteprimaVeloceBase({ dati, vista = "cliente", evidenzia, className }: Props) {
  const impresa = vista === "impresa";
  const aCorpo = Boolean(dati.prezzoACorpo);
  const senzaPrezzo = righeSenzaPrezzo(dati);
  const haRighe = dati.gruppi.some((g) => g.righe.length > 0);
  const nome = dati.cliente.nome?.trim();

  return (
    <article
      aria-label="Anteprima del preventivo"
      className={cn("rounded-xl border border-slate-200 bg-white p-4 text-[12px] leading-snug text-slate-800 shadow-sm max-md:p-3", className)}
    >
      <header className="border-b-2 border-eic-navy-deep pb-2">
        <p className="truncate text-sm font-extrabold tracking-tight text-eic-navy-deep">
          {dati.emittente?.trim() || <Mancante>La tua azienda</Mancante>}
        </p>
        {(dati.codice || dati.dataEtichetta) && (
          <p className="mt-0.5 flex flex-wrap justify-between gap-x-3 text-[10.5px] leading-tight text-slate-500">
            {dati.codice && <span className="font-mono">Preventivo {dati.codice}</span>}
            {dati.dataEtichetta && <span>{dati.dataEtichetta}</span>}
          </p>
        )}
      </header>

      <section className="mt-3">
        <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-500">Cliente</h4>
        <p className="text-[12.5px]">
          {nome ? <b>{nome}</b> : <Mancante>Nome del cliente</Mancante>}
        </p>
        {dati.cliente.righe.map((riga) => (
          <p key={riga} className="text-slate-600">{riga}</p>
        ))}
        {dati.cantiere && (
          <p className="mt-0.5 text-slate-600">
            <span className="text-slate-400">Cantiere: </span>{dati.cantiere}
          </p>
        )}
      </section>

      {dati.esigenze && dati.esigenze.voci.length > 0 && (
        <section className="mt-3" aria-label={dati.esigenze.titolo}>
          <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-500">{dati.esigenze.titolo}</h4>
          <ul className="space-y-0.5">
            {dati.esigenze.voci.map((voce) => (
              <li key={voce} className="flex items-baseline gap-1.5 text-slate-700">
                <span aria-hidden="true" className="h-1 w-1 shrink-0 translate-y-[-2px] rounded-full bg-orange-500" />
                <span className="break-words">{voce}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dati.sintesi && dati.sintesi.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-1.5">
          {dati.sintesi.map((v) => (
            <div key={v.id} className="rounded-md bg-slate-50 px-2 py-1.5">
              <dt className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">{v.etichetta}</dt>
              <dd className="text-[12.5px] font-bold tabular-nums text-slate-900">{v.valore}</dd>
            </div>
          ))}
        </dl>
      )}

      {dati.titolo && (
        <h4 className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-500">{dati.titolo}</h4>
      )}

      {haRighe ? (
        <div className="mt-1">
          <table className="w-full table-fixed border-collapse">
            <caption className="sr-only">Voci del preventivo</caption>
            <colgroup>
              <col />
              <col className="w-[17%]" />
              <col className="w-[22%]" />
              {impresa && <col className="w-[19%]" />}
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 text-left text-[9.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                <th scope="col" className="py-1 pr-1 font-semibold">Descrizione</th>
                <th scope="col" className="py-1 text-right font-semibold">Qtà</th>
                {impresa && <th scope="col" className="py-1 text-right font-semibold">Costo</th>}
                <th scope="col" className="py-1 text-right font-semibold">Totale</th>
              </tr>
            </thead>
            {dati.gruppi.filter((g) => g.righe.length > 0).map((g) => (
              <tbody key={g.id}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={impresa ? 4 : 3}
                    className="bg-slate-50 px-1.5 py-1 text-left text-[10px] font-bold uppercase tracking-[0.07em] text-slate-600"
                  >
                    {g.titolo}
                  </th>
                </tr>
                {g.righe.map((r) => {
                  const dap = rigaDaPrezzare(r);
                  const compresa = dap && aCorpo;
                  return (
                    <tr
                      key={r.id}
                      data-riga={r.id}
                      className={cn("border-b border-slate-100 align-top transition-colors", evidenzia === r.id && "bg-orange-50")}
                    >
                      <td className="py-1.5 pr-1">
                        {/* Un prodotto del listino ha la sua foto, a sinistra del nome: senza foto la riga è quella di sempre. */}
                        <div className="flex items-start gap-2">
                          <MiniaturaProdotto src={r.immagineUrl} className="h-9 w-9" />
                          <div className="min-w-0 flex-1">
                            <p className="break-words font-semibold">{r.titolo}</p>
                            {r.descrizione && <p className="line-clamp-2 break-words text-[10.5px] leading-snug text-slate-500">{r.descrizione}</p>}
                            {r.dettaglio && <p className="break-words text-[10.5px] text-slate-500">{r.dettaglio}</p>}
                            {!impresa && r.prezzoUnitario != null && r.prezzoUnitario > 0 && r.quantita > 1 && (
                              <p className="text-[10.5px] text-slate-400">{formattaEuro(r.prezzoUnitario)} {perUnita(r.unita)}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{formattaQuantita(r.quantita, r.unita)}</td>
                      {impresa && (
                        <td className="py-1.5 text-right tabular-nums text-slate-600">
                          {r.costo != null && r.costo > 0 ? formattaEuro(r.costo) : <span className="text-slate-300">—</span>}
                        </td>
                      )}
                      <td className="py-1.5 text-right tabular-nums">
                        {compresa ? (
                          <span className="whitespace-nowrap text-[10.5px] text-slate-400">compresa</span>
                        ) : dap ? (
                          <span className="whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">da prezzare</span>
                        ) : (
                          <b>{formattaEuro(r.totale)}</b>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      ) : (
        <p className="py-4 text-center text-slate-400">Qui compaiono le voci mano a mano che le aggiungi.</p>
      )}

      {/* Il riepilogo resta in vista in fondo alla colonna anche quando le righe sono tante:
          per chi scrive è il numero che si muove. Con la vista impresa c'è anche il margine. */}
      {dati.totali.length > 0 && (
        <div className="sticky bottom-0 z-10 -mx-4 mt-2 border-t border-slate-200 bg-white px-4 pb-1 pt-1.5 max-md:-mx-3 max-md:px-3">
          <dl className="ml-auto w-[68%] max-md:w-[80%]">
            {dati.totali.map((v) => (
              <div
                key={v.id}
                className={cn(
                  "flex justify-between gap-3 py-0.5 tabular-nums",
                  v.forte && "mt-1 border-t-2 border-eic-navy-deep pt-1.5 text-[15px] font-black",
                )}
              >
                <dt className={cn(!v.forte && "text-slate-600")}>{v.etichetta}</dt>
                <dd>{v.negativo ? "− " : ""}{formattaEuro(v.importo)}</dd>
              </div>
            ))}
          </dl>

          {impresa && dati.impresa && (
            <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11.5px] text-amber-900">
              <p>
                <b>Vista impresa</b> · costi {formattaEuro(dati.impresa.costi)} · margine{" "}
                <b>{dati.impresa.margine != null && (dati.impresa.costiCompleti || dati.impresa.costi > 0) ? formattaEuro(dati.impresa.margine) : "—"}</b>
                {dati.impresa.marginePct != null && <> ({dati.impresa.marginePct.toFixed(0)}%)</>}
              </p>
              {!dati.impresa.costiCompleti && dati.impresa.righeSenzaCosto > 0 && (
                <p className="mt-0.5 text-amber-800">
                  {dati.impresa.margine == null
                    ? `Costi incompleti · ${dati.impresa.righeSenzaCosto} ${dati.impresa.righeSenzaCosto === 1 ? "voce" : "voci"} senza costo: il margine non si può calcolare.`
                    : `Manca il costo su ${dati.impresa.righeSenzaCosto} ${dati.impresa.righeSenzaCosto === 1 ? "voce" : "voci"}: il margine è parziale.`}
                </p>
              )}
              {dati.impresa.sottoTarget && dati.impresa.margineMinPct != null && (
                <p className="mt-0.5 font-semibold text-red-700">Sotto il margine minimo ({dati.impresa.margineMinPct}%).</p>
              )}
            </div>
          )}
        </div>
      )}

      {dati.detrazione && dati.detrazione.pct > 0 && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-2 text-emerald-900">
          <p className="flex items-baseline justify-between gap-2">
            <span className="font-medium">Detrazione indicativa ({formattaNumero(dati.detrazione.pct, Number.isInteger(dati.detrazione.pct) ? 0 : 1)}%)</span>
            <b className="tabular-nums">{formattaEuro(dati.detrazione.importo)}</b>
          </p>
          <p className="mt-0.5 text-[10.5px] leading-snug text-emerald-800/90">
            {dati.detrazione.nota
              ? `${dati.detrazione.nota} `
              : dati.detrazione.massimale != null
                ? `Calcolata sul tetto di spesa di ${formattaEuro(dati.detrazione.massimale)}${dati.detrazione.oltreMassimale ? ": la spesa lo supera" : ""}. `
                : "Stima sull'imponibile netto. "}
            Non sostituisce la valutazione di un fiscalista.
          </p>
        </div>
      )}

      {(senzaPrezzo > 0 || dati.avvisi.length > 0) && (
        <ul className="mt-3 space-y-1">
          {senzaPrezzo > 0 && (
            <li className="flex gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{senzaPrezzo === 1 ? "1 voce senza prezzo" : `${senzaPrezzo} voci senza prezzo`}: il totale non le comprende.</span>
            </li>
          )}
          {dati.avvisi.map((a) => (
            <li key={a} className="flex gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{a}</span>
            </li>
          ))}
        </ul>
      )}

      {dati.note.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-slate-500">
          {dati.note.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
    </article>
  );
}

export const AnteprimaVeloce = memo(AnteprimaVeloceBase);
