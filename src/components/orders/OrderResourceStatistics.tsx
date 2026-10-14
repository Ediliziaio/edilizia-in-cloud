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

const number = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

/** No assignment editors here: Lavorazioni is the single operational entrypoint. */
export function OrderResourceStatistics({ orderId, onManage }: { orderId: string; onManage: () => void }) {
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
      <div><CardTitle className="text-base">Risorse e statistiche</CardTitle><p className="mt-1 text-xs text-muted-foreground">Riepilogo della commessa. Le assegnazioni si gestiscono in Lavorazioni.</p></div>
      <Button size="sm" variant="outline" onClick={onManage}>Apri Lavorazioni</Button>
    </CardHeader>
    <CardContent className="space-y-4 p-4 pt-0">
      {loading ? <p role="status">Caricamento statistiche…</p> : unavailable ? <div role="alert"><p>Statistiche non disponibili. I dati mancanti non sono conteggiati come zero.</p><Button className="mt-2" variant="outline" onClick={() => { void work.refetch(); void crews.refetch(); }}>Riprova statistiche</Button></div> : <>
        <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            ["Dipendenti assegnati", stats.employees], ["Squadre coinvolte", stats.crews.length],
            ["Ditte / gruppi assegnati", stats.companies], ["Ore dipendenti registrate", `${number.format(stats.hours)} h`],
          ].map(([label, value]) => <div key={label} className="rounded-lg border bg-slate-50 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd></div>)}
        </dl>
        <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border p-3 text-sm">
          <p><span className="text-muted-foreground">Capocantiere: </span>{access.isError ? "dato non disponibile" : access.isLoading ? "caricamento…" : capo ? nomeAccesso(capo) : "non assegnato"}</p>
          <p><span className="text-muted-foreground">Fasi con assegnazioni specifiche: </span>{stats.coveredPhases}/{work.phases.length}</p>
          <p><span className="text-muted-foreground">Accessi Campo: </span>{access.isError ? "dato non disponibile" : access.isLoading ? "caricamento…" : `${access.data?.length ?? 0} abilitati`}</p>
          {access.isError && <Button size="sm" variant="outline" onClick={() => void access.refetch()}>Riprova accessi</Button>}
        </div>
        {stats.unknownHours > 0 && <p className="text-xs text-amber-800">{stats.unknownHours} assegnazioni con ore ancora da rilevare. Il totale include solo le ore registrate.</p>}
        <p className="text-xs text-muted-foreground">Ore dai rapportini approvati e dalle rettifiche già registrate. La squadra non aggiunge ore o costi oltre quelli dei suoi membri. I rapportini in attesa non sono consuntivo definitivo.</p>
        {canViewCosts && <>
          <section aria-label="Costi operai interni" className="rounded-lg border p-3"><h3 className="mb-2 text-sm font-semibold">Operai interni · ore × costo orario</h3><dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm"><div><dt className="text-muted-foreground">Budget previsto</dt><dd className="font-semibold">{stats.internalBudget == null ? "Da completare" : formatCurrency(stats.internalBudget)}</dd></div><div><dt className="text-muted-foreground">Costo registrato</dt><dd className="font-semibold">{stats.internalActual == null ? "Da verificare" : formatCurrency(stats.internalActual)}</dd></div><div><dt className="text-muted-foreground">Scostamento dal budget</dt><dd className="font-semibold">{stats.internalActual == null || !stats.internalBudget ? "—" : formatCurrency(stats.internalActual - stats.internalBudget)}</dd></div></dl>
            {stats.unpricedEmployees > 0 && <p role="alert" className="mt-2 text-xs text-amber-800">{stats.unpricedEmployees} operai con ore a costo zero: verifica la valorizzazione. Cambiare la tariffa attuale non modifica lo storico.</p>}
          </section>
          <section aria-label="Costi ditte esterne" className="rounded-lg border p-3"><h3 className="mb-2 text-sm font-semibold">Ditte · costi registrati nelle assegnazioni</h3><dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm"><div><dt className="text-muted-foreground">Budget IVA inclusa</dt><dd className="font-semibold">{stats.externalBudgetGross == null ? "Da completare" : formatCurrency(stats.externalBudgetGross)}</dd></div><div><dt className="text-muted-foreground">Costo registrato IVA inclusa</dt><dd className="font-semibold">{stats.externalActualGross == null ? "Da verificare" : formatCurrency(stats.externalActualGross)}</dd></div></dl><p className="mt-2 text-xs text-muted-foreground">Non deriva dalle ore di presenza. Non è il totale contratti né il totale pagato.</p></section>
          <section aria-label="Contratti e SAL" className="rounded-lg border p-3"><h3 className="mb-2 text-sm font-semibold">Subappalti · contratti, SAL e pagamenti</h3>
            {subcontracts.isLoading ? <p role="status" className="text-xs">Caricamento subappalti…</p> : subcontracts.isError ? <div role="alert" className="text-sm">Statistiche subappalti non disponibili. <Button variant="outline" size="sm" onClick={() => void subcontracts.refetch()}>Riprova subappalti</Button></div> : subcontracts.data && <>
              <dl className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">{[["Contratti registrati", subcontracts.data.count.toString()], ["Importo contratti", subcontracts.data.contracted == null ? "Da verificare" : formatCurrency(subcontracts.data.contracted)], ["SAL verificati / pagati · lordo", subcontracts.data.verified == null ? "Da verificare" : formatCurrency(subcontracts.data.verified)], ["SAL pagati · netto ritenute", subcontracts.data.paid == null ? "Da verificare" : formatCurrency(subcontracts.data.paid)]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
              <p className="mt-2 text-xs text-muted-foreground">{subcontracts.data.drafts} contratti in bozza inclusi · {subcontracts.data.pending} SAL da verificare · {subcontracts.data.disputed} contestati. Gli importi mantengono la base del contratto/SAL e non vengono sommati ai costi delle assegnazioni.</p>
              {subcontracts.data.unresolved > 0 && <p role="alert" className="mt-2 text-xs text-amber-800">{subcontracts.data.unresolved} SAL non riconciliati: il riepilogo dei SAL è parziale.</p>}
            </>}
          </section>
        </>}
        {stats.people.length > 0 && <section aria-label="Riepilogo persone e ditte"><h3 className="mb-2 text-sm font-semibold">Persone e ditte coinvolte</h3><ul className="divide-y rounded-lg border">
          {stats.people.map(person => <li key={person.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
            <div className="min-w-0"><p className="break-words text-sm font-medium">{assignmentName(person.rows[0], work.employees, work.externalTeams)}{person.rows.every(a => a.executor_inactive) && <span className="ml-2 text-xs font-normal text-muted-foreground">storico</span>}</p><p className="text-xs text-muted-foreground">{[person.general ? "Tutta la commessa" : null, person.phaseIds.length ? `${person.phaseIds.length} lavorazioni` : null].filter(Boolean).join(" · ")}</p></div>
            <div className="text-right"><p className="text-sm tabular-nums">{person.rows[0].source === "employee" ? `${number.format(person.hours)} h registrate${person.unknownHours ? " · dati parziali" : ""}` : "Ditta / gruppo"}</p>
              {canViewCosts && <p className="text-xs text-muted-foreground">Costo registrato: {person.cost == null ? "Da verificare" : formatCurrency(person.cost)}{person.rows[0].source === "team" ? " · IVA inclusa" : person.averageRate != null ? ` · media ${formatCurrency(person.averageRate)}/h` : ""}</p>}
            </div>
          </li>)}
        </ul></section>}
        {stats.crews.length > 0 && <section aria-label="Riepilogo squadre"><h3 className="mb-2 text-sm font-semibold">Squadre e capisquadra</h3><ul className="divide-y rounded-lg border">{stats.crews.map(crew => <li key={crew.squadra_id} className="px-3 py-2 text-sm"><p className="font-medium">{crew.nome}</p><p className="text-xs text-muted-foreground">{crew.componenti.length} componenti · Caposquadra: {crew.responsabile ? `${crew.responsabile.nome} ${crew.responsabile.cognome}` : "non impostato"}</p></li>)}</ul></section>}
        {stats.people.length + stats.crews.length === 0 && <p className="text-sm text-muted-foreground">Nessuna risorsa assegnata. Organizza il lavoro in Lavorazioni.</p>}
      </>}
    </CardContent>
  </Card>;
}
