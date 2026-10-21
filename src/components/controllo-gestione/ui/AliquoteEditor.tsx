/**
 * AliquoteEditor — Personalizzazione aliquote IRES + IRAP per company.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useImposte, useUpsertAliquote, type ImposteAliquote } from "@/hooks/controlloGestione/useImposte";
import { useToast } from "@/hooks/use-toast";
import { Receipt } from "lucide-react";
import { leggiImporto, messaggioErrore } from "@/lib/controlloGestione/formatCG";

const virgola = (n: number | null | undefined, standard: string) =>
  n == null ? standard : String(n).replace(".", ",");

export function AliquoteEditor() {
  const annoCorrente = new Date().getFullYear();
  const q = useImposte(annoCorrente);
  // Il modulo si rimonta quando arrivano i dati salvati: lo stato parte da lì.
  return <AliquoteForm key={q.dataUpdatedAt} iniziali={q.data?.aliquote ?? null} />;
}

function AliquoteForm({ iniziali }: { iniziali: ImposteAliquote | null }) {
  const upsert = useUpsertAliquote();
  const { toast } = useToast();

  const [ires, setIres] = useState(() => virgola(iniziali?.ires_pct, "24"));
  const [irap, setIrap] = useState(() => virgola(iniziali?.irap_pct, "3,9"));
  const [add, setAdd]   = useState(() => virgola(iniziali?.addizionale_ires_pct, "0"));
  const [includePers, setIncludePers] = useState(() => iniziali?.base_irap_include_personale ?? true);

  const handleSave = async () => {
    // «3,9» con la virgola: Number("3,9") dava NaN e il salvataggio falliva.
    const valori = [leggiImporto(ires), leggiImporto(irap), leggiImporto(add)];
    if (valori.some((v) => v === null || v < 0 || v > 100)) {
      toast({ title: "Aliquota non valida", description: "Scrivi una percentuale tra 0 e 100, ad esempio 3,9.", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({
        ires_pct: valori[0]!,
        irap_pct: valori[1]!,
        addizionale_ires_pct: valori[2]!,
        base_irap_include_personale: includePers,
      });
      toast({ title: "Aliquote salvate" });
    } catch (e) {
      toast({ title: "Aliquote non salvate", description: messaggioErrore(e), variant: "destructive" });
    }
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4" /> Aliquote per la stima delle imposte
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Valori standard: IRES 24%, IRAP 3,9%. Servono solo alla stima delle imposte nel conto
          economico: le imposte vere le calcola il commercialista.
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <Label className="text-xs">IRES %</Label>
          <Input
            inputMode="decimal"
            value={ires}
            onChange={(e) => setIres(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">IRAP %</Label>
          <Input
            inputMode="decimal"
            value={irap}
            onChange={(e) => setIrap(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Addizionale IRES %</Label>
          <Input
            inputMode="decimal"
            value={add}
            onChange={(e) => setAdd(e.target.value)}
          />
        </div>
        <div className="flex items-start gap-2 md:col-span-1">
          <Switch
            id="irap-personale"
            checked={includePers}
            onCheckedChange={setIncludePers}
          />
          <Label htmlFor="irap-personale" className="text-xs leading-snug">
            Calcola l'IRAP anche sul costo del personale
            <span className="block font-normal text-muted-foreground">
              Stima prudente. I dipendenti a tempo indeterminato sono deducibili: chiedi al commercialista.
            </span>
          </Label>
        </div>
        <div className="md:col-span-4">
          <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
            Salva aliquote
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
