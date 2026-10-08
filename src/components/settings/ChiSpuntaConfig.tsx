// src/components/settings/ChiSpuntaConfig.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useChiSpunta } from "@/hooks/useChiSpunta";
import { CHI_SPUNTA, type ChiSpunta } from "@/lib/orders/chiSpunta";

export default function ChiSpuntaConfig({ puoModificare }: { puoModificare: boolean }) {
  const { chiSpunta, salva } = useChiSpunta();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Chi può spuntare le sottofasi dal cantiere</CardTitle>
        <CardDescription>
          L'ufficio spunta sempre. Questa regola vale per chi lavora in cantiere (operai, squadre, ditte), e la controlla il database: anche chi ha ancora l'app vecchia la rispetta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup value={chiSpunta} onValueChange={(v) => salva.mutate(v as ChiSpunta)} disabled={!puoModificare} className="gap-3">
          {CHI_SPUNTA.map((s) => (
            <div key={s.valore} className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem value={s.valore} id={`chi-spunta-${s.valore}`} className="mt-0.5" disabled={!puoModificare} />
              <Label htmlFor={`chi-spunta-${s.valore}`} className="cursor-pointer space-y-0.5 font-normal">
                <span className="block text-sm font-medium">{s.etichetta}</span>
                <span className="block text-xs text-muted-foreground">{s.spiegazione}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
