import { Link } from "react-router-dom";
import { Building2, RefreshCw, UsersRound } from "lucide-react";
import { useOrderLaborEconomics } from "@/hooks/useOrderLaborEconomics";
import { externalLaborNet, laborAmount, laborEconomics, sumLaborAmounts } from "@/lib/orders/laborEconomics";
import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const money = (value: number | null) => value == null ? "Da verificare" : formatCurrency(value);
const hours = (value: number | null) => value == null ? "Da verificare" : `${value.toLocaleString("it-IT", { maximumFractionDigits: 2 })} h`;
function Value({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{value}</dd></div>;
}

/** Consultation, not another payroll/payment or cost-writing entry point. */
export function OrderLaborEconomics({ orderId }: { orderId: string }) {
  const { employees, teams, readRates, allowed } = useOrderLaborEconomics(orderId);
  if (!allowed) return <p className="rounded-lg border p-4 text-sm">Il tuo ruolo non permette di consultare i costi della manodopera.</p>;
  if (employees.isPending || teams.isPending) return <p role="status" className="p-4 text-sm text-muted-foreground">Caricamento ore e costi…</p>;
  const retry = () => { void employees.refetch(); void teams.refetch(); };
  if (employees.isError || teams.isError) return <div role="alert" className="rounded-lg border p-4">
    <p>Impossibile caricare tutti i costi della manodopera. Nessun totale parziale viene mostrato.</p>
    <Button className="mt-2" variant="outline" onClick={retry}>Riprova</Button>
  </div>;
  const internal = laborEconomics(employees.data ?? [], readRates);
  const external = teams.data ?? [];
  const subcontractNet = sumLaborAmounts(external.map(externalLaborNet));
  return <div id="section-manodopera-costi" className="scroll-mt-24 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">Ore e costi della commessa, separati da stipendi e pagamenti alle ditte.</p>
      <Button variant="outline" size="sm" onClick={retry} disabled={employees.isFetching || teams.isFetching}><RefreshCw className="mr-2 h-4 w-4" />Aggiorna costi</Button>
    </div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><UsersRound className="h-4 w-4" />Dipendenti e operai interni</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-3 sm:grid-cols-4">
          <Value label="Ore registrate" value={hours(internal.hours)} />
          <Value label="Costo registrato" value={money(internal.cost)} />
          <Value label="Budget manodopera" value={internal.budget == null ? "Da completare" : money(internal.budget)} />
          <Value label="Scostamento dal budget" value={internal.budget == null || internal.cost == null ? "—" : formatCurrency(internal.cost - internal.budget)} />
        </dl>
        {internal.unpricedPeople > 0 && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Ore registrate a costo zero per {internal.unpricedPeople} persone: verifica i costi storici. Impostare la tariffa oggi non valorizza retroattivamente quelle ore.</p>}
        {!internal.people.length && <p className="text-sm text-muted-foreground">Nessuna riga di manodopera interna in questa commessa.</p>}
        {internal.people.map(person => <section key={person.id} aria-label={`Costi di ${person.name}`} className="rounded-lg border p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="break-words text-sm font-semibold">{person.name}</h3>
            {person.overBudget && <Badge variant="destructive">Oltre budget</Badge>}
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Value label="Ore registrate" value={hours(person.hours)} />
            <Value label="Costo registrato" value={money(person.cost)} />
            <Value label="Costo medio registrato / h" value={person.averageRate == null ? "—" : `${money(person.averageRate)} / h`} />
            <Value label="Tariffa attuale / h" value={!readRates ? "Riservata" : person.rate?.amount == null ? "Da impostare" : `${money(person.rate.amount)} / h`} />
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">Budget: {person.budget == null ? "da completare" : money(person.budget)}
            {person.rate && <> · {person.rate.source === "manuale" ? "tariffa manuale" : person.rate.source === "calcolato" ? "tariffa calcolata dalla scheda" : "tariffa non determinabile"}</>}
          </p>
        </section>)}
        <div className="flex flex-wrap gap-3 text-sm">
          {readRates && <Link className="underline underline-offset-4" to="/azienda/personale?tab=profili">Gestisci tariffe in Personale e HR</Link>}
          <Link className="underline underline-offset-4" to={`/azienda/ordini/${orderId}?tab=cantiere&vista_cantiere=diario#section-rapportini`}>Verifica rapportini</Link>
          <Link className="underline underline-offset-4" to={`/azienda/ordini/${orderId}?tab=cantiere&vista_cantiere=lavorazioni#section-lavorazioni`}>Budget nelle lavorazioni</Link>
        </div>
      </CardContent>
    </Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" />Ditte esterne e subappalti</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <dl><Value label="Costo registrato netto IVA" value={money(subcontractNet)} /></dl>
        {!external.length && <p className="text-sm text-muted-foreground">Nessuna ditta esterna registrata in questa commessa.</p>}
        {external.map(row => <section key={row.id} aria-label={`Costi ditta ${row.team?.name ?? "non disponibile"}`} className="rounded-lg border p-3">
          <h3 className="mb-3 break-words text-sm font-semibold">{row.team?.name ?? "Ditta non disponibile"}</h3>
          {row.team?.kind === "interna" && <p role="alert" className="mb-2 text-sm text-amber-800">Squadra interna registrata fra le ditte: verifica l'attribuzione, senza duplicarne i costi.</p>}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Value label="Budget IVA inclusa" value={laborAmount(row.cost_preventivo) == null ? "Da completare" : money(laborAmount(row.cost_preventivo))} />
            <Value label="Costo registrato IVA inclusa" value={money(laborAmount(row.total_cost))} />
            <Value label="Costo netto IVA" value={money(externalLaborNet(row))} />
          </dl>
          {row.vat_rate == null && <p className="mt-2 text-xs text-muted-foreground">IVA non specificata: 22% come nel conto economico. Verifica il contratto.</p>}
        </section>)}
        <p className="text-xs text-muted-foreground">Le presenze del subappaltatore non applicano il costo orario dei dipendenti. Il costo deriva dall'affidamento registrato; non equivale a una fattura pagata.</p>
      </CardContent>
    </Card>
    <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">Come si formano questi costi</summary>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
        <li>I rapportini approvati e le rettifiche manuali alimentano le ore e i costi registrati. Le ore possono quindi esistere anche senza un rapportino: verifica le rettifiche nelle assegnazioni. I rapportini in attesa non vengono aggiunti di nuovo.</li>
        <li>La tariffa attuale è un riferimento per i prossimi rapportini. Il costo medio deriva dai totali già registrati e può differire dalla tariffa di oggi.</li>
        <li>Le ore delle presenze di squadra sostituiscono quelle dell'autore: non si sommano due volte. Più cantieri mantengono registri separati.</li>
        <li>Straordinari: il motore attuale usa la stessa tariffa base. Maggiorazioni, trasferte e viaggi non vengono inventati né aggiunti automaticamente a questi importi.</li>
        <li>Il budget è quello salvato nelle lavorazioni. Un budget mancante non è zero; non ricaviamo ore previste da una tariffa attuale che potrebbe essere cambiata.</li>
      </ul>
    </details>
  </div>;
}
