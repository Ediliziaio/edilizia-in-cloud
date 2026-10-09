// src/components/settings/AvanzamentoCommessaConfig.tsx
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { usePesoMediaFasi } from "@/hooks/usePesoMediaFasi";
import { PESI_MEDIA, type PesoMedia } from "@/lib/orders/avanzamentoCommessa";

/** Una regola per tutte le commesse: sta dentro la sezione «Regole per tutte le commesse» della pagina «Fasi e avanzamento». */
export default function AvanzamentoCommessaConfig({ puoModificare }: { puoModificare: boolean }) {
  const { pesoMedia, salva } = usePesoMediaFasi();
  return (
    <div className="space-y-3 px-4 py-4">
      <div>
        <h3 id="regola-avanzamento" className="text-sm font-semibold leading-snug">Come si calcola l'avanzamento della commessa</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          La percentuale che vedi sulla commessa è la media delle sue fasi. Scegli quanto conta ciascuna: se a una fase manca il dato (la data o l'importo venduto), le fasi contano alla pari.
        </p>
      </div>
      <RadioGroup aria-labelledby="regola-avanzamento" value={pesoMedia} onValueChange={(v) => salva.mutate(v as PesoMedia)} disabled={!puoModificare} className="gap-3">
        {PESI_MEDIA.map((p) => (
          <div key={p.valore} className="flex items-start gap-3 rounded-lg border p-3">
            <RadioGroupItem value={p.valore} id={`peso-${p.valore}`} className="mt-0.5 shrink-0" disabled={!puoModificare} />
            <Label htmlFor={`peso-${p.valore}`} className="cursor-pointer space-y-0.5 font-normal">
              <span className="block text-sm font-medium">{p.etichetta}</span>
              <span className="block text-xs text-muted-foreground">{p.spiegazione}</span>
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
