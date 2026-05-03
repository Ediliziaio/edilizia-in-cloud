/**
 * AliquoteEditor — Personalizzazione aliquote IRES + IRAP per company.
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useImposte, useUpsertAliquote } from "@/hooks/controlloGestione/useImposte";
import { useToast } from "@/hooks/use-toast";
import { Receipt } from "lucide-react";

export function AliquoteEditor() {
  const annoCorrente = new Date().getFullYear();
  const q = useImposte(annoCorrente);
  const upsert = useUpsertAliquote();
  const { toast } = useToast();

  const [ires, setIres] = useState("24.00");
  const [irap, setIrap] = useState("3.90");
  const [add, setAdd]   = useState("0.00");
  const [includePers, setIncludePers] = useState(true);

  useEffect(() => {
    if (q.data) {
      setIres(String(q.data.aliquote.ires_pct));
      setIrap(String(q.data.aliquote.irap_pct));
      setAdd(String(q.data.aliquote.addizionale_ires_pct));
      setIncludePers(q.data.aliquote.base_irap_include_personale);
    }
  }, [q.data]);

  const handleSave = async () => {
    try {
      await upsert.mutateAsync({
        ires_pct: Number(ires),
        irap_pct: Number(irap),
        addizionale_ires_pct: Number(add),
        base_irap_include_personale: includePers,
      });
      toast({ title: "Aliquote salvate" });
    } catch (e) {
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    }
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4" /> Aliquote IRES + IRAP
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Default IRES 24% IRAP 3.9%. Modificabili per casi specifici (addizionale banche/assicurazioni 3.5%, ecc.).
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <Label className="text-xs">IRES %</Label>
          <Input
            type="number"
            step="0.01"
            value={ires}
            onChange={(e) => setIres(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">IRAP %</Label>
          <Input
            type="number"
            step="0.01"
            value={irap}
            onChange={(e) => setIrap(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Addizionale IRES %</Label>
          <Input
            type="number"
            step="0.01"
            value={add}
            onChange={(e) => setAdd(e.target.value)}
          />
        </div>
        <div className="flex items-end gap-2">
          <Switch
            checked={includePers}
            onCheckedChange={setIncludePers}
          />
          <Label className="text-xs">IRAP include costo personale</Label>
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
