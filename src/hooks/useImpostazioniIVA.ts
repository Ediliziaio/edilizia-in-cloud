import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";

/** Una riga di `fiscalita_impostazioni_iva`: le scelte IVA dell'azienda per un anno. */
export interface ImpostazioniIVA {
  periodicita: "mensile" | "trimestrale" | "trimestrale_speciale";
  regime: "ordinario" | "forfettario" | "altro";
  iva_per_cassa: boolean;
  pro_rata_percentuale: number | null;
  attivita_separate: boolean;
  credito_anno_precedente: number;
  metodo_acconto: "storico" | "previsionale" | "analitico";
  cf_contribuente: string | null;
  cf_dichiarante: string | null;
  codice_carica: string | null;
  cf_intermediario: string | null;
  note: string | null;
}

export interface ImpostazioniIVASalvate extends ImpostazioniIVA {
  aggiornato_il: string;
}

const COLONNE =
  "periodicita,regime,iva_per_cassa,pro_rata_percentuale,attivita_separate,credito_anno_precedente,metodo_acconto,cf_contribuente,cf_dichiarante,codice_carica,cf_intermediario,note,aggiornato_il";

/** Cosa manca perché le impostazioni bastino alla liquidazione e alla LIPE. */
export function impostazioniMancanti(i: ImpostazioniIVA | null | undefined): string[] {
  if (!i) return ["Impostazioni IVA dell'anno non compilate"];
  const out: string[] = [];
  if (!i.cf_contribuente) out.push("Codice fiscale del contribuente (frontespizio LIPE)");
  if (!i.cf_dichiarante) out.push("Codice fiscale di chi firma la comunicazione");
  if (!i.codice_carica) out.push("Codice carica del dichiarante");
  return out;
}

export function useImpostazioniIVA(anno: number) {
  const company = useEffectiveCompanyId();
  const qc = useQueryClient();
  const permessi = usePermissions();
  const puoModificare = permessi.isAdmin && !permessi.solaLettura && !permessi.isLoading;
  const key = ["fiscal-impostazioni-iva", company, anno];

  const query = useQuery({
    queryKey: key,
    enabled: !!company,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("fiscalita_impostazioni_iva" as never)
        .select(COLONNE)
        .eq("company_id", company!)
        .eq("anno", anno)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      return (data as ImpostazioniIVASalvate | null) ?? null;
    },
  });

  const salva = useMutation({
    mutationFn: async (valori: ImpostazioniIVA) => {
      if (!company || !puoModificare) throw Error("Modifica non autorizzata");
      const { error } = await supabase
        .from("fiscalita_impostazioni_iva" as never)
        .upsert({ company_id: company, anno, ...valori } as never, {
          onConflict: "company_id,anno",
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Impostazioni IVA ${anno} salvate`);
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) =>
      toast.error(
        e instanceof Error && /check|violates/i.test(e.message)
          ? "Un valore non è valido: controlla codici fiscali e percentuali."
          : "Impostazioni non salvate. Riprova.",
      ),
  });

  return {
    impostazioni: query.data,
    isLoading: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
    salva: salva.mutateAsync,
    isSalvando: salva.isPending,
    puoModificare,
  };
}
