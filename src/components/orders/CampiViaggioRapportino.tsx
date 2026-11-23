import { Input } from "@/components/ui/input";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { CAMPI_NUMERICI_VIAGGIO, CAMPI_TESTO_VIAGGIO, type BozzaViaggio } from "@/lib/campo/viaggiRapportino";

export function CampiViaggioRapportino({ valore, quantitaInKm, onChange }: {
  valore: BozzaViaggio;
  quantitaInKm: boolean;
  onChange: (valore: BozzaViaggio) => void;
}) {
  const t = useT();
  return (
    <fieldset className="grid grid-cols-2 gap-2 rounded-md border p-2 text-xs sm:grid-cols-3">
      <legend className="px-1 font-medium">{t("Dettagli del viaggio")}</legend>
      {CAMPI_TESTO_VIAGGIO.map(([key, label]) => (
        <label key={key} className="space-y-1">
          <span>{t(label)}</span>
          <Input className="h-8 text-sm" value={valore[key] ?? ""} onChange={(e) => onChange({ ...valore, [key]: e.target.value })} />
        </label>
      ))}
      {CAMPI_NUMERICI_VIAGGIO.filter(([key]) => key !== "km" || !quantitaInKm).map(([key, label]) => (
        <label key={key} className="space-y-1">
          <span>{t(label)}</span>
          <Input className="h-8 text-sm" inputMode="decimal" value={valore[key] ?? ""} onChange={(e) => onChange({ ...valore, [key]: e.target.value })} />
        </label>
      ))}
    </fieldset>
  );
}
