import type { QuoteItemPro } from "@/types/quoteItem";
import { destinazioneVoce } from "../../../../supabase/functions/_shared/destinazioneVocePreventivo";

type Props = { item: QuoteItemPro; onChange: (patch: Partial<QuoteItemPro>) => void };
/** Cambia solo la natura della voce: prezzi, quantità, IVA e sconti restano intatti. */
export function QuoteLineKindFields({ item, onChange }: Props) {
  const destinazione = destinazioneVoce(item);
  const aiuto = destinazione === "esclusa" ? "Voce esclusa dalla conversione: non genera lavori o acquisti."
    : destinazione === "da_verificare" ? "Scegli il tipo di voce prima di creare la commessa."
    : destinazione === "materiale" ? "In commessa: materiale da approvvigionare."
    : "In commessa: lavorazione. Non genera articoli da ordinare.";
  return <div className="mb-3 grid gap-2 rounded-lg bg-muted/30 p-2 sm:grid-cols-[minmax(180px,1fr)_110px_2fr] sm:items-end">
    <label className="text-xs font-medium">Tipo di voce
      <select aria-label={`Tipo di voce: ${item.name || "nuova voce"}`} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={item.item_category} onChange={e => onChange({item_category: e.target.value as QuoteItemPro["item_category"], item_type: e.target.value === "prodotto" ? "product" : "service"})}>
        <option value="posa">Lavorazione / manodopera</option><option value="prodotto">Materiale / prodotto</option><option value="trasporto">Trasporto</option><option value="nolo">Noleggio</option><option value="smaltimento">Smaltimento</option><option value="tiro_piano">Tiro al piano</option><option value="pratica">Pratica / servizio</option>
      </select>
    </label>
    <label className="text-xs font-medium">Unità
      <input aria-label={`Unità di misura: ${item.name || "nuova voce"}`} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={item.unit_of_measure} onChange={e => onChange({unit_of_measure: e.target.value})} placeholder="ore, m², corpo…" />
    </label>
    <p className="pb-1 text-xs text-muted-foreground">{aiuto}</p>
  </div>;
}
