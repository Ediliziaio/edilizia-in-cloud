import { UniformSelect } from "@/components/ui/uniform-select";
import { useId } from "react";
import { selectCampaignPage, type CampaignPage } from "../../../supabase/functions/_shared/metaAdsPublicationSafety";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function CampaignPageField({ pages, value, onChange }: {
  pages: CampaignPage[];
  value?: string;
  onChange: (pageMetaId: string) => void;
}) {
  const t = useT();
  const id = useId();
  const available = pages.filter((page) => page.selected);
  const choice = selectCampaignPage(available, { pageMetaId: value });
  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-900">{t("Pagina Facebook dell’annuncio")}</label>
      <p className="text-xs text-slate-600">{t("Gli annunci verranno creati a nome di questa Pagina.")}</p>
      <UniformSelect id={id} value={choice.page?.asset_id ?? ""} onChange={(event) => onChange(event.target.value)}
        disabled={available.length === 0} aria-describedby={`${id}-help`}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60">
        <option value="">{available.length === 0 ? t("Nessuna Pagina collegata") : t("Scegli la Pagina")}</option>
        {available.map((page) => <option key={page.id} value={page.asset_id}>{(page as CampaignPage & { asset_name?: string }).asset_name || page.asset_id}</option>)}
      </UniformSelect>
      <p id={`${id}-help`} className={`text-xs ${value && choice.error ? "text-amber-800" : "text-slate-600"}`}>
        {available.length === 0 ? t("Puoi preparare la bozza. Collega una Pagina dalle Integrazioni prima di pubblicare.")
          : value && choice.error ? choice.error
          : available.length > 1 && !choice.page ? t("Scegli una Pagina per continuare: non ne selezioniamo una al tuo posto.")
          : t("La scelta verrà salvata nella bozza e mostrata prima della pubblicazione.")}
      </p>
    </section>
  );
}
