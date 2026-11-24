import { UniformSelect } from "@/components/ui/uniform-select";
import type { QuoteItemPro } from "@/types/quoteItem";
import { destinazioneVoce } from "../../../../supabase/functions/_shared/destinazioneVocePreventivo";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type Props = { item: QuoteItemPro; onChange: (patch: Partial<QuoteItemPro>) => void };
/** Cambia solo la natura della voce: prezzi, quantità, IVA e sconti restano intatti. */
export function QuoteLineKindFields({ item, onChange }: Props) {
  const t = useT();
  const destinazione = destinazioneVoce(item);
  const aiuto = destinazione === "esclusa" ? t("Voce esclusa dalla conversione: non genera lavori o acquisti.")
    : destinazione === "da_verificare" ? t("Scegli il tipo di voce prima di creare la commessa.")
    : destinazione === "materiale" ? t("In commessa: materiale da approvvigionare.")
    : t("In commessa: lavorazione. Non genera articoli da ordinare.");
  return <div className="mb-3 grid gap-2 rounded-lg bg-muted/30 p-2 sm:grid-cols-[minmax(180px,1fr)_110px_2fr] sm:items-end">
    <label className="text-xs font-medium">{t("Tipo di voce")}
      <UniformSelect aria-label={t("Tipo di voce: {nome}", { nome: item.name || t("nuova voce") })} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={item.item_category} onChange={e => onChange({item_category: e.target.value as QuoteItemPro["item_category"], item_type: e.target.value === "prodotto" ? "product" : "service"})}>
        <option value="posa">{t("Lavorazione / manodopera")}</option><option value="prodotto">{t("Materiale / prodotto")}</option><option value="trasporto">{t("Trasporto")}</option><option value="nolo">{t("Noleggio")}</option><option value="smaltimento">{t("Smaltimento")}</option><option value="tiro_piano">{t("Tiro al piano")}</option><option value="pratica">{t("Pratica / servizio")}</option>
      </UniformSelect>
    </label>
    <label className="text-xs font-medium">{t("Unità")}
      <input aria-label={t("Unità di misura: {nome}", { nome: item.name || t("nuova voce") })} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={item.unit_of_measure} onChange={e => onChange({unit_of_measure: e.target.value})} placeholder={t("ore, m², corpo…")} />
    </label>
    <p className="pb-1 text-xs text-muted-foreground">{aiuto}</p>
  </div>;
}
