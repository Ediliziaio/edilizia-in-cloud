// src/components/settings/SalMaturaConfig.tsx
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AmbitoImpostazione, SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { useModelliPagamento } from "@/hooks/useModelliPagamento";
import { SAL_MATURA, type SalMatura } from "@/lib/orders/salMaturazione";

/** «Quando matura la rata di un SAL»: la scelta dell'azienda, vale per tutte le sue commesse (anche quelle già aperte). */
export default function SalMaturaConfig({ puoModificare, evidenziata = false }: { puoModificare: boolean; evidenziata?: boolean }) {
  const { salMatura, impostazioni } = useModelliPagamento();
  return (
    <SezioneImpostazione
      id="sal"
      titolo="Quando matura la rata di un SAL"
      descrizione="Una rata «al SAL n.» diventa da incassare quando il verbale matura. La scelta vale per tutte le commesse dell'azienda, anche per quelle già aperte."
      ambito={<AmbitoImpostazione>Tutte le commesse</AmbitoImpostazione>}
      azione={<span>Si salva subito</span>}
      evidenziata={evidenziata}
    >
      <div className="px-4 py-4">
        <RadioGroup aria-label="Quando matura la rata di un SAL" value={salMatura} onValueChange={(v) => impostazioni.mutate({ salMatura: v as SalMatura })} disabled={!puoModificare} className="gap-3">
          {SAL_MATURA.map((s) => (
            <div key={s.valore} className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem value={s.valore} id={`sal-matura-${s.valore}`} className="mt-0.5 shrink-0" disabled={!puoModificare} />
              <Label htmlFor={`sal-matura-${s.valore}`} className="cursor-pointer space-y-0.5 font-normal">
                <span className="block text-sm font-medium">{s.etichetta}</span>
                <span className="block text-xs text-muted-foreground">{s.spiegazione}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    </SezioneImpostazione>
  );
}
