import { useRilevazioniMezziRapportino } from "@/hooks/campo/useRilevazioniMezziRapportino";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

export function RilevazioniMezziRapportino({ companyId, orderId, reportId }: { companyId: string; orderId: string; reportId: string }) {
  const t = useT();
  const { data, isError } = useRilevazioniMezziRapportino(companyId, orderId, reportId);
  if (isError) return <p className="text-xs text-muted-foreground">{t("Rilevazioni mezzi momentaneamente indisponibili.")}</p>;
  if (!data?.length) return null;
  return <section aria-label={t("Rilevazioni mezzi da cantiere")}>
    <h3 className="text-xs font-semibold text-muted-foreground">{t("Rilevazioni mezzi da cantiere")}</h3>
    <dl className="mt-1 divide-y rounded-md border">
      {data.map(m => <div key={m.mezzo_id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-2 py-1.5">
        <dt className="font-medium">{m.mezzi?.nome ?? t("Mezzo da cantiere")}</dt>
        <dd className="text-muted-foreground">
          {[m.ore_lavorate != null ? t("{n} h lavorate", { n: m.ore_lavorate.toLocaleString(intlCampo()) }) : null,
            m.litri_consumati != null ? t("{n} L consumati", { n: m.litri_consumati.toLocaleString(intlCampo()) }) : null,
            m.litri_riforniti != null ? t("{n} L riforniti", { n: m.litri_riforniti.toLocaleString(intlCampo()) }) : null].filter(Boolean).join(" · ")}
        </dd>
      </div>)}
    </dl>
  </section>;
}
