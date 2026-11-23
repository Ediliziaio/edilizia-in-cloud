import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { allineaFattureInCloud } from "@/hooks/usePrimaNota";
import { quotePerServer, type Quota } from "@/lib/primaNota/quoteMovimento";

export interface TestataDivisa {
  direction: "entrata" | "uscita";
  data: string;
  importo: number;
  descrizione: string;
  metodo?: string;
  riferimento?: string;
  account_label?: string;
  bank_account_id?: string | null;
  conto_liquidita_id?: string | null;
  note?: string;
  attachment_url?: string;
  attachment_name?: string;
}

/**
 * Registra un movimento diviso in quote: tutto o niente, nel database (prima_nota_registra_divisa).
 * Dopo, le fatture importate da Fatture in Cloud si allineano una per una, come fa l'incasso singolo.
 */
export function useRegistraDivisa(companyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ testata, quote, transazione }: { testata: TestataDivisa; quote: Quota[]; transazione?: string }) => {
      // Dal movimento di banca le quote nascono già collegate al movimento (banca_registra_divisa).
      const { data, error } = transazione
        ? await supabase.rpc("banca_registra_divisa" as never, {
          p_company: companyId, p_tx: transazione, p_testata: testata, p_quote: quotePerServer(quote),
        } as never)
        : await supabase.rpc("prima_nota_registra_divisa" as never, {
          p_company: companyId, p_testata: testata, p_quote: quotePerServer(quote),
        } as never);
      if (error) throw error;
      const daAllineare = quote.flatMap(q => (q.tipo === "invoice" ? [q] : []));
      const esiti = await Promise.all(daAllineare.map(q => allineaFattureInCloud(
        q.documento.id, Number(q.importo), testata.data).catch(() => "non_allineata" as const)));
      return { gruppo: (data as { gruppo_id: string } | null)?.gruppo_id, quote: quote.length, nonAllineate: esiti.filter(e => e === "non_allineata").length };
    },
    onSuccess: r => {
      toast.success(`Movimento registrato in ${r.quote} ${r.quote === 1 ? "quota" : "quote"}`,
        r.nonAllineate ? { description: `${r.nonAllineate} fatture di Fatture in Cloud vanno segnate anche lì.` } : undefined);
      refreshFinancialQueries(queryClient);
      for (const k of [queryKeys.primaNota.all, queryKeys.invoices.all, queryKeys.scadenzario.all, queryKeys.cashflow.summary(companyId), queryKeys.cashflow.scadenze(companyId)]) {
        void queryClient.invalidateQueries({ queryKey: k });
      }
      void queryClient.invalidateQueries({ queryKey: ["prima-nota-documenti-aperti", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["prima-nota-dipendenti", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["bank-candidati"] });
      void queryClient.invalidateQueries({ queryKey: ["bank-workspace"] });
      void queryClient.invalidateQueries({ queryKey: ["fatture-ricevute"] });
      void queryClient.invalidateQueries({ queryKey: ["fatture-ricevute-pagamento"] });
    },
    onError: (e: Error) => toast.error("Movimento non registrato", { description: e.message, duration: 12000 }),
  });
}
