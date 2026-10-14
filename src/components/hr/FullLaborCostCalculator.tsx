import { useState } from "react";
import { HR_COST_FIELDS, calculateFullLaborCost, emptyHrCostDraft } from "@/lib/personale/laborCostPlan";
import { formatCurrency } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function FullLaborCostCalculator({ onPropose, disabled = false }: { onPropose: (rate: number) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState(emptyHrCostDraft);
  const result = calculateFullLaborCost(draft);
  const [checked, setChecked] = useState(false);
  return <details className="rounded-lg border bg-background p-3">
    <summary className="cursor-pointer text-sm font-semibold">Calcola il costo pieno con TFR e assenze</summary>
    <p className="mt-3 text-xs text-muted-foreground">Simulazione annua, non cedolino. Usa il prospetto del consulente: il lordo comprende le mensilità aggiuntive; gli oneri sono solo a carico azienda. Inserisci zero nelle voci non previste.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {HR_COST_FIELDS.map(([key, label]) => <div key={key} className="space-y-1">
        <Label htmlFor={`hr-full-${key}`}>{label}{key.includes("Hours") ? " (h)" : " (€)"}</Label>
        <Input id={`hr-full-${key}`} inputMode="decimal" disabled={disabled} value={draft[key]} onChange={e => { setChecked(false); setDraft(d => ({ ...d, [key]: e.target.value })); }} />
      </div>)}
    </div>
    <p className="mt-2 text-xs text-muted-foreground">Ore non produttive: ferie, permessi, festività, malattia e formazione, senza contare due volte la stessa ora. Recuperi e rimborsi devono riferirsi agli stessi costi annui. IRPEF e trattenute personali non si aggiungono al costo aziendale.</p>
    {checked && result.errors.length > 0 && <p role="alert" className="mt-3 text-sm text-destructive">{result.errors[0]}</p>}
    {result.hourlyCost != null && <dl className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-sm">
      <div><dt className="text-muted-foreground">Costo aziendale annuo</dt><dd className="font-semibold">{formatCurrency(result.annualCost!)}</dd></div>
      <div><dt className="text-muted-foreground">Ore produttive</dt><dd className="font-semibold">{result.productiveHours!.toLocaleString("it-IT")} h</dd></div>
      <div className="col-span-2"><dt className="text-muted-foreground">Tariffa piena proposta</dt><dd className="text-lg font-semibold">{formatCurrency(result.hourlyCost)} / h</dd></div>
    </dl>}
    <Button type="button" variant="outline" size="sm" className="mt-3" disabled={disabled} onClick={() => {
      setChecked(true);
      if (result.hourlyCost != null) onPropose(result.hourlyCost);
    }}>Usa questa tariffa nel campo costo</Button>
    <p className="mt-2 text-xs text-muted-foreground">La proposta non salva. «Salva il costo» conserva solo la tariffa, non questo prospetto annuo. Lo storico delle commesse non viene ricalcolato.</p>
  </details>;
}
