import { useId } from "react";
import { selectCampaignPage, type CampaignPage } from "../../../supabase/functions/_shared/metaAdsPublicationSafety";

export function CampaignPageField({ pages, value, onChange }: {
  pages: CampaignPage[];
  value?: string;
  onChange: (pageMetaId: string) => void;
}) {
  const id = useId();
  const available = pages.filter((page) => page.selected);
  const choice = selectCampaignPage(available, { pageMetaId: value });
  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-900">Pagina Facebook dell’annuncio</label>
      <p className="text-xs text-slate-600">Gli annunci verranno creati a nome di questa Pagina.</p>
      <select id={id} value={choice.page?.asset_id ?? ""} onChange={(event) => onChange(event.target.value)}
        disabled={available.length === 0} aria-describedby={`${id}-help`}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60">
        <option value="">{available.length === 0 ? "Nessuna Pagina collegata" : "Scegli la Pagina"}</option>
        {available.map((page) => <option key={page.id} value={page.asset_id}>{(page as CampaignPage & { asset_name?: string }).asset_name || page.asset_id}</option>)}
      </select>
      <p id={`${id}-help`} className={`text-xs ${value && choice.error ? "text-amber-800" : "text-slate-600"}`}>
        {available.length === 0 ? "Puoi preparare la bozza. Collega una Pagina dalle Integrazioni prima di pubblicare."
          : value && choice.error ? choice.error
          : available.length > 1 && !choice.page ? "Scegli una Pagina per continuare: non ne selezioniamo una al tuo posto."
          : "La scelta verrà salvata nella bozza e mostrata prima della pubblicazione."}
      </p>
    </section>
  );
}
