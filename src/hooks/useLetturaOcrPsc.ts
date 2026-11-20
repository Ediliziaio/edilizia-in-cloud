import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chiamaServerPos } from "@/hooks/usePos";
import type { RiferimentoPsc } from "../../supabase/functions/_shared/posPsc";
import type { RiepilogoOcrPsc } from "../../supabase/functions/_shared/posOcrStato";

export function useLetturaOcrPsc(companyId: string, posId: string, fonte: RiferimentoPsc) {
  const client = useQueryClient();
  const queryKey = ["pos-ocr-psc", companyId, posId, fonte.id, fonte.sha256, fonte.revisione];
  const richiesta = async (azione: "stato_ocr_psc" | "avvia_ocr_psc" | "riprova_ocr_psc") => {
    const { lettura } = await chiamaServerPos<{ lettura: RiepilogoOcrPsc | null }>({
      azione, company_id: companyId, pos_id: posId, documento_id: fonte.id, sha256: fonte.sha256, revisione: fonte.revisione,
    });
    return lettura;
  };
  const stato = useQuery({
    queryKey, queryFn: () => richiesta("stato_ocr_psc"), retry: 1,
    refetchInterval: q => q.state.data?.stato === "in_coda" || q.state.data?.stato === "in_lettura" ? 2500 : false,
    refetchOnWindowFocus: true,
  });
  const avvia = useMutation({
    mutationFn: async ({ riprova, salva }: { riprova: boolean; salva?: () => Promise<boolean> }) => {
      if (salva && !await salva()) throw new Error("Salva la bozza prima di leggere il PSC.");
      return richiesta(riprova ? "riprova_ocr_psc" : "avvia_ocr_psc");
    },
    onSuccess: async lettura => {
      await client.cancelQueries({ queryKey });
      client.setQueryData(queryKey, lettura);
      void client.invalidateQueries({ queryKey });
    },
  });
  return { stato, avvia };
}

export function usePaginaOcrPsc(companyId: string, posId: string, fonte: RiferimentoPsc, pagina: number, inCorso: boolean) {
  return useQuery({
    queryKey: ["pos-ocr-pagina", companyId, posId, fonte.id, fonte.sha256, fonte.revisione, pagina],
    refetchInterval: inCorso ? 4000 : false,
    queryFn: async () => {
      const r = await chiamaServerPos<{ pagina: { testo: string; metodo: "native" | "ocr" | "blank" | "unreadable" | "riprova" } | null }>({
        azione: "stato_ocr_psc", company_id: companyId, pos_id: posId, documento_id: fonte.id,
        sha256: fonte.sha256, revisione: fonte.revisione, pagina,
      });
      return r.pagina;
    },
  });
}
