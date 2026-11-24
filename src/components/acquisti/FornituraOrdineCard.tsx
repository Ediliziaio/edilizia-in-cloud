import { ArrowDown, ArrowLeftRight, ClipboardList, FileText, PackageCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { quantitaFornitura, type RigaOdaConsegna } from "@/lib/orders/odaContabilita";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const numero = { format: (n: number) => new Intl.NumberFormat(intlCampo(), { maximumFractionDigits: 4 }).format(n) };

export function FornituraOrdineCard({
  righe, caricamentoRighe, richiesta, caricamentoRichiesta, erroreRichiesta,
  ddt, caricamentoDdt, erroreDdt, apriDdt, apriRichiesta, apriOriginale, apriContabilita,
}: {
  righe: RigaOdaConsegna[];
  caricamentoRighe: boolean;
  richiesta?: { rfq_number: string | null } | null;
  caricamentoRichiesta: boolean;
  erroreRichiesta: boolean;
  ddt: number;
  caricamentoDdt: boolean;
  erroreDdt: boolean;
  apriDdt?: () => void;
  apriRichiesta?: () => void;
  apriOriginale?: () => void;
  apriContabilita?: () => void;
}) {
  const t = useT();
  const quantita = quantitaFornitura(righe);

  return (
    <section id="fornitura-oda" tabIndex={-1} aria-labelledby="fornitura-oda-titolo" className="scroll-mt-4 overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2.5 sm:px-4">
        <h2 id="fornitura-oda-titolo" className="flex items-center gap-2 text-sm font-semibold">
          <PackageCheck className="size-4 text-primary" aria-hidden="true" /> {t("Fornitura")}
        </h2>
        {quantita.righe > 0 && (
          <span className="text-xs text-muted-foreground">
            {quantita.completa ? t("Tutte le righe ricevute") : t("{complete} di {righe} righe ricevute per intero", { complete: String(quantita.complete ?? ""), righe: String(quantita.righe ?? "") })}
          </span>
        )}
      </div>
      <ol aria-label={t("Documenti della fornitura")} className={`grid gap-px bg-border sm:grid-cols-2 ${apriContabilita ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <li className="min-w-0 bg-card px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold"><ClipboardList className="size-3.5 text-primary" aria-hidden="true" /> {t("Richiesta d’offerta")}</div>
          {richiesta && apriRichiesta
            ? <button type="button" className="mt-1 text-left text-xs text-primary hover:underline" onClick={apriRichiesta}>{richiesta.rfq_number || t("Apri la richiesta")}</button>
            : <p className="mt-1 text-xs text-muted-foreground">{caricamentoRichiesta ? t("Caricamento…") : erroreRichiesta ? t("Lettura non disponibile") : t("Nessuna richiesta collegata")}</p>}
        </li>
        <li className="min-w-0 bg-card px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold"><FileText className="size-3.5 text-primary" aria-hidden="true" /> {t("Documento del fornitore")}</div>
          {apriOriginale
            ? <button type="button" className="mt-1 text-left text-xs text-primary hover:underline" onClick={apriOriginale}>{t("Apri l’originale")}</button>
            : <p className="mt-1 text-xs text-muted-foreground">{t("Nessun originale collegato")}</p>}
        </li>
        <li className="min-w-0 bg-card px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold"><ArrowLeftRight className="size-3.5 text-primary" aria-hidden="true" /> {t("DDT e arrivi")}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {caricamentoDdt ? t("Caricamento…") : erroreDdt ? t("Lettura non disponibile") : !ddt ? t("Nessun DDT collegato") : t(ddt === 1 ? "{n} DDT collegato" : "{n} DDT collegati", { n: ddt })}
          </p>
          {apriDdt && <Button type="button" size="sm" variant="outline" className="mt-1.5 h-7 gap-1 px-2 text-xs" onClick={apriDdt}>
            {ddt === 1 && !erroreDdt ? t("Confronta DDT") : erroreDdt ? t("Riprova") : ddt > 1 ? t("Scegli DDT") : t("Registra DDT")}
          </Button>}
        </li>
        {apriContabilita && <li className="min-w-0 bg-card px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold"><Wallet className="size-3.5 text-primary" aria-hidden="true" /> {t("Fatture e pagamenti")}</div>
          <button type="button" className="mt-1 inline-flex items-center gap-1 text-left text-xs text-primary hover:underline" onClick={apriContabilita}>
            {t("Apri la contabilità")} <ArrowDown className="size-3" aria-hidden="true" />
          </button>
        </li>}
      </ol>
      {caricamentoRighe ? <p role="status" className="border-t px-3 py-2.5 text-xs text-muted-foreground sm:px-4">{t("Caricamento quantità…")}</p>
        : quantita.righe > 0 && <div className="overflow-x-auto border-t">
          <table className="w-full text-xs">
            <caption className="sr-only">{t("Quantità della fornitura per unità di misura")}</caption>
            <thead className="bg-muted/25 text-muted-foreground">
              <tr><th scope="col" className="px-3 py-1.5 text-left font-medium sm:px-4">{t("Unità")}</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">{t("Ordinati")}</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">{t("Ricevuti")}</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium sm:px-4">{t("Da ricevere")}</th></tr>
            </thead>
            <tbody>{quantita.unita.map(q => <tr key={q.um} className="border-t tabular-nums">
              <th scope="row" className="px-3 py-1.5 text-left font-medium sm:px-4">{q.um}</th>
              <td className="px-3 py-1.5 text-right">{numero.format(q.ordinate)}</td>
              <td className="px-3 py-1.5 text-right">{numero.format(q.ricevute)}</td>
              <td className={`px-3 py-1.5 text-right font-semibold sm:px-4 ${q.residue > 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>{numero.format(q.residue)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
    </section>
  );
}
