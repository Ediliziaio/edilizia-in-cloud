// src/components/settings/SalMaturaConfig.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useModelliPagamento } from "@/hooks/useModelliPagamento";
import { SAL_MATURA, type SalMatura } from "@/lib/orders/salMaturazione";

/** «Quando matura la rata di un SAL»: la scelta dell'azienda, valida nel database. */
export default function SalMaturaConfig({ puoModificare }: { puoModificare: boolean }) {
  const { salMatura, impostazioni } = useModelliPagamento();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quando matura la rata di un SAL</CardTitle>
        <CardDescription>
          Una rata «al SAL n.» diventa da incassare quando il verbale matura. La scelta vale per tutte le commesse dell'azienda e la controlla il database.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup value={salMatura} onValueChange={(v) => impostazioni.mutate({ salMatura: v as SalMatura })} disabled={!puoModificare} className="gap-3">
          {SAL_MATURA.map((s) => (
            <div key={s.valore} className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem value={s.valore} id={`sal-matura-${s.valore}`} className="mt-0.5" disabled={!puoModificare} />
              <Label htmlFor={`sal-matura-${s.valore}`} className="cursor-pointer space-y-0.5 font-normal">
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
