import type { ModalitaCostoFinanziaria } from "@/lib/finanziamenti/costoFinanziaria";
import { OfficeSelect } from "./OfficeSelect";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function FinancingCostModeField({ value, onChange, disabled }: {
  value?: ModalitaCostoFinanziaria | null;
  onChange: (value: ModalitaCostoFinanziaria | null) => void;
  disabled?: boolean;
}) {
  const t = useT();
  return <div className="space-y-2">
    <label className="block text-sm font-medium" htmlFor="financing-cost-mode">{t("Come viene pagato il costo della finanziaria?")}</label>
    <OfficeSelect id="financing-cost-mode" label={t("Costo del finanziamento")} value={value ?? ""} disabled={disabled}
      onValueChange={v => onChange(v === "trattenuto" || v === "separato" ? v : null)}
      options={[
        { value: "", label: t("Da verificare") },
        { value: "trattenuto", label: t("Trattenuto dall’erogazione") },
        { value: "separato", label: t("Pagato separatamente dall’azienda") },
      ]} />
    <p className="text-xs text-muted-foreground">{t("La quota finanziata è lorda. Il costo non riduce il saldo del cliente. Se viene trattenuto, riduce l’incasso dalla finanziaria; se è separato, va registrato come uscita distinta.")}</p>
    {!value && <p className="text-xs text-amber-700">{t("Modalità ancora da verificare: i finanziamenti storici mantengono il calcolo precedente fino alla riconciliazione.")}</p>}
  </div>;
}
