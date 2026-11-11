import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { messaggioSalvataggio } from "@/lib/fatturazione/salvataggioFattura";
import { SCENARI_RICONCILIAZIONE } from "../../../supabase/functions/_shared/riconciliazioneFattureScenari.ts";
import type { EsitoRigaConfronto } from "@/lib/fatturazione/confrontoDocumenti";
import type { PropostaRiconciliazione } from "../../../supabase/functions/_shared/riconciliazioneFattureAI.ts";

/** Banco di prova locale: usa chiamate reali, senza registrare fatture o documenti fittizi. */
export function SimulazioniRiconciliazioneAI({
  fatturaId,
  documenti,
  disabled,
}: {
  fatturaId: string;
  documenti: { ddt: string[]; oda: string[] };
  disabled: boolean;
}) {
  const [esiti, setEsiti] = useState<
    {
      scenario: string;
      titolo: string;
      modello?: string;
      proposta?: PropostaRiconciliazione;
      esiti?: EsitoRigaConfronto[];
      errore?: string;
    }[]
  >([]);
  const [inCorso, setInCorso] = useState(false);
  const esegui = async () => {
    setInCorso(true);
    setEsiti([]);
    try {
      for (const [scenario, titolo] of SCENARI_RICONCILIAZIONE) {
        const { data, error } = await supabase.functions.invoke(
          "riconcilia-fattura-ai",
          {
            body: {
              fattura_id: fatturaId,
              documenti,
              simulazione: scenario,
              richiesta_id: crypto.randomUUID(),
            },
          },
        );
        if (error || data?.error) {
          let errore = data?.error ?? messaggioSalvataggio(error);
          try {
            errore = (await error?.context?.json())?.error ?? errore;
          } catch {
            /* errore di rete */
          }
          setEsiti((r) => [...r, { scenario, titolo, errore }]);
          break; // Non moltiplicare errori di autenticazione, rete o crediti su nove chiamate.
        }
        setEsiti((r) => [...r, { scenario, titolo, ...data }]);
      }
    } finally {
      setInCorso(false);
    }
  };
  return (
    <details className="shrink-0 border-b bg-slate-50 px-4 py-1 text-xs">
      <summary className="cursor-pointer text-muted-foreground">
        Simulazioni locali su dati di esempio
      </summary>
      <div className="flex items-center gap-3 py-2">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || inCorso}
          onClick={() => void esegui()}
        >
          {inCorso
            ? `Simulazione ${esiti.length + 1}/9…`
            : "Esegui 9 simulazioni AI"}
        </Button>
        <span>
          Chiamate AI reali con crediti dell’azienda. Nessuna fattura viene
          creata o verificata.
        </span>
      </div>
      {esiti.length > 0 && (
        <pre
          aria-label="Esiti simulazioni AI"
          className="max-h-52 overflow-auto whitespace-pre-wrap rounded border bg-white p-3 text-[11px]"
        >
          {JSON.stringify(
            { completate: esiti.length, inCorso, risultati: esiti },
            null,
            2,
          )}
        </pre>
      )}
    </details>
  );
}
