import { useState } from "react";
import { Link } from "react-router-dom";
import { useHrLaborReconciliation } from "@/hooks/useHrLaborReconciliation";
import { oggiRoma } from "@/hooks/useOperai";
import { formatCurrency } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const h = (n: number) => `${n.toLocaleString(intlCampo(), { maximumFractionDigits: 2 })} h`;
export function HrLaborReconciliation({ profiloId }: { profiloId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => oggiRoma().slice(0, 7));
  const query = useHrLaborReconciliation(profiloId, month, open);
  const summary = query.data?.summary;
  return <details className="rounded-lg border bg-background p-3" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary className="cursor-pointer text-sm font-semibold">{t("Ore HR e incidenza sulle commesse")}</summary>
    {open && <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-end gap-2"><label className="text-sm font-medium">{t("Mese")}
        <Input aria-label={t("Mese di riconciliazione")} type="month" min="1900-01" max="2200-12" value={month} onChange={e => setMonth(e.target.value)} />
      </label><Button variant="outline" type="button" size="sm" disabled={query.isFetching} onClick={() => { void query.refetch(); }}>{t("Aggiorna mese")}</Button></div>
      {query.isPending && <p role="status" className="text-sm">{t("Caricamento ore e rapportini…")}</p>}
      {query.isError && <p role="alert" className="text-sm text-destructive">{t("Riepilogo non disponibile. Riprova: non viene mostrato un totale parziale.")}</p>}
      {!query.isError && !query.isPending && query.data?.linked === false && <p role="alert" className="text-sm">{t("Collega la scheda dipendente per riconciliare ore e costi. Non associamo persone solo dal nome.")}</p>}
      {!query.isError && summary && <>
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-sm">
          <div><dt className="text-muted-foreground">{t("Ore HR registrate")}</dt><dd className="font-semibold">{h(summary.hrHours)}</dd></div>
          <div><dt className="text-muted-foreground">{t("Straordinario già incluso")}</dt><dd className="font-semibold">{h(summary.overtime)}</dd></div>
          <div><dt className="text-muted-foreground">{t("Ore approvate nei cantieri")}</dt><dd className="font-semibold">{summary.reportsAvailable ? `${h(summary.registeredHours)}${summary.incomplete ? " · parziale" : ""}` : t("Non disponibili")}</dd></div>
          <div><dt className="text-muted-foreground">{t("Costo degli snapshot approvati")}</dt><dd className="font-semibold">{summary.reportsAvailable ? `${formatCurrency(summary.registeredCost)}${summary.incomplete ? " · parziale" : ""}` : t("Non disponibile")}</dd></div>
        </dl>
        <p className="text-xs text-muted-foreground">{t("{absenceDays} giornate con stato di assenza · {anomalousDays} giornate HR da verificare. Le assenze non diventano ore di cantiere.", { absenceDays: String(summary.absenceDays ?? ""), anomalousDays: String(summary.anomalousDays ?? "") })}</p>
        {!summary.reportsAvailable && <p role="alert" className="text-sm">{t("Il tuo ruolo non può leggere i rapportini delle commesse. L'incidenza non è calcolabile con questi permessi.")}</p>}
        {summary.incomplete && <p role="alert" className="text-sm text-amber-800">{t("Rapportini o costi da verificare: il totale non è un consuntivo completo.")} {summary.unpricedSnapshots > 0 && t("Sono presenti ore approvate a costo zero.")}</p>}
        {summary.missingHrDays > 0 && <p role="alert" className="text-sm text-amber-800">{t("{missingHrDays} giorni dei rapportini senza giornata HR valida: verifica le timbrature.", { missingHrDays: String(summary.missingHrDays ?? "") })}</p>}
        {summary.gapHours != null && <p className="text-sm">{summary.gapHours >= 0 ? t("{gapHours} HR non ancora attribuite dai rapportini", { gapHours: String(h(summary.gapHours) ?? "") }) : t("{valore} approvate oltre le ore HR rilevate: verifica la ripartizione", { valore: String(h(-summary.gapHours) ?? "") })}</p>}
        {summary.pendingHours > 0 && <p className="text-sm">{t("{pendingHours} dichiarate in attesa: non aggiunte al costo approvato.", { pendingHours: String(h(summary.pendingHours) ?? "") })}</p>}
        {summary.rows.length === 0 && summary.reportsAvailable && <p className="text-sm text-muted-foreground">{t("Nessun rapportino pertinente trovato per il mese.")}</p>}
        {summary.rows.map(row => <div key={row.id} className="rounded-lg border p-3 text-sm">
          <Link className="break-words font-semibold underline underline-offset-4" to={`/azienda/ordini/${row.id}?tab=costi&vista_costi=manodopera`}>{row.label}</Link>
          <p className="mt-1">{row.unknown
            ? t("{ore} approvate · {costo} · parziale, da verificare", { ore: h(row.hours), costo: formatCurrency(row.cost) })
            : t("{ore} approvate · {costo}", { ore: h(row.hours), costo: formatCurrency(row.cost) })}</p>
          {row.pendingHours > 0 && <p className="text-xs text-muted-foreground">{t("{pendingHours} in attesa", { pendingHours: String(h(row.pendingHours) ?? "") })}</p>}
        </div>)}
        <p className="text-xs text-muted-foreground">{t("Costi storici delle sole presenze del dipendente, non moltiplicati per la tariffa di oggi. Il registro economico della commessa può comprendere anche rettifiche manuali: questo confronto non le inventa e non riconcilia da solo il cedolino.")}</p>
      </>}
    </div>}
  </details>;
}
