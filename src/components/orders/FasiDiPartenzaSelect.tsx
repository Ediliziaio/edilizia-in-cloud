// src/components/orders/FasiDiPartenzaSelect.tsx
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ModelloFasi } from "@/lib/orders/modelliFasi";

const NESSUNA = "__nessuna__";

interface Props {
  offerti: ReadonlyArray<ModelloFasi>;
  /** L'id del modello scelto, o testo vuoto per «Nessuna». */
  valore: string;
  onChange: (id: string) => void;
}

/** Nel modulo di nuova commessa: con quali fasi parte. Una riga, facoltativa. */
export function FasiDiPartenzaSelect({ offerti, valore, onChange }: Props) {
  if (offerti.length === 0) return null;
  return (
    <div className="space-y-2">
      <Label htmlFor="fasi-di-partenza">Fasi di lavoro</Label>
      <Select value={valore || NESSUNA} onValueChange={(v) => onChange(v === NESSUNA ? "" : v)}>
        <SelectTrigger id="fasi-di-partenza" aria-label="Fasi di lavoro">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NESSUNA}>Nessuna: le scelgo dopo</SelectItem>
          {offerti.map((m) => (
            <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground max-sm:hidden">
        Scegli un modello e verifica le fasi qui sotto. Le modifiche valgono solo per questa commessa.
      </p>
    </div>
  );
}
