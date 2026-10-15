import { separaVoci, type VoceDaClassificare } from "../../../../supabase/functions/_shared/destinazioneVocePreventivo";
import { formatCurrency } from "@/lib/formatters";
export interface VoceConversione extends VoceDaClassificare { id?: string; name: string; quantity: number; unit_of_measure?: string | null }
export function QuoteConversionSummary({items, total}: {items: VoceConversione[]; total: number}) {
 const voci = separaVoci(items);
 return <section aria-label="Riepilogo conversione" className="space-y-4">
   <div className="rounded-lg border bg-muted/20 p-3"><p className="text-sm text-muted-foreground">Totale contratto · IVA inclusa</p><p className="text-2xl font-semibold tabular-nums">{formatCurrency(total)}</p><p className="mt-1 text-xs text-muted-foreground">Prezzi, quantità e sconti del preventivo restano invariati. Le fasi non aggiungono costi.</p></div>
   <div className="grid gap-3 sm:grid-cols-2">{([{title:"Lavorazioni", righe:voci.lavorazioni, help:"Diventano fasi di cantiere, senza acquisti automatici."},{title:"Materiali",righe:voci.materiali,help:"Entrano negli articoli da approvvigionare."}]).map(gruppo=><div key={gruppo.title} className="min-w-0 rounded-lg border p-3"><h3 className="font-semibold">{gruppo.title} · {gruppo.righe.length}</h3><p className="mt-1 text-xs text-muted-foreground">{gruppo.help}</p><ul className="mt-3 space-y-2 text-sm">{gruppo.righe.map((r,i)=><li key={r.id ?? i} className="break-words border-t pt-2"><span className="font-medium">{r.name}</span><span className="mt-1 block text-xs text-muted-foreground">{Number(r.quantity).toLocaleString("it-IT")} {r.unit_of_measure || ""}</span></li>)}</ul>{!gruppo.righe.length&&<p className="mt-3 text-sm text-muted-foreground">Nessuna voce.</p>}</div>)}</div>
   {voci.escluse.length>0&&<p className="text-xs text-muted-foreground">{voci.escluse.length} {voci.escluse.length === 1 ? "voce esclusa" : "voci escluse"} dalle attività e dagli acquisti: note, subtotali, sconti, opzioni non accettate o quantità zero. Restano nel preventivo.</p>}
   {voci.daVerificare.length>0&&<p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{voci.daVerificare.length} voci senza una classificazione riconosciuta. Rivedi il tipo di voce nel preventivo prima di creare la commessa.</p>}
 </section>;
}
