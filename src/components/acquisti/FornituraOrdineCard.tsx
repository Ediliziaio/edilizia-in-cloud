import { ArrowDown, ArrowLeftRight, ClipboardList, FileText, PackageCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { quantitaFornitura, type RigaOdaConsegna } from "@/lib/orders/odaContabilita";

const numero = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 4 });

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
  const quantita = quantitaFornitura(righe);

  return (
    <section id="fornitura-oda" tabIndex={-1} aria-labelledby="fornitura-oda-titolo" className="scroll-mt-4 overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2.5 sm:px-4">
        <h2 id="fornitura-oda-titolo" className="flex items-center gap-2 text-sm font-semibold">
          <PackageCheck className="size-4 text-primary" aria-hidden="true" /> Fornitura
        </h2>
        {quantita.righe > 0 && (
          <span className="text-xs text-muted-foreground">
            {quantita.completa ? "Tutte le righe ricevute" : `${quantita.complete} di ${quantita.righe} righe ricevute per intero`}
          </span>
        )}
      </div>
      <ol aria-label="Documenti della fornitura" className={`grid gap-px bg-border sm:grid-cols-2 ${apriContabilita ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <li className="min-w-0 bg-card px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold"><ClipboardList className="size-3.5 text-primary" aria-hidden="true" /> Richiesta d’offerta</div>
          {richiesta && apriRichiesta
            ? <button type="button" className="mt-1 text-left text-xs text-primary hover:underline" onClick={apriRichiesta}>{richiesta.rfq_number || "Apri la richiesta"}</button>
            : <p className="mt-1 text-xs text-muted-foreground">{caricamentoRichiesta ? "Caricamento…" : erroreRichiesta ? "Lettura non disponibile" : "Nessuna richiesta collegata"}</p>}
        </li>
        <li className="min-w-0 bg-card px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold"><FileText className="size-3.5 text-primary" aria-hidden="true" /> Documento del fornitore</div>
          {apriOriginale
            ? <button type="button" className="mt-1 text-left text-xs text-primary hover:underline" onClick={apriOriginale}>Apri l’originale</button>
            : <p className="mt-1 text-xs text-muted-foreground">Nessun originale collegato</p>}
        </li>
        <li className="min-w-0 bg-card px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold"><ArrowLeftRight className="size-3.5 text-primary" aria-hidden="true" /> DDT e arrivi</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {caricamentoDdt ? "Caricamento…" : erroreDdt ? "Lettura non disponibile" : !ddt ? "Nessun DDT collegato" : `${ddt} DDT collegat${ddt === 1 ? "o" : "i"}`}
          </p>
          {apriDdt && <Button type="button" size="sm" variant="outline" className="mt-1.5 h-7 gap-1 px-2 text-xs" onClick={apriDdt}>
            {ddt === 1 && !erroreDdt ? "Confronta DDT" : erroreDdt ? "Riprova" : ddt > 1 ? "Scegli DDT" : "Registra DDT"}
          </Button>}
        </li>
        {apriContabilita && <li className="min-w-0 bg-card px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold"><Wallet className="size-3.5 text-primary" aria-hidden="true" /> Fatture e pagamenti</div>
          <button type="button" className="mt-1 inline-flex items-center gap-1 text-left text-xs text-primary hover:underline" onClick={apriContabilita}>
            Apri la contabilità <ArrowDown className="size-3" aria-hidden="true" />
          </button>
        </li>}
      </ol>
      {caricamentoRighe ? <p role="status" className="border-t px-3 py-2.5 text-xs text-muted-foreground sm:px-4">Caricamento quantità…</p>
        : quantita.righe > 0 && <div className="overflow-x-auto border-t">
          <table className="w-full text-xs">
            <caption className="sr-only">Quantità della fornitura per unità di misura</caption>
            <thead className="bg-muted/25 text-muted-foreground">
              <tr><th scope="col" className="px-3 py-1.5 text-left font-medium sm:px-4">Unità</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">Ordinati</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">Ricevuti</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium sm:px-4">Da ricevere</th></tr>
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
