// src/components/settings/ChiSpuntaConfig.tsx
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useChiSpunta } from "@/hooks/useChiSpunta";
import { CHI_SPUNTA, type ChiSpunta } from "@/lib/orders/chiSpunta";

/** Una regola per tutte le commesse: sta dentro la sezione «Regole per tutte le commesse» della pagina «Fasi e avanzamento». */
export default function ChiSpuntaConfig({ puoModificare }: { puoModificare: boolean }) {
  const { chiSpunta, salva } = useChiSpunta();
  return (
    <div className="space-y-3 px-4 py-4">
      <div>
        <h3 id="regola-chi-spunta" className="text-sm font-semibold leading-snug">Chi può spuntare le sottofasi dal cantiere</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          L'ufficio spunta sempre. Questa regola vale per chi lavora in cantiere (operai, squadre, ditte) e vale subito, anche per chi ha l'app già aperta.
        </p>
      </div>
      <RadioGroup aria-labelledby="regola-chi-spunta" value={chiSpunta} onValueChange={(v) => salva.mutate(v as ChiSpunta)} disabled={!puoModificare} className="gap-3">
        {CHI_SPUNTA.map((s) => (
          <div key={s.valore} className="flex items-start gap-3 rounded-lg border p-3">
            <RadioGroupItem value={s.valore} id={`chi-spunta-${s.valore}`} className="mt-0.5 shrink-0" disabled={!puoModificare} />
            <Label htmlFor={`chi-spunta-${s.valore}`} className="cursor-pointer space-y-0.5 font-normal">
              <span className="block text-sm font-medium">{s.etichetta}</span>
              <span className="block text-xs text-muted-foreground">{s.spiegazione}</span>
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
