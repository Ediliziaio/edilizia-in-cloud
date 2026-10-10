import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { queryKeys } from "@/lib/queryKeys";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { userErrorMessage } from "@/lib/userErrorMessage";
import type { Integration } from "@/types/integrations";

type Modo = "off" | "segnala" | "blocca";

/** Come si legge la scelta già salvata, a scheda chiusa (diverso dai titoli delle tre scelte, per non ripeterli). */
const STATO_SALVATO: Record<Modo, string> = {
  off: "Nessuna regola",
  segnala: "Fa entrare e segnala",
  blocca: "Non li fa rientrare",
};

const SCELTE: { valore: Modo; titolo: string; testo: string }[] = [
  { valore: "off", titolo: "Come prima", testo: "Chi ricompila il modulo rientra sempre, anche se la sua richiesta era stata persa o abbandonata." },
  { valore: "segnala", titolo: "Fai entrare, ma segnala", testo: "Si apre una nuova opportunità con l'etichetta «rientro-dopo-chiusura» e una nota sulla vecchia scheda." },
  { valore: "blocca", titolo: "Non farlo rientrare", testo: "Il contatto si aggiorna, ma non si apre nessuna opportunità e non parte nessuna automazione né avviso. Resta una nota sulla vecchia scheda." },
];

/**
 * «Lead che rientrano» (01/10/2026): per i lead di Meta che ricompilano il modulo
 * dopo una richiesta persa o abbandonata. La regola vale per tutta l'azienda ed è
 * decisa qui; il lavoro lo fa meta-process-leads (_shared/rientroLead.ts).
 *
 * 09/10/2026: sta sotto l'elenco dei moduli, chiusa se la scelta è «Come prima» (nessuna azienda l'ha cambiata) e aperta
 * da sola se è già attiva; chi la cambia e cerca di uscire senza salvare riceve l'avviso delle modifiche non salvate.
 */
export function RientroLeadCard({ integration, canManage }: { integration: Integration; canManage: boolean }) {
  const queryClient = useQueryClient();
  const salvato = (integration.rientro_lead_modo ?? "off") as Modo;
  const giorniSalvati = integration.rientro_lead_giorni ?? 90;
  const [modo, setModo] = useState<Modo>(salvato);
  const [giorni, setGiorni] = useState(String(giorniSalvati));

  // Quando il valore salvato cambia (dopo «Salva») la scheda riparte da quello: lo fa la `key` che le dà la pagina.

  const giorniNum = Math.round(Number(giorni));
  const giorniValidi = Number.isFinite(giorniNum) && giorniNum >= 1 && giorniNum <= 3650;
  const modificato = modo !== salvato || (giorniValidi && giorniNum !== giorniSalvati);
  useSettingsDraftGuard(canManage && (modo !== salvato || giorni !== String(giorniSalvati)));

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
    onError: (e: Error) => toast.error("Non salvata", { description: userErrorMessage(e, "Riprova tra poco.") }),
  });

  return (
    <details
      open={salvato !== "off"}
      className="rounded-lg border bg-card text-card-foreground shadow-sm [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-6 py-4">
        <RotateCcw className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-sm font-medium">Lead che rientrano</h2>
        <span className="ml-auto text-xs text-muted-foreground">{STATO_SALVATO[salvato]}</span>
      </summary>
      <div className="space-y-4 px-6 pb-6">
        <p className="text-sm text-muted-foreground">
          Cosa fare quando chi ha la richiesta persa o abbandonata ricompila un modulo Meta, per non far perdere tempo al team.
        </p>
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
      </div>
    </details>
  );
}
