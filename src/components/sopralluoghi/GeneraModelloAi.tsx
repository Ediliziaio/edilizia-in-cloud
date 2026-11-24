/**
 * «Descrivilo all'AI»: un modello di sopralluogo da una descrizione (piano sopralluoghi, lotto 6).
 * L'AI scrive il modello (`ai-genera-modello-sopralluogo`, addebitata all'azienda), qui si vede
 * l'anteprima con quello che è stato corretto; il modello si crea solo confermando, e poi si
 * rifinisce nell'editor come gli altri.
 */
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TemplateSchema } from "@/types/surveys";

interface Esito { schema: TemplateSchema; avvisi: string[] }

export function GeneraModelloAi({ categoria, esito, onEsito }: {
  categoria: string;
  esito: Esito | null;
  onEsito: (e: Esito | null) => void;
}) {
  const companyId = useEffectiveCompanyId();
  const [descrizione, setDescrizione] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");

  const genera = async () => {
    if (inCorso || !companyId) return;
    setInCorso(true);
    setErrore("");
    onEsito(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-genera-modello-sopralluogo", {
        body: { company_id: companyId, descrizione, categoria },
      });
      const risposta = data as { ok?: boolean; error?: string; schema?: TemplateSchema; avvisi?: string[] } | null;
      if (error || !risposta?.ok || !risposta.schema) {
        // supabase-js mette il corpo dell'errore nel contesto: si mostra il messaggio della funzione.
        const corpo = await (error as { context?: Response } | null)?.context?.json?.().catch((): null => null) as { error?: string } | null | undefined;
        throw new Error(risposta?.error || corpo?.error || "Modello non generato. Riprova.");
      }
      onEsito({ schema: risposta.schema, avvisi: risposta.avvisi ?? [] });
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setInCorso(false);
    }
  };

  const tipi = esito?.schema.element_types ?? [];
  return (
    <div className="space-y-2">
      <div>
        <Label htmlFor="modello-ai-descrizione" className="text-xs">Cosa deve rilevare il sopralluogo</Label>
        <Textarea
          id="modello-ai-descrizione"
          rows={4}
          value={descrizione}
          maxLength={4000}
          onChange={(e) => setDescrizione(e.target.value)}
          placeholder="Es. Rifacimento bagno: misure della stanza, sanitari da togliere e da mettere, piatto doccia, rivestimenti a mq, posizione degli scarichi, stato dell'impianto elettrico."
        />
      </div>
      <Button type="button" variant="outline" className="w-full gap-2" disabled={inCorso || descrizione.trim().length < 15} onClick={genera}>
        {inCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {inCorso ? "Scrivo il modello… (fino a un minuto)" : esito ? "Rigenera" : "Genera l'anteprima"}
      </Button>
      <p className="text-[11px] text-muted-foreground">Usa il credito AI dell'azienda. Il modello si crea solo quando confermi.</p>
      {errore && <p role="alert" className="text-xs text-rose-700">{errore}</p>}
      {esito && (
        <div className="space-y-1.5 rounded-md border bg-muted/30 p-2 text-xs" aria-label="Anteprima del modello">
          <p className="font-medium">
            {tipi.length} {tipi.length === 1 ? "tipo di elemento" : "tipi di elemento"} · {esito.schema.area_definition?.label_plural ?? "Ambienti"}
          </p>
          <ul className="space-y-0.5">
            {tipi.map((t) => {
              const campi = (t.sections ?? []).flatMap((s) => s.fields ?? []);
              const tecnici = campi.filter((f) => f.solo_tecnico).length;
              return (
                <li key={t.key}>
                  <span className="font-medium">{t.label}</span>
                  <span className="text-muted-foreground"> — {campi.length} campi{tecnici ? `, ${tecnici} solo per il tecnico` : ""}{esito.schema.output_mapping?.estimate_lines?.[t.key] ? ", riga di preventivo" : ""}</span>
                </li>
              );
            })}
          </ul>
          {esito.avvisi.length > 0 && (
            <details>
              <summary className="cursor-pointer text-amber-800">{esito.avvisi.length} correzioni fatte alla risposta dell'AI</summary>
              <ul className="mt-1 list-disc pl-4 text-amber-900">{esito.avvisi.map((a) => <li key={a}>{a}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
