import type { AnteprimaConversioneModulo } from "@/lib/moduli/convertiInCommessa";
import { formatCurrency } from "@/lib/formatters";

export function ModuleConversionSummary({ riepilogo }: { riepilogo: AnteprimaConversioneModulo }) {
  return <div className="space-y-4 text-sm">
    <div className="rounded-lg bg-muted p-3">
      <p className="font-medium">Contratto invariato · {formatCurrency(riepilogo.totale)} IVA inclusa</p>
      <p className="text-xs text-muted-foreground">Imponibile {formatCurrency(riepilogo.imponibile)} · IVA {riepilogo.aliquota}%</p>
    </div>
    <section aria-label="Lavorazioni da eseguire">
      <h3 className="font-semibold">Lavorazioni · {riepilogo.fasi.length}</h3>
      <p className="text-xs text-muted-foreground">Diventano fasi di cantiere. Nessun articolo da ordinare e nessun costo consuntivo automatico.</p>
      {riepilogo.fasi.length ? <ul className="mt-2 space-y-2">{riepilogo.fasi.map((f, i) => <li key={i} className="rounded-md border p-2">
        <p className="font-medium">{f.name}</p><p className="whitespace-pre-line text-xs text-muted-foreground">{f.notes}</p>
      </li>)}</ul> : <p className="mt-2 text-muted-foreground">Nessuna lavorazione di dettaglio nel preventivo.</p>}
    </section>
    <section aria-label="Materiali da ordinare">
      <h3 className="font-semibold">Materiali e acquisti · {riepilogo.materiali.length}</h3>
      {riepilogo.materiali.length ? <ul className="mt-2 space-y-2">{riepilogo.materiali.map((m, i) => <li key={i} className="rounded-md border p-2">
        <p className="font-medium">{m.name} · {m.quantity} unità</p><p className="text-xs text-muted-foreground">{m.description}</p>
      </li>)}</ul> : <p className="mt-2 text-muted-foreground">Nessun materiale da ordinare. I costi materiali stimati nelle lavorazioni non generano acquisti.</p>}
    </section>
    {riepilogo.esclusi > 0 && <p className="text-xs text-muted-foreground">{riepilogo.esclusi} voci con quantità nulla o negativa escluse dalla pianificazione. Il contratto resta invariato.</p>}
    <p className="text-xs text-muted-foreground">Sconti e prezzo a corpo restano nel valore del contratto. I costi effettivi si registrano in seguito.</p>
  </div>;
}
