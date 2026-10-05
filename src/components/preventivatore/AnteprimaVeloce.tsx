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
import {
  type AnteprimaPreventivo,
  type VistaAnteprima,
  formattaEuro,
  formattaQuantita,
  rigaDaPrezzare,
  righeDaPrezzare,
} from "@/lib/preventivatore/anteprima";

interface Props {
  dati: AnteprimaPreventivo;
  vista?: VistaAnteprima;
  /** L'id della riga che si sta toccando: si evidenzia anche qui. */
  evidenzia?: string | null;
  className?: string;
}

function Mancante({ children }: { children: string }) {
  return <span className="italic text-slate-300">{children}</span>;
}

function AnteprimaVeloceBase({ dati, vista = "cliente", evidenzia, className }: Props) {
  const impresa = vista === "impresa";
  const aCorpo = Boolean(dati.prezzoACorpo);
  const senzaPrezzo = aCorpo ? 0 : righeDaPrezzare(dati);
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

      {dati.titolo && (
        <h4 className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-500">{dati.titolo}</h4>
      )}

      {haRighe ? (
        <div className="mt-1">
          <table className="w-full table-fixed border-collapse">
            <caption className="sr-only">Voci del preventivo</caption>
            <colgroup>
              <col />
              <col className="w-[13%]" />
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
                        <p className="break-words font-semibold">{r.titolo}</p>
                        {r.dettaglio && <p className="break-words text-[10.5px] text-slate-500">{r.dettaglio}</p>}
                        {!impresa && r.prezzoUnitario != null && r.prezzoUnitario > 0 && r.quantita > 1 && (
                          <p className="text-[10.5px] text-slate-400">{formattaEuro(r.prezzoUnitario)} cad.</p>
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{formattaQuantita(r.quantita, r.unita)}</td>
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

      {dati.totali.length > 0 && (
        <dl className="ml-auto mt-2 w-[68%] max-md:w-[80%]">
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
      )}

      {impresa && dati.impresa && (
        <div className="mt-3 rounded-lg bg-amber-50 px-2.5 py-2 text-[11.5px] text-amber-900">
          <p>
            <b>Vista impresa</b> · costi {formattaEuro(dati.impresa.costi)} · margine{" "}
            <b>{dati.impresa.costiCompleti || dati.impresa.costi > 0 ? formattaEuro(dati.impresa.margine) : "—"}</b>
            {dati.impresa.marginePct != null && <> ({dati.impresa.marginePct.toFixed(0)}%)</>}
          </p>
          {!dati.impresa.costiCompleti && dati.impresa.righeSenzaCosto > 0 && (
            <p className="mt-0.5 text-amber-800">
              Manca il costo su {dati.impresa.righeSenzaCosto} {dati.impresa.righeSenzaCosto === 1 ? "voce" : "voci"}: il margine è parziale.
            </p>
          )}
          {dati.impresa.sottoTarget && dati.impresa.margineMinPct != null && (
            <p className="mt-0.5 font-semibold text-red-700">Sotto il margine minimo ({dati.impresa.margineMinPct}%).</p>
          )}
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
