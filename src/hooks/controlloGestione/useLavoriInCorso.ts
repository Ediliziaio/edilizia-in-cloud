/**
 * I lavori in corso su ordinazione.
 *
 * Il lavoro eseguito e non ancora fatturato. Per un'impresa edile non è un
 * dettaglio: i costi del cantiere sono già nel conto economico, il ricavo
 * arriva quando si fattura. Senza questa voce il margine di chi cresce è
 * sistematicamente più basso del vero.
 *
 * Due cose che questo numero NON fa, e che la pagina deve dire:
 * - copre solo le commesse con un avanzamento. Le altre non valgono «zero
 *   lavoro in corso»: valgono «non lo sappiamo», e si contano a parte;
 * - entra nel conto economico solo se è registrata la rimanenza dell'anno
 *   prima. L'avanzamento è un dato di oggi: la rimanenza al 1° gennaio non si
 *   può ricostruire, e darla per zero gonfierebbe il margine di tutto il
 *   lavoro cominciato prima.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { cgRpc } from "@/hooks/controlloGestione/cgRpc";

export interface LavoriInCorso {
  anno: number;
  commesse_misurate: number;
  maturato: number;
  fatturato: number;
  lavori_in_corso: number;
  anticipi: number;
  commesse_senza_avanzamento: number;
  valore_senza_avanzamento: number;
  /** Rimanenza registrata per quest'anno, se c'è. */
  rimanenza_registrata: number | null;
  /** Rimanenza al 31/12 dell'anno prima: senza, la voce 02 resta a zero. */
  rimanenza_iniziale: number | null;
  variazione_nel_ce: number;
}

export function useLavoriInCorso(anno: number) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["cg", "lavori-in-corso", anno, companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<LavoriInCorso | null> => {
      const { data, error } = await cgRpc<LavoriInCorso>("cg_lavori_in_corso", { p_anno: anno });
      // È una lettura in più su una pagina già piena: se non c'è, tace.
      if (error) return null;
      return data ?? null;
    },
    staleTime: 5 * 60_000,
  });
}

export function useRegistraRimanenza() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { esercizio: number; importo?: number | null; note?: string }) => {
      const { data, error } = await cgRpc<{ esercizio: number; importo: number; fonte: string }>(
        "cg_registra_rimanenza_lavori",
        {
          p_esercizio: input.esercizio,
          p_importo: input.importo ?? null,
          p_note: input.note ?? null,
        },
      );
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Rimanenza al 31/12/${data?.esercizio} registrata`);
      // Cambia il conto economico, il patrimoniale e tutti gli indici.
      qc.invalidateQueries({ queryKey: ["cg"] });
    },
    onError: (err) => toast.error(`Non è stato possibile registrarla: ${(err as Error).message}`),
  });
}
