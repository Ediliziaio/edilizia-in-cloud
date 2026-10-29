/**
 * «Storico già registrato»: chi arriva da un altro gestionale importa fatture
 * che là sono già registrate, pagate e incassate. Con una data di taglio, quelle
 * fino a quel giorno entrano chiuse: emesse incassate senza scadenza, ricevute
 * contabilizzate senza costo. Niente prima nota, pagamenti o invii SDI.
 * La regola sta nel database (fatturazione_segna_storico) e nell'import
 * (supabase/functions/_shared/storicoFatture.ts).
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { History, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { userErrorMessage } from "@/lib/userErrorMessage";

const dataIt = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export interface EsitoStorico { fino_al: string | null; emesse: number; ricevute: number }

/** Il messaggio dopo il salvataggio, in parole: quante fatture sono state chiuse. */
export function messaggioStorico(e: EsitoStorico): string {
  if (!e.fino_al) return "Data di taglio tolta: le prossime fatture importate seguono le regole normali.";
  const parti = [
    e.emesse > 0 ? `${e.emesse} ${e.emesse === 1 ? "fattura emessa segnata incassata" : "fatture emesse segnate incassate"}` : null,
    e.ricevute > 0 ? `${e.ricevute} ${e.ricevute === 1 ? "fattura ricevuta segnata registrata" : "fatture ricevute segnate registrate"}` : null,
  ].filter(Boolean);
  return parti.length > 0
    ? `Fino al ${dataIt(e.fino_al)}: ${parti.join(" e ")}.`
    : `Fino al ${dataIt(e.fino_al)}: nessuna fattura da chiudere, quelle importate d'ora in poi entrano già chiuse.`;
}

export function StoricoGiaRegistrato({ integrazioneId, finoAl }: { integrazioneId: string; finoAl: string | null }) {
  const queryClient = useQueryClient();
  const [data, setData] = useState(finoAl ?? "");
  const oggi = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });

  const salva = useMutation({
    mutationFn: async (valore: string | null) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: esito, error } = await (supabase as any).rpc("fatturazione_segna_storico", {
        p_integrazione_id: integrazioneId,
        p_fino_al: valore,
      });
      if (error) throw error;
      return esito as EsitoStorico;
    },
    onSuccess: (esito) => {
      toast.success(messaggioStorico(esito));
      queryClient.invalidateQueries({ queryKey: ["billing_integrations"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["fatture-ricevute"] });
    },
    onError: (e) => toast.error(userErrorMessage(e, "Data di taglio non salvata. Riprova tra poco.")),
  });

  return (
    <div className="rounded-md border bg-muted/30 p-3 text-sm">
      <p className="flex items-center gap-2 font-medium"><History className="h-4 w-4 text-primary" aria-hidden="true" />Storico già registrato</p>
      <p className="mt-1 text-muted-foreground">
        Le fatture fino a questa data sono già registrate, pagate e incassate nel gestionale che usavi prima:
        le emesse entrano incassate e le ricevute contabilizzate, senza scadenze, costi, prima nota o invii allo SDI.
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor={`storico-${integrazioneId}`} className="text-xs">Già registrate fino al</Label>
          <Input
            id={`storico-${integrazioneId}`}
            type="date"
            max={oggi}
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="h-9 w-44"
          />
        </div>
        <Button size="sm" onClick={() => salva.mutate(data || null)} disabled={salva.isPending || (data || null) === (finoAl ?? null) || (!!data && data > oggi)}>
          {salva.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Salva
        </Button>
        {finoAl && (
          <Button size="sm" variant="ghost" onClick={() => { setData(""); salva.mutate(null); }} disabled={salva.isPending}>
            Togli la data
          </Button>
        )}
      </div>
      {finoAl && <p className="mt-1.5 text-xs text-muted-foreground">Attiva: fatture fino al {dataIt(finoAl)}. Togliendo la data, le fatture già chiuse restano chiuse.</p>}
    </div>
  );
}
