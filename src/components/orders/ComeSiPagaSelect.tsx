// src/components/orders/ComeSiPagaSelect.tsx
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { riepilogoModello, type ModelloPagamento } from "@/lib/orders/modelliPagamento";

const A_MANO = "__a_mano__";

interface Props {
  offerti: ReadonlyArray<ModelloPagamento>;
  /** L'id del modello applicato, o testo vuoto se le rate sono scritte a mano. */
  valore: string;
  onChange: (id: string) => void;
}

/** Nel modulo di nuova commessa: «Come si paga». Una riga, con il riepilogo del modello scelto sotto. */
export function ComeSiPagaSelect({ offerti, valore, onChange }: Props) {
  if (offerti.length === 0) return null;
  const scelto = offerti.find((m) => m.id === valore);
  return (
    <div className="space-y-1.5 rounded-lg border bg-background p-3 max-sm:p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="come-si-paga" className="shrink-0">Come si paga</Label>
        <Select value={valore || A_MANO} onValueChange={(v) => onChange(v === A_MANO ? "" : v)}>
          <SelectTrigger id="come-si-paga" aria-label="Come si paga" className="h-9 min-w-[14rem] flex-1 sm:max-w-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={A_MANO}>Scrivo io le rate</SelectItem>
            {offerti.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {scelto && <p className="text-xs text-muted-foreground max-sm:hidden">{riepilogoModello(scelto.righe)} · le rate seguono il totale</p>}
    </div>
  );
}
