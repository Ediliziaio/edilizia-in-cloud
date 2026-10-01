import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { queryKeys } from "@/lib/queryKeys";
import type { Integration } from "@/types/integrations";

type Modo = "off" | "segnala" | "blocca";

const SCELTE: { valore: Modo; titolo: string; testo: string }[] = [
  { valore: "off", titolo: "Come prima", testo: "Chi ricompila il modulo rientra sempre, anche se la sua richiesta era stata persa o abbandonata." },
  { valore: "segnala", titolo: "Fai entrare, ma segnala", testo: "Si apre una nuova opportunità con l'etichetta «rientro-dopo-chiusura» e una nota sulla vecchia scheda." },
  { valore: "blocca", titolo: "Non farlo rientrare", testo: "Il contatto si aggiorna, ma non si apre nessuna opportunità e non parte nessuna automazione né avviso. Resta una nota sulla vecchia scheda." },
];

/**
 * «Lead che rientrano» (01/10/2026): per i lead di Meta che ricompilano il modulo
 * dopo una richiesta persa o abbandonata. La regola vale per tutta l'azienda ed è
 * decisa qui; il lavoro lo fa meta-process-leads (_shared/rientroLead.ts).
 */
export function RientroLeadCard({ integration, canManage }: { integration: Integration; canManage: boolean }) {
  const queryClient = useQueryClient();
  const salvato = (integration.rientro_lead_modo ?? "off") as Modo;
  const giorniSalvati = integration.rientro_lead_giorni ?? 90;
  const [modo, setModo] = useState<Modo>(salvato);
  const [giorni, setGiorni] = useState(String(giorniSalvati));

  useEffect(() => {
    setModo(salvato);
    setGiorni(String(giorniSalvati));
  }, [salvato, giorniSalvati]);

  const giorniNum = Math.round(Number(giorni));
  const giorniValidi = Number.isFinite(giorniNum) && giorniNum >= 1 && giorniNum <= 3650;
  const modificato = modo !== salvato || (giorniValidi && giorniNum !== giorniSalvati);

  const salva = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("integrations")
        .update({ rientro_lead_modo: modo, rientro_lead_giorni: giorniNum } as never)
        .eq("id", integration.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Impostazione salvata");
      queryClient.invalidateQueries({ queryKey: queryKeys.metaForms.integration(integration.company_id) });
    },
    onError: (e: Error) => toast.error("Non salvata", { description: e.message }),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <CardTitle className="text-sm font-medium">Lead che rientrano</CardTitle>
        </div>
        <CardDescription>
          Cosa fare quando chi ha la richiesta persa o abbandonata ricompila un modulo Meta, per non far perdere tempo al team.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <RadioGroup value={modo} onValueChange={(v) => setModo(v as Modo)} disabled={!canManage} className="space-y-2">
          {SCELTE.map((s) => (
            <label
              key={s.valore}
              htmlFor={`rientro-${s.valore}`}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${modo === s.valore ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
            >
              <RadioGroupItem id={`rientro-${s.valore}`} value={s.valore} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">{s.titolo}</span>
                <span className="block text-xs text-muted-foreground">{s.testo}</span>
              </span>
            </label>
          ))}
        </RadioGroup>

        {modo !== "off" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Label htmlFor="rientro-giorni" className="text-sm font-normal">Vale se l'ultima chiusura è di meno di</Label>
            <Input
              id="rientro-giorni"
              type="number"
              inputMode="numeric"
              min={1}
              max={3650}
              value={giorni}
              onChange={(e) => setGiorni(e.target.value)}
              disabled={!canManage}
              className="h-8 w-20 text-right tabular-nums"
              aria-invalid={!giorniValidi}
            />
            <span>giorni fa.</span>
            {!giorniValidi && <span className="text-xs text-destructive">Da 1 a 3650.</span>}
          </div>
        )}

        {canManage ? (
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={() => salva.mutate()} disabled={!modificato || !giorniValidi || salva.isPending}>
              {salva.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Salva
            </Button>
            {modificato && <span className="text-xs text-amber-700">Modifiche non salvate.</span>}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Solo un amministratore dell'azienda può cambiare questa impostazione.</p>
        )}
      </CardContent>
    </Card>
  );
}
