import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const unita = [
  ["mq", "Metri quadrati"], ["ml", "Metri lineari"], ["m", "Metri"], ["mc", "Metri cubi"],
  ["cad", "Cadauno"], ["pz", "Pezzi"], ["kg", "Chilogrammi"], ["t", "Tonnellate"],
  ["l", "Litri"], ["h", "Ore"], ["gg", "Giorni"], ["corpo", "A corpo"],
  ["a corpo", "A corpo (esteso)"], ["%", "Percentuale"], ["punto", "Punti"],
] as const;
const personalizzata = "__unita_personalizzata__";

export default function ComputoUnitaSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [altra, setAltra] = useState(false);
  const fuoriElenco = !!value && !unita.some(([u]) => u === value);
  const custom = altra || fuoriElenco;
  return <div className="space-y-2">
    <Select value={custom ? personalizzata : value} onValueChange={nuova => {
      if (nuova === personalizzata) setAltra(true);
      else { setAltra(false); onChange(nuova); }
    }}>
      <SelectTrigger id="voce-unita" aria-label="Unità di misura"><SelectValue placeholder="Seleziona unità" /></SelectTrigger>
      <SelectContent className="max-h-72">
        {unita.map(([value, nome]) => <SelectItem key={value} value={value}>{value} - {nome}</SelectItem>)}
        <SelectItem value={personalizzata}>Personalizzata</SelectItem>
      </SelectContent>
    </Select>
    {custom && <Input aria-label="Unità personalizzata" maxLength={40} value={value} onChange={e => onChange(e.target.value)} />}
  </div>;
}
