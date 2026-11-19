import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { documentoRichiestaSubappalto } from "@/lib/subappaltatori/richiestaOffertaPdf";
import { formatCurrency } from "@/lib/formatters";
import { testoComprende, type RigaElencoLavori } from "@/lib/subappaltatori/contrattoSubappaltoHtml";
import type { RichiestaDaLavorazioni } from "@/lib/subappaltatori/richiesteDaLavorazioni";

const DocumentoAnteprimaDialog = lazy(() => import("@/components/acquisti/DocumentoAnteprimaDialog")
  .then((modulo) => ({ default: modulo.DocumentoAnteprimaDialog })));

const misura = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3 });
const dataIt = (giorno: string) => giorno.split("-").reverse().join("/");

export type AnteprimaSubappalto = Pick<RichiestaDaLavorazioni, "commessa" | "ditta" | "periodo"> & {
  righe: readonly (Pick<RigaElencoLavori, "fase" | "sottofase" | "descrizione" | "quantita" | "unita" | "comprende"> & Partial<Pick<RigaElencoLavori, "prezzo" | "importo">>)[];
  contratto?: { imponibile: number; oneri: number };
};

export function ComputoSubappaltoAnteprima({ dati, richiesta }: { dati: AnteprimaSubappalto; richiesta?: RichiestaDaLavorazioni }) {
  const { ditta, commessa, periodo, righe, contratto } = dati;
  const { effectiveCompany: azienda } = useAuth();
  const [pdf, setPdf] = useState<import("@/lib/documentiOperativi/modello").DocumentoOperativo>();

  return <section className="overflow-hidden rounded-xl border border-slate-200" aria-label="Computo per la ditta">
    <header className="space-y-1 bg-[#17395f] px-4 py-3 text-white">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          {richiesta && azienda?.logo_url && <div className="rounded-md bg-white px-2 py-1"><img className="max-h-9 max-w-28 object-contain" src={azienda.logo_url} alt="" /></div>}
          <div className="min-w-0">
            <h3 className="font-semibold">{contratto ? "Computo del contratto" : "Richiesta d’offerta"}</h3>
            {richiesta && <p className="text-sm text-blue-100">{azienda?.business_name || azienda?.name}</p>}
          </div>
        </div>
        {richiesta && <Button size="sm" variant="secondary" onClick={() => setPdf(documentoRichiestaSubappalto(richiesta))}>Vedi PDF impaginato</Button>}
      </div>
      <p className="text-sm text-blue-100">{ditta}{commessa ? ` · Commessa ${commessa}` : ""}</p>
      {richiesta?.luogo && <p className="text-sm text-blue-100">{richiesta.luogo}</p>}
      {richiesta?.scadenza && <p className="text-sm text-blue-100">Rispondere entro · {dataIt(richiesta.scadenza)}</p>}
      {periodo.dal && periodo.al && <p className="text-sm text-blue-100">Periodo previsto · {dataIt(periodo.dal)} – {dataIt(periodo.al)}</p>}
    </header>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-600">
          <tr><th className="px-3 py-2 text-right">N.</th><th className="px-3 py-2">Lavorazione</th><th className="px-3 py-2">U.M.</th><th className="px-3 py-2 text-right">Quantità</th>
            <th className="px-3 py-2 text-right">Prezzo unitario</th><th className="px-4 py-2 text-right">Importo</th></tr>
        </thead>
        <tbody className="divide-y">{righe.map((riga, i) => <tr key={i} className="align-top">
          <td className="px-3 py-2 text-right tabular-nums text-slate-500">{i + 1}</td>
          <td className="whitespace-pre-line px-3 py-2">
            <div className="text-xs font-medium text-slate-600">{[riga.fase, riga.sottofase].filter(Boolean).join(" · ")}</div>
            <div className="font-medium">{riga.descrizione}</div>
            <div className="text-xs text-slate-600">{testoComprende(riga.comprende)}</div>
          </td>
          <td className="whitespace-nowrap px-3 py-2">{riga.unita ?? "—"}</td>
          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{misura.format(riga.quantita)}</td>
          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{contratto ? formatCurrency(riga.prezzo ?? 0) : "Da compilare"}</td>
          <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{contratto ? formatCurrency(riga.importo ?? 0) : "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {richiesta?.istruzioni && <div className="border-t px-4 py-3 text-sm"><h4 className="font-medium">Istruzioni alla ditta</h4><p className="whitespace-pre-wrap">{richiesta.istruzioni}</p></div>}
    <footer className="border-t bg-slate-50 px-4 py-3 text-sm">
      {contratto ? <div className="flex flex-wrap justify-end gap-x-4 gap-y-1">
        <span>Totale lavori {formatCurrency(contratto.imponibile)}</span>
        {contratto.oneri > 0 && <span>Oneri sicurezza {formatCurrency(contratto.oneri)}</span>}
        <strong>Totale IVA esclusa {formatCurrency(contratto.imponibile + contratto.oneri)}</strong>
      </div> : <p>La ditta compila i prezzi al netto dell’IVA e indica fino a quando è valida l’offerta.</p>}
    </footer>
    {pdf && <Suspense fallback={<p role="status">Carico l’anteprima PDF…</p>}>
      <DocumentoAnteprimaDialog documento={pdf} descrizione="Computo destinato alla ditta." onClose={() => setPdf(undefined)} />
    </Suspense>}
  </section>;
}
