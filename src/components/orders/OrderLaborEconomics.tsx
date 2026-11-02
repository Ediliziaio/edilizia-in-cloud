import { Link } from "react-router-dom";
import { useParametriCostoPersonale } from "@/hooks/useParametriCostoPersonale";
import { Building2, RefreshCw, UsersRound } from "lucide-react";
import { useOrderLaborEconomics } from "@/hooks/useOrderLaborEconomics";
import { externalLaborNet, laborAmount, laborEconomics, sumLaborAmounts } from "@/lib/orders/laborEconomics";
import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TabellaCommessa } from "./TabellaCommessa";

const money = (value: number | null) => value == null ? "Da verificare" : formatCurrency(value);
const hours = (value: number | null) => value == null ? "Da verificare" : `${value.toLocaleString("it-IT", { maximumFractionDigits: 2 })} h`;
function Value({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{value}</dd></div>;
}

/** Registro giornaliero condiviso; stipendi e pagamenti restano separati. */
export function OrderLaborEconomics({ orderId }: { orderId: string }) {
  const { employees, teams, pendingReports, canCheckPending, readRates, allowed } = useOrderLaborEconomics(orderId);
  const { data: parametriCosto } = useParametriCostoPersonale();
  if (!allowed) return <p className="rounded-lg border p-4 text-sm">Il tuo ruolo non permette di consultare i costi della manodopera.</p>;
  if (employees.isPending || teams.isPending) return <p role="status" className="p-4 text-sm text-muted-foreground">Caricamento ore e costi…</p>;
  const retry = () => { void employees.refetch(); void teams.refetch(); void pendingReports?.refetch?.(); };
  if (employees.isError || teams.isError) return <div role="alert" className="rounded-lg border p-4">
    <p>Impossibile caricare tutti i costi della manodopera. Nessun totale parziale viene mostrato.</p>
    <Button className="mt-2" variant="outline" onClick={retry}>Riprova</Button>
  </div>;
  const internal = laborEconomics(employees.data ?? [], readRates, parametriCosto);
  const pendingUnknown = canCheckPending === false || !!pendingReports?.isPending || !!pendingReports?.isError;
  const pending = pendingReports?.data ?? 0;
  const incomplete = internal.unpricedPeople > 0 || pending > 0 || pendingUnknown;
  return <div id="section-manodopera-costi" className="scroll-mt-24 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">Il previsto è il budget. Il costo effettivo deriva dalle ore confermate, con la tariffa registrata: non è lo stipendio pagato.</p>
      <Button variant="outline" size="sm" onClick={retry} disabled={employees.isFetching || teams.isFetching}><RefreshCw className="mr-2 h-4 w-4" />Aggiorna costi</Button>
    </div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><UsersRound className="h-4 w-4" />Dipendenti e operai interni</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-3 sm:grid-cols-4">
          <Value label="Ore previste" value={internal.plannedHours == null ? "Non specificate" : hours(internal.plannedHours)} />
          <Value label="Ore effettive registrate" value={hours(internal.hours)} />
          <Value label="Costo effettivo registrato" value={internal.unpricedPeople ? "Da completare" : money(internal.cost)} />
          <Value label="Costo previsto (budget)" value={internal.budget == null ? "Da completare" : money(internal.budget)} />
          <Value label="Scostamento attuale dal budget" value={internal.budget == null || internal.cost == null || incomplete || internal.hours === 0 ? "—" : formatCurrency(internal.cost - internal.budget)} />
        </dl>
        {pendingUnknown && <p role="status" className="rounded-lg border p-3 text-sm">Le ore in attesa non sono verificabili in questo momento. Il costo registrato non rappresenta il costo finale della commessa.</p>}
        {pending > 0 && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">Rapportini in attesa: {pending}. Il costo effettivo è ancora parziale. Lo scostamento sarà disponibile dopo la verifica.</p>}
        {internal.unpricedPeople > 0 && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Ore registrate a costo zero per {internal.unpricedPeople} persone: verifica i costi storici. Impostare la tariffa oggi non valorizza retroattivamente quelle ore.</p>}
        {!internal.people.length && <p className="text-sm text-muted-foreground">Nessuna riga di manodopera interna in questa commessa.</p>}
        {internal.people.map(person => <section key={person.id} aria-label={`Costi di ${person.name}`} className="rounded-lg border p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="break-words text-sm font-semibold">{person.name}</h3>
            {person.overBudget && <Badge variant="destructive">Oltre budget</Badge>}
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Value label="Ore registrate" value={hours(person.hours)} />
            <Value label="Costo effettivo registrato" value={person.unpriced ? "Da completare" : money(person.cost)} />
            <Value label="Costo medio registrato / h" value={person.averageRate == null || person.unpriced ? "—" : `${money(person.averageRate)} / h`} />
            <Value label="Tariffa attuale / h" value={!readRates ? "Riservata" : person.rate?.amount == null ? "Da impostare" : `${money(person.rate.amount)} / h`} />
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">Ore previste: {person.plannedHours == null ? "non specificate" : hours(person.plannedHours)} · Budget: {person.budget == null ? "da completare" : money(person.budget)}
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
    <p className="text-sm text-muted-foreground">Ore giorno per giorno e inserimento a mano: in Cantiere → Ore e persone.</p>
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

/** Fatture e costi → Subappaltatori: il costo previsto e registrato di ogni ditta affidata nelle lavorazioni. */
export function OrderDitteEconomics({ orderId }: { orderId: string }) {
  const { teams, allowed } = useOrderLaborEconomics(orderId);
  if (!allowed) return null;
  if (teams.isPending) return <p role="status" className="p-4 text-sm text-muted-foreground">Caricamento costi delle ditte…</p>;
  if (teams.isError) return <div role="alert" className="rounded-lg border p-4"><p>Impossibile caricare i costi delle ditte. Nessun totale parziale viene mostrato.</p><Button variant="outline" size="sm" className="mt-2" onClick={() => void teams.refetch()}>Riprova</Button></div>;
  const external = teams.data ?? [];
  const subcontractNet = sumLaborAmounts(external.map(externalLaborNet));
  return (
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" />Ditte esterne e subappalti</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <dl><Value label="Costo registrato netto IVA" value={money(subcontractNet)} /></dl>
        {!external.length && <p className="text-sm text-muted-foreground">Nessuna ditta esterna registrata in questa commessa.</p>}
        {external.length > 0 && <TabellaCommessa etichetta="Costi delle ditte" righe={[...external].sort((a, b) => (a.fase?.position ?? 1e9) - (b.fase?.position ?? 1e9))} chiave={(row) => row.id} colonne={[
          { titolo: "Ditta", principale: true, cella: (row) => <>
            <span className="font-medium">{row.team?.name ?? "Ditta non disponibile"}</span>
            {row.team?.kind === "interna" && <p role="alert" className="text-xs text-amber-800">Squadra interna registrata fra le ditte: verifica l'attribuzione, senza duplicarne i costi.</p>}
          </> },
          { titolo: "Fase", cella: (row) => row.fase?.name ?? "intera commessa" },
          /* Le ditte sono in reverse charge (31/10/2026): il previsto è senza IVA. «IVA inclusa» era rimasto da prima. */
          { titolo: "Costo previsto", destra: true, cella: (row) => Number(laborAmount(row.cost_preventivo)) > 0 ? money(laborAmount(row.cost_preventivo)) : "Da scrivere nella lavorazione" },
          { titolo: "Costo registrato", destra: true, cella: (row) => <>{money(laborAmount(row.total_cost))}{Number(row.vat_rate) > 0 && <span className="block text-xs text-muted-foreground">IVA {Number(row.vat_rate)}% inclusa</span>}</> },
          { titolo: "Costo netto IVA", destra: true, cella: (row) => <span className="font-medium">{money(externalLaborNet(row))}</span> },
        ]} />}
        <p className="text-xs text-muted-foreground">Le presenze del subappaltatore non applicano il costo orario dei dipendenti. Il costo deriva dall'affidamento registrato; non equivale a una fattura pagata.</p>
      </CardContent>
    </Card>
  );
}
