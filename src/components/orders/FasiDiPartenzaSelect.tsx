// src/components/orders/FasiDiPartenzaSelect.tsx
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ModelloFasi } from "@/lib/orders/modelliFasi";

const NESSUNA = "__nessuna__";
const CONTRATTO = "__contratto__";

interface Props {
  offerti: ReadonlyArray<ModelloFasi>;
  /** L'id del modello scelto, o testo vuoto per «Nessuna». */
  valore: string;
  onChange: (id: string) => void;
  /** Le fasi in anteprima vengono dal contratto letto (15/11/2026): la tendina lo dice invece di «Nessuna». */
  dalContratto?: boolean;
}

/**
 * Cosa vuol dire un cambio della tendina: l'id del modello, "" per «Nessuna», null per niente da fare.
 * Il valore vuoto non è una scelta: Radix lo manda da solo quando il valore passa a una voce appena comparsa
 * («Dal contratto letto»), e trattarlo come «Nessuna» cancellava le fasi del contratto (collaudo del 15/11).
 */
export function sceltaFasiDiPartenza(v: string): string | null {
  if (!v || v === CONTRATTO) return null;
  return v === NESSUNA ? "" : v;
}

/** Nel modulo di nuova commessa: con quali fasi parte. Una riga, facoltativa. */
export function FasiDiPartenzaSelect({ offerti, valore, onChange, dalContratto = false }: Props) {
  if (offerti.length === 0) return null;
  return (
    <div className="space-y-2">
      <Label htmlFor="fasi-di-partenza">Fasi di lavoro</Label>
      <Select value={dalContratto ? CONTRATTO : valore || NESSUNA} onValueChange={(v) => { const scelta = sceltaFasiDiPartenza(v); if (scelta !== null) onChange(scelta); }}>
        <SelectTrigger id="fasi-di-partenza" aria-label="Fasi di lavoro">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {dalContratto && <SelectItem value={CONTRATTO}>Dal contratto letto</SelectItem>}
          <SelectItem value={NESSUNA}>Nessuna: le scelgo dopo</SelectItem>
          {offerti.map((m) => (
            <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
