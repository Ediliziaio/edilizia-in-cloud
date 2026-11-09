import type { ModalitaCostoFinanziaria } from "@/lib/finanziamenti/costoFinanziaria";
import { OfficeSelect } from "./OfficeSelect";

export function FinancingCostModeField({ value, onChange, disabled }: {
  value?: ModalitaCostoFinanziaria | null;
  onChange: (value: ModalitaCostoFinanziaria | null) => void;
  disabled?: boolean;
}) {
  return <div className="space-y-2">
    <label className="block text-sm font-medium" htmlFor="financing-cost-mode">Come viene pagato il costo della finanziaria?</label>
    <OfficeSelect id="financing-cost-mode" label="Costo del finanziamento" value={value ?? ""} disabled={disabled}
      onValueChange={v => onChange(v === "trattenuto" || v === "separato" ? v : null)}
      options={[
        { value: "", label: "Da verificare" },
        { value: "trattenuto", label: "Trattenuto dall’erogazione" },
        { value: "separato", label: "Pagato separatamente dall’azienda" },
      ]} />
    <p className="text-xs text-muted-foreground">La quota finanziata è lorda. Il costo non riduce il saldo del cliente. Se viene trattenuto, riduce l’incasso dalla finanziaria; se è separato, va registrato come uscita distinta.</p>
    {!value && <p className="text-xs text-amber-700">Modalità ancora da verificare: i finanziamenti storici mantengono il calcolo precedente fino alla riconciliazione.</p>}
  </div>;
}
