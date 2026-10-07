// src/components/settings/AvanzamentoCommessaConfig.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { usePesoMediaFasi } from "@/hooks/usePesoMediaFasi";
import { PESI_MEDIA, type PesoMedia } from "@/lib/orders/avanzamentoCommessa";

export default function AvanzamentoCommessaConfig({ puoModificare }: { puoModificare: boolean }) {
  const { pesoMedia, salva } = usePesoMediaFasi();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Come si calcola l'avanzamento della commessa</CardTitle>
        <CardDescription>
          La commessa avanza con le sue fasi. Scegli quanto conta ciascuna: se a una fase manca il dato (la data o il venduto), la commessa conta le fasi alla pari.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup value={pesoMedia} onValueChange={(v) => salva.mutate(v as PesoMedia)} disabled={!puoModificare} className="gap-3">
          {PESI_MEDIA.map((p) => (
            <div key={p.valore} className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem value={p.valore} id={`peso-${p.valore}`} className="mt-0.5" disabled={!puoModificare} />
              <Label htmlFor={`peso-${p.valore}`} className="cursor-pointer space-y-0.5 font-normal">
                <span className="block text-sm font-medium">{p.etichetta}</span>
                <span className="block text-xs text-muted-foreground">{p.spiegazione}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
