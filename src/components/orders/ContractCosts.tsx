import { Link } from "react-router-dom";
import { useContractCosts } from "@/hooks/useContractCosts";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ContractCosts({ contractId, financeConfirmed }: { contractId: string; financeConfirmed: boolean }) {
  const q = useContractCosts(contractId);
  const { canViewMargins, canViewOrderAmounts } = usePermissions();
  if (!q.allowed) return null;
  return <Card aria-label="Costi consolidati del contratto" id="section-costi-contratto">
    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
      <CardTitle className="text-base">Costi del contratto e degli interventi</CardTitle>
      <Button size="sm" variant="outline" disabled={q.isFetching} onClick={() => void q.refetch()}>Aggiorna costi</Button>
    </CardHeader>
    <CardContent className="space-y-4 text-sm">
      {q.isPending ? <p role="status">Caricamento costi del contratto…</p> : q.isError || !q.data ?
        <p role="alert">Impossibile verificare tutti i costi. Nessun totale parziale viene mostrato. Riprova con Aggiorna costi.</p> : <>
        <dl className="grid grid-cols-1 gap-4 rounded-lg bg-muted/40 p-3 sm:grid-cols-3">
          <Metric label="Costi registrati sul contratto" amount={q.data.contract.actual.costs} />
          <Metric label={`Costi dei ${q.data.interventions.length} interventi`} amount={q.data.interventionCosts} />
          <Metric label="Totale consolidato dei costi registrati" amount={q.data.costs} />
        </dl>
        <p>Il totale comprende il contratto e gli interventi accessibili al tuo ruolo, inclusi quelli conclusi. Ogni costo resta nella scheda di origine e viene sommato una sola volta; i totali aziendali mantengono le registrazioni originali.</p>
        <p className="text-muted-foreground">Aggiornamento automatico ogni 30 secondi mentre questa pagina è aperta e al ritorno nella finestra. Sono i costi attualmente registrati: rapportini da approvare, costi da valorizzare e stime dei mezzi non vengono aggiunti come costi effettivi.</p>
        {(q.data.missingWarehouseCosts > 0 || q.data.pendingMileage > 0) && <p role="status" className="rounded border border-amber-300 p-3">Dati da completare: {q.data.missingWarehouseCosts} movimenti di magazzino senza costo; {q.data.pendingMileage} rimborsi chilometrici da approvare.</p>}
        {canViewMargins && canViewOrderAmounts && (financeConfirmed && q.data.margin !== null ? <p>Margine sui costi registrati: <strong>{formatCurrency(q.data.margin)}</strong>. Ricavi del solo contratto: {formatCurrency(q.data.revenue)}. Il margine resta provvisorio finché tutti i costi non sono confermati.</p> : <p className="text-muted-foreground">Margine da verificare: conferma prima i dati economici del contratto. Nessuna IVA o rata viene aggiunta dal consolidamento.</p>)}
        <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Dettaglio per intervento e categoria</summary>
          <ul className="mt-3 space-y-3">{q.data.interventions.map(line => <li key={line.id} className="flex flex-wrap justify-between gap-2">
            <Link className="min-w-0 break-words underline" to={`/azienda/ordini/${line.id}?tab=cantiere`}>{line.intervention_reference || line.order_code} · {line.description}</Link>
            <strong className="tabular-nums">{formatCurrency(line.actual.costs)}</strong>
          </li>)}</ul>
          {!q.data.interventions.length && <p className="mt-3">Nessun intervento collegato.</p>}
          <dl className="mt-4 grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-2">{q.data.categories.map(category => <Metric key={category.label} label={category.label} amount={category.amount} />)}</dl>
          <p className="mt-3 text-xs text-muted-foreground">Stesse fonti del conto economico delle commesse: acquisti emessi e consumi di magazzino già riconciliati, manodopera registrata, provvigioni, rimborsi approvati, errori e costi diretti. Le fatture e i pagamenti degli stessi acquisti non si sommano nuovamente. Nessun costo viene copiato sul contratto.</p>
        </details>
      </>}
    </CardContent>
  </Card>;
}
function Metric({ label, amount }: { label: string; amount: number }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-base font-semibold tabular-nums">{formatCurrency(amount)}</dd></div>;
}
