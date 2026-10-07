// src/components/orders/ModelloPagamentoSelect.tsx
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

/**
 * «Modello di pagamento»: una riga come gli altri campi del Riepilogo Finanziario, sopra «Numero Rate»
 * (le rate stanno lì: il modello è solo un modo più veloce di compilarle). Con il riepilogo del modello
 * scelto sotto, che sul telefono sparisce.
 */
export function ModelloPagamentoSelect({ offerti, valore, onChange }: Props) {
  if (offerti.length === 0) return null;
  const scelto = offerti.find((m) => m.id === valore);
  return (
    <div className="space-y-2">
      <Label htmlFor="modello-pagamento">Modello di pagamento</Label>
      <Select value={valore || A_MANO} onValueChange={(v) => onChange(v === A_MANO ? "" : v)}>
        <SelectTrigger id="modello-pagamento" aria-label="Modello di pagamento">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={A_MANO}>Scrivo io le rate</SelectItem>
          {offerti.map((m) => (
            <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {scelto && <p className="text-xs text-muted-foreground max-sm:hidden">{riepilogoModello(scelto.righe)} · le rate seguono il totale</p>}
    </div>
  );
}
