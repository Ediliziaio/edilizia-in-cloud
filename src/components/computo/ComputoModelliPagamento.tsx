/**
 * I modelli di pagamento dell'azienda nel preventivo con computo (11/11/2026).
 *
 * Gli altri otto preventivatori li offrono da un mese (`PianoPagamentoCard`): sono gli stessi con cui
 * nascono le rate delle commesse, si decidono in Impostazioni → Modelli di pagamento, e il piano si
 * copia sul preventivo, non si collega (il modello cambia, il preventivo già mandato no). Il computo
 * aveva solo quattro piani scritti nel codice, che dell'azienda non sapevano niente.
 *
 * Sta in un file suo perché legge l'azienda dal contesto di autenticazione: il riquadro dell'economia
 * lo mostra solo quando il preventivo è agganciato a un'azienda vera.
 */
import { useState } from "react";
import { BadgeEuro } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useModelliPagamento } from "@/hooks/useModelliPagamento";
import { rateDaModelloPagamento, type Rata } from "@/lib/computo/economiaComputo";

export default function ComputoModelliPagamento({ onScegli }: {
  /** Le rate del modello scelto, col suo nome: chi riceve decide se chiedere conferma prima di sostituire. */
  onScegli: (nome: string, rate: Rata[]) => void;
}) {
  const { modelli } = useModelliPagamento();
  const [scelto, setScelto] = useState("");
  if (!modelli.length) return null;
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed bg-slate-50/60 p-2">
      <div className="min-w-[14rem] flex-1 space-y-1">
        <Label htmlFor="computo-modello-pagamento" className="flex items-center gap-1.5 text-xs">
          <BadgeEuro className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />I modi di pagare della tua azienda
        </Label>
        <Select value={scelto} onValueChange={id => {
          setScelto(id);
          const m = modelli.find(x => x.id === id);
          if (m) onScegli(m.nome, rateDaModelloPagamento(m.righe));
        }}>
          <SelectTrigger id="computo-modello-pagamento" className="h-8 text-xs"><SelectValue placeholder="Parti da un modello di pagamento" /></SelectTrigger>
          <SelectContent>{modelli.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <p className="pb-1.5 text-[11px] text-muted-foreground">Le stesse rate con cui nascono le commesse. Si copiano qui e si correggono.</p>
    </div>
  );
}
