import type { AnteprimaConversioneModulo } from "@/lib/moduli/convertiInCommessa";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/formatters";

export function ModuleConversionSummary({ riepilogo, vociScelte, onCambiaVoci }: {
  riepilogo: AnteprimaConversioneModulo;
  vociScelte?: ReadonlySet<string>;
  onCambiaVoci?: (voci: Set<string>) => void;
}) {
  const voci = riepilogo.voci_materiale;
  const cambia = (id: string, acceso: boolean) => {
    const prossime = new Set(vociScelte);
    if (acceso) prossime.add(id); else prossime.delete(id);
    onCambiaVoci?.(prossime);
  };
  return <div className="space-y-4 text-sm">
    <div className="rounded-lg bg-muted p-3">
      <p className="font-medium">Contratto invariato · {formatCurrency(riepilogo.totale)} IVA inclusa</p>
      <p className="text-xs text-muted-foreground">Imponibile {formatCurrency(riepilogo.imponibile)} · IVA {riepilogo.aliquota}%</p>
    </div>
    <section aria-label="Lavorazioni da eseguire">
      <h3 className="font-semibold">Lavorazioni · {riepilogo.fasi.length}</h3>
      <p className="text-xs text-muted-foreground">Diventano fasi di cantiere. Nessun costo consuntivo automatico.</p>
      {riepilogo.fasi.length ? <ul className="mt-2 space-y-2">{riepilogo.fasi.map((f, i) => <li key={i} className="rounded-md border p-2">
        <p className="font-medium">{f.name}</p><p className="whitespace-pre-line text-xs text-muted-foreground">{f.notes}</p>
        {!!f.sottofasi?.length && <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">{f.sottofasi.map((s,n) => <li key={n}>{s.name}</li>)}</ul>}
      </li>)}</ul> : <p className="mt-2 text-muted-foreground">Nessuna lavorazione di dettaglio nel preventivo.</p>}
    </section>
    {voci?.length && vociScelte && onCambiaVoci ? <section aria-label="Materiali da ordinare">
      <h3 className="font-semibold">Materiali da ordinare · {vociScelte.size} di {voci.length}</h3>
      <p className="text-xs text-muted-foreground">Le voci restano anche tra le lavorazioni. Spunta quelle per cui devi comprare qualcosa.</p>
      <ul className="mt-2 space-y-1">{voci.map((v) => <li key={v.id}>
        <label className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 hover:bg-muted/60">
          <Checkbox className="mt-0.5" checked={vociScelte.has(v.id)} onCheckedChange={(c) => cambia(v.id, c === true)} aria-label={v.nome} />
          <span className="min-w-0"><span className="break-words">{v.nome}</span> <span className="text-xs text-muted-foreground">· {v.quantita} {v.unita ?? ""}</span></span>
        </label>
      </li>)}</ul>
    </section> : <section aria-label="Materiali da ordinare">
      <h3 className="font-semibold">Materiali e acquisti · {riepilogo.materiali.length}</h3>
      {riepilogo.materiali.length ? <ul className="mt-2 space-y-2">{riepilogo.materiali.map((m, i) => <li key={i} className="rounded-md border p-2">
        <p className="font-medium">{m.name}{m.misure_testo ? ` ${m.misure_testo}` : ""} · {m.quantity} unità</p><p className="text-xs text-muted-foreground">{m.description}</p>
      </li>)}</ul> : <p className="mt-2 text-muted-foreground">Nessun materiale da ordinare. I costi materiali stimati nelle lavorazioni non generano acquisti.</p>}
    </section>}
    <section aria-label="Rate">
      <h3 className="font-semibold">Rate · {riepilogo.rate?.length ?? 0}</h3>
      {riepilogo.rate?.length ? <ul className="mt-2 space-y-1">{riepilogo.rate.map((r, i) => <li key={i} className="flex justify-between gap-3 rounded-md border px-2 py-1.5">
        <span>{r.label}</span><span className="tabular-nums">{formatCurrency(r.amount)}</span>
      </li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">Il preventivo non ha un piano di pagamento completo: la commessa prende le rate di partenza dell'azienda, se le ha scelte.</p>}
    </section>
    {riepilogo.esclusi > 0 && <p className="text-xs text-muted-foreground">{riepilogo.esclusi} voci con quantità nulla o negativa, o opzionali, escluse dalla pianificazione. Il contratto resta invariato.</p>}
    <p className="text-xs text-muted-foreground">Sconti e prezzo a corpo restano nel valore del contratto. I costi effettivi si registrano in seguito.</p>
  </div>;
}
