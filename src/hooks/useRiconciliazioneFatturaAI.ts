import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { documentiDb as db } from "@/lib/ddt/documentiPersistenti";
import type {
  ContestoRiconciliazione,
  DecisioneRiconciliazione,
  PropostaRiconciliazione,
} from "../../supabase/functions/_shared/riconciliazioneFattureAI.ts";
import type { EsitoRigaConfronto } from "@/lib/fatturazione/confrontoDocumenti";

export interface AnalisiFatturaAI {
  id: string;
  impronta: string;
  proposta: PropostaRiconciliazione;
  esiti: EsitoRigaConfronto[];
  decisioni: Record<string, DecisioneRiconciliazione>;
  revisione: number;
  rivista_il: string | null;
  created_at: string;
}
export function useUltimaSelezioneConfrontoAI(
  companyId: string,
  fatturaId: string,
) {
  return useQuery({
    queryKey: ["fattura-riconciliazione-ai-selezione", companyId, fatturaId],
    staleTime: 15_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await db
        .from("fattura_riconciliazioni_ai")
        .select("documenti")
        .eq("company_id", companyId)
        .eq("fattura_id", fatturaId)
        .order("created_at", { ascending: false })
        .order("id")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (
        (data?.documenti as { ddt: string[]; oda: string[] } | undefined) ??
        null
      );
    },
  });
}
export function useRiconciliazioneFatturaAI({
  companyId,
  fatturaId,
  documenti,
  revisioneDati,
}: {
  companyId: string;
  fatturaId: string;
  documenti: { ddt: string[]; oda: string[] };
  revisioneDati: string;
}) {
  const qc = useQueryClient();
  const key = ["fattura-riconciliazione-ai", companyId, fatturaId];
  const dati = useQuery({
    queryKey: [...key, documenti, revisioneDati],
    enabled: !!companyId && documenti.ddt.length + documenti.oda.length > 0,
    retry: false,
    staleTime: 15_000,
    queryFn: async () => {
      const { data: raw, error } = await db.rpc(
        "fattura_riconciliazione_contesto",
        { p_fattura: fatturaId, p_documenti: documenti },
      );
      if (error) throw error;
      const context = raw as {
        contesto: ContestoRiconciliazione;
        impronta: string;
        puo_modificare: boolean;
      };
      const { data, error: erroreAnalisi } = await db
        .from("fattura_riconciliazioni_ai")
        .select(
          "id,impronta,proposta,esiti,decisioni,revisione,rivista_il,created_at",
        )
        .eq("company_id", companyId)
        .eq("fattura_id", fatturaId)
        .eq("impronta", context.impronta)
        .maybeSingle();
      if (erroreAnalisi) throw erroreAnalisi;
      let superata = false;
      if (!data) {
        const { data: precedenti, error: errorePrecedenti } = await db
          .from("fattura_riconciliazioni_ai")
          .select("id")
          .eq("company_id", companyId)
          .eq("fattura_id", fatturaId)
          .limit(1);
        if (errorePrecedenti) throw errorePrecedenti;
        superata = !!precedenti?.length;
      }
      return { ...context, analisi: data as AnalisiFatturaAI | null, superata };
    },
  });
  const analizza = useMutation({
    retry: false,
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "riconcilia-fattura-ai",
        {
          body: {
            fattura_id: fatturaId,
            documenti,
            richiesta_id: crypto.randomUUID(),
          },
        },
      );
      if (error) {
        let message = error.message;
        try {
          message = (await error.context?.json())?.error ?? message;
        } catch {
          /* rete senza risposta JSON */
        }
        throw new Error(message);
      }
      if (data?.error || !data?.analisi?.id)
        throw new Error(
          data?.error ??
            "Analisi non ricevuta. Nessuna verifica è stata modificata.",
        );
      return data.analisi as AnalisiFatturaAI;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: key }),
        qc.invalidateQueries({
          queryKey: [
            "fattura-riconciliazione-ai-selezione",
            companyId,
            fatturaId,
          ],
        }),
      ]);
    },
  });
  const salva = useMutation({
    retry: false,
    mutationFn: async ({
      analisi,
      decisioni,
    }: {
      analisi: AnalisiFatturaAI;
      decisioni: Record<string, DecisioneRiconciliazione>;
    }) => {
      const { data, error } = await db.rpc("fattura_riconciliazione_salva", {
        p_analisi: analisi.id,
        p_revisione: analisi.revisione,
        p_decisioni: decisioni,
      });
      if (error) throw error;
      if (!data || (data as AnalisiFatturaAI).id !== analisi.id)
        throw new Error("La revisione non risulta salvata.");
      return data as AnalisiFatturaAI;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  return { dati, analizza, salva };
}
