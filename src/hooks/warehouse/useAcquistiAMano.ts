/**
 * La lista della spesa del magazzino, dal database (`acquisti_a_mano`).
 *
 * Stessa forma di prima per il modulo: un elenco e un `setVoci(prossimo)` che
 * accetta anche una funzione. Ogni cambio si confronta col precedente e si
 * scrive solo quello che è cambiato; la lista si aggiorna subito e, se il
 * database rifiuta, torna a quella vera con un avviso.
 *
 * Una voce ordinata diventa un costo con le sue rate (trigger
 * `acquisto_a_mano_allinea_costo`): dopo ogni scrittura si ricaricano Costi,
 * previsionale e RiBa, che leggono quelle righe.
 *
 * Alla prima apertura le voci rimaste nel browser dalla vecchia lista
 * (`warehouse-purchase-list:<azienda>`) entrano nella tabella e il browser le
 * dimentica. Solo per chi può scrivere: chi legge e basta non le perde, le
 * ritrova quando le porta dentro chi può.
 */
import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import {
  aRiga,
  daRiga,
  differenze,
  vociDalBrowser,
  type ManualPurchaseItem,
  type RigaAcquistoAMano,
} from "@/lib/magazzino/acquistiAMano";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const chiaveBrowser = (companyId: string) => `warehouse-purchase-list:${companyId}`;

export function useAcquistiAMano(companyId: string, readOnly: boolean) {
  const qc = useQueryClient();
  const queryKey = ["acquisti-a-mano", companyId];

  const { data: voci = [], isLoading } = useQuery({
    queryKey,
    enabled: !!companyId,
    queryFn: async (): Promise<ManualPurchaseItem[]> => {
      const { data, error } = await db
        .from("acquisti_a_mano")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as RigaAcquistoAMano[]).map(daRiga);
    },
  });

  const scrivi = useCallback(
    async (prima: ManualPurchaseItem[], dopo: ManualPurchaseItem[]) => {
      const { aggiunte, cambiate, tolte } = differenze(prima, dopo);
      const operazioni: Promise<{ error: unknown }>[] = [];
      if (aggiunte.length) operazioni.push(db.from("acquisti_a_mano").insert(aggiunte.map((v) => aRiga(v, companyId))));
      for (const v of cambiate) {
        const { id: _id, company_id: _azienda, ...campi } = aRiga(v, companyId);
        operazioni.push(db.from("acquisti_a_mano").update(campi).eq("id", v.id).eq("company_id", companyId));
      }
      if (tolte.length) operazioni.push(db.from("acquisti_a_mano").delete().in("id", tolte).eq("company_id", companyId));
      const esiti = await Promise.all(operazioni);
      const errore = esiti.find((e) => e.error)?.error as { message?: string } | undefined;
      if (errore) {
        toast.error("Lista acquisti non salvata", { description: errore.message });
        await qc.invalidateQueries({ queryKey: ["acquisti-a-mano", companyId] });
        return;
      }
      if (operazioni.length > 0) {
        void qc.invalidateQueries({ queryKey: queryKeys.costs.all });
        void qc.invalidateQueries({ queryKey: ["cashflow", "ledger", companyId] });
        void qc.invalidateQueries({ queryKey: ["riba-fornitori", companyId] });
        // Il trigger può aver scritto il collegamento al costo: la lista lo rilegge.
        void qc.invalidateQueries({ queryKey: ["acquisti-a-mano", companyId] });
      }
    },
    [companyId, qc],
  );

  const setVoci = useCallback(
    (prossimo: ManualPurchaseItem[] | ((attuali: ManualPurchaseItem[]) => ManualPurchaseItem[])) => {
      if (readOnly || !companyId) return;
      const prima = qc.getQueryData<ManualPurchaseItem[]>(["acquisti-a-mano", companyId]) ?? [];
      const dopo = typeof prossimo === "function" ? prossimo(prima) : prossimo;
      qc.setQueryData(["acquisti-a-mano", companyId], dopo);
      void scrivi(prima, dopo);
    },
    [companyId, qc, readOnly, scrivi],
  );

  // Le voci della vecchia lista nel browser: una volta sola, poi si dimenticano.
  const importate = useRef(false);
  useEffect(() => {
    if (readOnly || !companyId || isLoading || importate.current) return;
    importate.current = true;
    let grezzo: string | null;
    try {
      grezzo = window.localStorage.getItem(chiaveBrowser(companyId));
    } catch {
      return;
    }
    const dalBrowser = vociDalBrowser(grezzo, () => globalThis.crypto.randomUUID());
    if (dalBrowser.length === 0) {
      if (grezzo !== null) {
        try { window.localStorage.removeItem(chiaveBrowser(companyId)); } catch { /* niente da fare */ }
      }
      return;
    }
    const giaCi = new Set(voci.map((v) => v.id));
    const daPortare = dalBrowser.filter((v) => !giaCi.has(v.id));
    void (async () => {
      if (daPortare.length > 0) {
        const { error } = await db.from("acquisti_a_mano").insert(daPortare.map((v) => aRiga(v, companyId)));
        if (error) {
          // Il browser le tiene: si riprova alla prossima apertura.
          toast.error("Voci della vecchia lista acquisti non trasferite", { description: error.message });
          return;
        }
        toast.success(
          daPortare.length === 1
            ? "1 voce della lista acquisti salvata nel gestionale"
            : `${daPortare.length} voci della lista acquisti salvate nel gestionale`,
          { description: "Prima stavano solo in questo browser: ora le vedono tutti." },
        );
        await qc.invalidateQueries({ queryKey: ["acquisti-a-mano", companyId] });
      }
      try { window.localStorage.removeItem(chiaveBrowser(companyId)); } catch { /* niente da fare */ }
    })();
  }, [companyId, isLoading, qc, readOnly, voci]);

  return { voci, setVoci, isLoading };
}
