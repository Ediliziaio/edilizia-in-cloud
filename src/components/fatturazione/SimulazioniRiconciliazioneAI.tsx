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
  const [progresso, setProgresso] = useState("");
  const esegui = async (lunga = false) => {
    setInCorso(true);
    setEsiti([]);
    try {
      const scenari = lunga
        ? [["fattura-lunga", "Fattura di 90 voci in tre lotti"]]
        : SCENARI_RICONCILIAZIONE;
      for (const [scenario, titolo] of scenari) {
        const richiestaId = crypto.randomUUID();
        const leggi = () =>
          supabase.functions.invoke("riconcilia-fattura-ai", {
            body: {
              fattura_id: fatturaId,
              documenti,
              simulazione: scenario,
              richiesta_id: richiestaId,
            },
          });
        let { data, error } = await leggi();
        for (
          let passo = 0;
          passo < 100 && !error && data?.avanzamento;
          passo++
        ) {
          setProgresso(
            `${titolo}: ${data.avanzamento.completati}/${data.avanzamento.totale} lotti`,
          );
          if (data.avanzamento.attendi)
            await new Promise((r) => setTimeout(r, 1200));
          ({ data, error } = await leggi());
        }
        if (error || data?.error || !data?.proposta) {
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
      setProgresso("");
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
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || inCorso}
          onClick={() => void esegui(true)}
        >
          Prova 90 voci
        </Button>
        <span role="status">{progresso}</span>
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
