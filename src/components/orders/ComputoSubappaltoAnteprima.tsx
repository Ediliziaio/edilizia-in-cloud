import { lazy, Suspense, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { documentoRichiestaSubappalto } from "@/lib/subappaltatori/richiestaOffertaPdf";
import { formatCurrency } from "@/lib/formatters";
import { testoComprende, type RigaElencoLavori } from "@/lib/subappaltatori/contrattoSubappaltoHtml";
import type { RichiestaDaLavorazioni } from "@/lib/subappaltatori/richiesteDaLavorazioni";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

const DocumentoAnteprimaDialog = lazy(() => import("@/components/acquisti/DocumentoAnteprimaDialog")
  .then((modulo) => ({ default: modulo.DocumentoAnteprimaDialog })));

const dataIt = (giorno: string) => giorno.split("-").reverse().join("/");

export type AnteprimaSubappalto = Pick<RichiestaDaLavorazioni, "commessa" | "ditta" | "periodo"> & {
  righe: readonly (Pick<RigaElencoLavori, "fase" | "sottofase" | "descrizione" | "quantita" | "unita" | "comprende"> & Partial<Pick<RigaElencoLavori, "prezzo" | "importo">>)[];
  contratto?: { imponibile: number; oneri: number };
};

export function ComputoSubappaltoAnteprima({ dati, richiesta }: { dati: AnteprimaSubappalto; richiesta?: RichiestaDaLavorazioni }) {
  const t = useT();
  const misura = useMemo(() => new Intl.NumberFormat(intlCampo(), { maximumFractionDigits: 3 }), [t]);
  const { ditta, commessa, periodo, righe, contratto } = dati;
  const { effectiveCompany: azienda } = useAuth();
  const [pdf, setPdf] = useState<import("@/lib/documentiOperativi/modello").DocumentoOperativo>();

  return <section className="overflow-hidden rounded-xl border border-slate-200" aria-label={t("Computo per la ditta")}>
    <header className="space-y-1 bg-[#17395f] px-4 py-3 text-white">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          {richiesta && azienda?.logo_url && <div className="rounded-md bg-white px-2 py-1"><img className="max-h-9 max-w-28 object-contain" src={azienda.logo_url} alt="" /></div>}
          <div className="min-w-0">
            <h3 className="font-semibold">{contratto ? t("Computo del contratto") : t("Richiesta d’offerta")}</h3>
            {richiesta && <p className="text-sm text-blue-100">{azienda?.business_name || azienda?.name}</p>}
          </div>
        </div>
        {richiesta && <Button size="sm" variant="secondary" onClick={() => setPdf(documentoRichiestaSubappalto(richiesta))}>{t("Vedi PDF impaginato")}</Button>}
      </div>
      <p className="text-sm text-blue-100">{ditta}{commessa ? ` · ${t("Commessa {codice}", { codice: commessa })}` : ""}</p>
      {richiesta?.luogo && <p className="text-sm text-blue-100">{richiesta.luogo}</p>}
      {richiesta?.scadenza && <p className="text-sm text-blue-100">{t("Rispondere entro · {data}", { data: dataIt(richiesta.scadenza) })}</p>}
      {periodo.dal && periodo.al && <p className="text-sm text-blue-100">{t("Periodo previsto · {dal} – {al}", { dal: dataIt(periodo.dal), al: dataIt(periodo.al) })}</p>}
    </header>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-600">
          <tr><th className="px-3 py-2 text-right">{t("N.")}</th><th className="px-3 py-2">{t("Lavorazione")}</th><th className="px-3 py-2">{t("U.M.")}</th><th className="px-3 py-2 text-right">{t("Quantità")}</th>
            <th className="px-3 py-2 text-right">{t("Prezzo unitario")}</th><th className="px-4 py-2 text-right">{t("Importo")}</th></tr>
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
          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{contratto ? formatCurrency(riga.prezzo ?? 0) : t("Da compilare")}</td>
          <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{contratto ? formatCurrency(riga.importo ?? 0) : "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {richiesta?.istruzioni && <div className="border-t px-4 py-3 text-sm"><h4 className="font-medium">{t("Istruzioni alla ditta")}</h4><p className="whitespace-pre-wrap">{richiesta.istruzioni}</p></div>}
    <footer className="border-t bg-slate-50 px-4 py-3 text-sm">
      {contratto ? <div className="flex flex-wrap justify-end gap-x-4 gap-y-1">
        <span>{t("Totale lavori {importo}", { importo: formatCurrency(contratto.imponibile) })}</span>
        {contratto.oneri > 0 && <span>{t("Oneri sicurezza {importo}", { importo: formatCurrency(contratto.oneri) })}</span>}
        <strong>{t("Totale IVA esclusa {importo}", { importo: formatCurrency(contratto.imponibile + contratto.oneri) })}</strong>
      </div> : <p>{t("La ditta compila i prezzi al netto dell’IVA e indica fino a quando è valida l’offerta.")}</p>}
    </footer>
    {pdf && <Suspense fallback={<p role="status">{t("Carico l’anteprima PDF…")}</p>}>
      <DocumentoAnteprimaDialog documento={pdf} descrizione={t("Computo destinato alla ditta.")} onClose={() => setPdf(undefined)} />
    </Suspense>}
  </section>;
}
