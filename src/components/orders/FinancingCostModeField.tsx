import type { ModalitaCostoFinanziaria } from "@/lib/finanziamenti/costoFinanziaria";

export function FinancingCostModeField({ value, onChange, disabled }: {
  value?: ModalitaCostoFinanziaria | null;
  onChange: (value: ModalitaCostoFinanziaria | null) => void;
  disabled?: boolean;
}) {
  return <div className="space-y-2">
    <label className="block text-sm font-medium" htmlFor="financing-cost-mode">Come viene pagato il costo della finanziaria?</label>
    <select id="financing-cost-mode" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={value ?? ""} disabled={disabled}
      onChange={e => onChange(e.target.value === "trattenuto" || e.target.value === "separato" ? e.target.value : null)}>
      <option value="">Da verificare</option>
      <option value="trattenuto">Trattenuto dall’erogazione</option>
      <option value="separato">Pagato separatamente dall’azienda</option>
    </select>
    <p className="text-xs text-muted-foreground">La quota finanziata è lorda. Il costo non riduce il saldo del cliente. Se viene trattenuto, riduce l’incasso dalla finanziaria; se è separato, va registrato come uscita distinta.</p>
    {!value && <p className="text-xs text-amber-700">Modalità ancora da verificare: i finanziamenti storici mantengono il calcolo precedente fino alla riconciliazione.</p>}
  </div>;
}
