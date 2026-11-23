import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrderWorkPhases } from "@/hooks/useOrderWorkPhases";
import { useSquadreCommessa } from "@/hooks/useOperai";
import { useAccessiCommessa, nomeAccesso } from "@/hooks/useAccessiCommessa";
import { usePermissions } from "@/hooks/usePermissions";
import { assignmentName } from "@/lib/orders/teamWorkPlan";
import { resourceStatistics } from "@/lib/orders/resourceStatistics";
import { formatCurrency } from "@/lib/formatters";
import { useOrderSubcontractStatistics } from "@/hooks/useOrderSubcontractStatistics";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

/** No assignment editors here: Lavorazioni is the single operational entrypoint. */
export function OrderResourceStatistics({ orderId, onManage }: { orderId: string; onManage: () => void }) {
  const t = useT();
  const number = new Intl.NumberFormat(intlCampo(), { maximumFractionDigits: 2 });
  const work = useOrderWorkPhases(orderId);
  const crews = useSquadreCommessa(orderId);
  const access = useAccessiCommessa(orderId);
  const { canViewCosts } = usePermissions();
  const subcontracts = useOrderSubcontractStatistics(orderId);
  const stats = resourceStatistics(work.phases, work.allAssignments, crews.data ?? []);
  const capo = access.data?.find(a => a.is_capocantiere);
  const unavailable = work.isError || crews.isError;
  const loading = work.isLoading || crews.isLoading;
  return <Card>
    <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 p-4">
      <div><CardTitle className="text-base">{t("Risorse e statistiche")}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{t("Riepilogo della commessa. Le assegnazioni si gestiscono in Lavorazioni.")}</p></div>
      <Button size="sm" variant="outline" onClick={onManage}>{t("Apri Lavorazioni")}</Button>
    </CardHeader>
    <CardContent className="space-y-4 p-4 pt-0">
      {loading ? <p role="status">{t("Caricamento statistiche…")}</p> : unavailable ? <div role="alert"><p>{t("Statistiche non disponibili. I dati mancanti non sono conteggiati come zero.")}</p><Button className="mt-2" variant="outline" onClick={() => { void work.refetch(); void crews.refetch(); }}>{t("Riprova statistiche")}</Button></div> : <>
        <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            [t("Dipendenti assegnati"), stats.employees], [t("Squadre coinvolte"), stats.crews.length],
            [t("Ditte / gruppi assegnati"), stats.companies], [t("Ore dipendenti registrate"), `${number.format(stats.hours)} h`],
          ].map(([label, value]) => <div key={label} className="rounded-lg border bg-slate-50 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd></div>)}
        </dl>
        <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border p-3 text-sm">
          <p><span className="text-muted-foreground">{t("Capocantiere:")} </span>{access.isError ? t("dato non disponibile") : access.isLoading ? t("caricamento…") : capo ? nomeAccesso(capo) : t("non assegnato")}</p>
          <p><span className="text-muted-foreground">{t("Fasi con assegnazioni specifiche:")} </span>{stats.coveredPhases}/{work.phases.length}</p>
          <p><span className="text-muted-foreground">{t("Accessi Campo:")} </span>{access.isError ? t("dato non disponibile") : access.isLoading ? t("caricamento…") : t("{n} abilitati", { n: access.data?.length ?? 0 })}</p>
          {access.isError && <Button size="sm" variant="outline" onClick={() => void access.refetch()}>{t("Riprova accessi")}</Button>}
        </div>
        {stats.unknownHours > 0 && <p className="text-xs text-amber-800">{t("{n} assegnazioni con ore ancora da rilevare. Il totale include solo le ore registrate.", { n: stats.unknownHours })}</p>}
        <p className="text-xs text-muted-foreground">{t("Ore dai rapportini approvati e dalle rettifiche già registrate. La squadra non aggiunge ore o costi oltre quelli dei suoi membri. I rapportini in attesa non sono consuntivo definitivo.")}</p>
        {canViewCosts && <>
          <section aria-label={t("Costi operai interni")} className="rounded-lg border p-3"><h3 className="mb-2 text-sm font-semibold">{t("Operai interni · ore × costo orario")}</h3><dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm"><div><dt className="text-muted-foreground">{t("Budget previsto")}</dt><dd className="font-semibold">{stats.internalBudget == null ? t("Da completare") : formatCurrency(stats.internalBudget)}</dd></div><div><dt className="text-muted-foreground">{t("Costo registrato")}</dt><dd className="font-semibold">{stats.internalActual == null ? t("Da verificare") : formatCurrency(stats.internalActual)}</dd></div><div><dt className="text-muted-foreground">{t("Scostamento dal budget")}</dt><dd className="font-semibold">{stats.internalActual == null || !stats.internalBudget ? "—" : formatCurrency(stats.internalActual - stats.internalBudget)}</dd></div></dl>
            {stats.unpricedEmployees > 0 && <p role="alert" className="mt-2 text-xs text-amber-800">{t("{n} operai con ore a costo zero: verifica la valorizzazione. Cambiare la tariffa attuale non modifica lo storico.", { n: stats.unpricedEmployees })}</p>}
          </section>
          <section aria-label={t("Costi ditte esterne")} className="rounded-lg border p-3"><h3 className="mb-2 text-sm font-semibold">{t("Ditte · costi registrati nelle assegnazioni")}</h3><dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm"><div><dt className="text-muted-foreground">{t("Costo previsto")}</dt><dd className="font-semibold">{stats.externalBudgetGross == null ? t("Da completare") : formatCurrency(stats.externalBudgetGross)}</dd></div><div><dt className="text-muted-foreground">{t("Costo registrato")}</dt><dd className="font-semibold">{stats.externalActualGross == null ? t("Da verificare") : formatCurrency(stats.externalActualGross)}</dd></div></dl><p className="mt-2 text-xs text-muted-foreground">{t("Non deriva dalle ore di presenza. Non è il totale contratti né il totale pagato.")}</p></section>
          <section aria-label={t("Contratti e SAL")} className="rounded-lg border p-3"><h3 className="mb-2 text-sm font-semibold">{t("Subappalti · contratti, SAL e pagamenti")}</h3>
            {subcontracts.isLoading ? <p role="status" className="text-xs">{t("Caricamento subappalti…")}</p> : subcontracts.isError ? <div role="alert" className="text-sm">{t("Statistiche subappalti non disponibili.")} <Button variant="outline" size="sm" onClick={() => void subcontracts.refetch()}>{t("Riprova subappalti")}</Button></div> : subcontracts.data && <>
              <dl className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">{[[t("Contratti registrati"), subcontracts.data.count.toString()], [t("Importo contratti"), subcontracts.data.contracted == null ? t("Da verificare") : formatCurrency(subcontracts.data.contracted)], [t("SAL verificati / pagati · lordo"), subcontracts.data.verified == null ? t("Da verificare") : formatCurrency(subcontracts.data.verified)], [t("SAL pagati · netto ritenute"), subcontracts.data.paid == null ? t("Da verificare") : formatCurrency(subcontracts.data.paid)]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
              <p className="mt-2 text-xs text-muted-foreground">{t("{bozze} contratti in bozza inclusi · {daVerificare} SAL da verificare · {contestati} contestati. Gli importi mantengono la base del contratto/SAL e non vengono sommati ai costi delle assegnazioni.", { bozze: subcontracts.data.drafts, daVerificare: subcontracts.data.pending, contestati: subcontracts.data.disputed })}</p>
              {subcontracts.data.unresolved > 0 && <p role="alert" className="mt-2 text-xs text-amber-800">{t("{n} SAL non riconciliati: il riepilogo dei SAL è parziale.", { n: subcontracts.data.unresolved })}</p>}
            </>}
          </section>
        </>}
        {stats.people.length > 0 && <section aria-label={t("Riepilogo persone e ditte")}><h3 className="mb-2 text-sm font-semibold">{t("Persone e ditte coinvolte")}</h3><ul className="divide-y rounded-lg border">
          {stats.people.map(person => <li key={person.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
            <div className="min-w-0"><p className="break-words text-sm font-medium">{assignmentName(person.rows[0], work.employees, work.externalTeams)}{person.rows.every(a => a.executor_inactive) && <span className="ml-2 text-xs font-normal text-muted-foreground">{t("storico")}</span>}</p><p className="text-xs text-muted-foreground">{[person.general ? t("Tutta la commessa") : null, person.phaseIds.length ? t("{n} lavorazioni", { n: person.phaseIds.length }) : null].filter(Boolean).join(" · ")}</p></div>
            <div className="text-right"><p className="text-sm tabular-nums">{person.rows[0].source === "employee" ? (person.unknownHours ? t("{ore} h registrate · dati parziali", { ore: number.format(person.hours) }) : t("{ore} h registrate", { ore: number.format(person.hours) })) : t("Ditta / gruppo")}</p>
              {canViewCosts && <p className="text-xs text-muted-foreground">{t("Costo registrato:")} {person.cost == null ? t("Da verificare") : formatCurrency(person.cost)}{person.rows[0].source === "team" ? ` · ${t("IVA inclusa")}` : person.averageRate != null ? ` · ${t("media {importo}/h", { importo: formatCurrency(person.averageRate) })}` : ""}</p>}
            </div>
          </li>)}
        </ul></section>}
        {stats.crews.length > 0 && <section aria-label={t("Riepilogo squadre")}><h3 className="mb-2 text-sm font-semibold">{t("Squadre e capisquadra")}</h3><ul className="divide-y rounded-lg border">{stats.crews.map(crew => <li key={crew.squadra_id} className="px-3 py-2 text-sm"><p className="font-medium">{crew.nome}</p><p className="text-xs text-muted-foreground">{t("{n} componenti · Caposquadra: {nome}", { n: crew.componenti.length, nome: crew.responsabile ? `${crew.responsabile.nome} ${crew.responsabile.cognome}` : t("non impostato") })}</p></li>)}</ul></section>}
        {stats.people.length + stats.crews.length === 0 && <p className="text-sm text-muted-foreground">{t("Nessuna risorsa assegnata. Organizza il lavoro in Lavorazioni.")}</p>}
      </>}
    </CardContent>
  </Card>;
}
