import { useRilevazioniMezziRapportino } from "@/hooks/campo/useRilevazioniMezziRapportino";

export function RilevazioniMezziRapportino({ companyId, orderId, reportId }: { companyId: string; orderId: string; reportId: string }) {
  const { data, isError } = useRilevazioniMezziRapportino(companyId, orderId, reportId);
  if (isError) return <p className="text-xs text-muted-foreground">Rilevazioni mezzi momentaneamente indisponibili.</p>;
  if (!data?.length) return null;
  return <section aria-label="Rilevazioni mezzi da cantiere">
    <h3 className="text-xs font-semibold text-muted-foreground">Rilevazioni mezzi da cantiere</h3>
    <dl className="mt-1 divide-y rounded-md border">
      {data.map(m => <div key={m.mezzo_id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-2 py-1.5">
        <dt className="font-medium">{m.mezzi?.nome ?? "Mezzo da cantiere"}</dt>
        <dd className="text-muted-foreground">
          {[m.ore_lavorate != null ? `${m.ore_lavorate.toLocaleString("it-IT")} h lavorate` : null,
            m.litri_consumati != null ? `${m.litri_consumati.toLocaleString("it-IT")} L consumati` : null,
            m.litri_riforniti != null ? `${m.litri_riforniti.toLocaleString("it-IT")} L riforniti` : null].filter(Boolean).join(" · ")}
        </dd>
      </div>)}
    </dl>
  </section>;
}
