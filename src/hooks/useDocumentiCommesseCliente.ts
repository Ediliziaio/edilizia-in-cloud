/**
 * File di tutte le commesse di un cliente (order_attachments), letti col
 * client normale: la RLS decide cosa l'utente può vedere, come nella commessa.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { aBlocchi, type DocumentoCommessaRiga } from "@/lib/clienti/documentiCommesseCliente";

// «*» come in OrderAttachments: folder_id e thumb_path sono colonne recenti,
// fuori dai tipi generati; con l'elenco esplicito una colonna mancante farebbe
// fallire tutta la lettura.
export function useDocumentiCommesseCliente(customerId: string, orderIds: string[]) {
  const ids = Array.from(new Set(orderIds)).sort();
  return useQuery({
    queryKey: ["documenti-commesse-cliente", customerId, ids.join(",")],
    enabled: !!customerId && ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<DocumentoCommessaRiga[]> => {
      const risultati = await Promise.all(
        aBlocchi(ids, 100).map((blocco) =>
          supabase
            .from("order_attachments")
            .select("*")
            .in("order_id", blocco)
            .order("created_at", { ascending: false }),
        ),
      );
      const errore = risultati.find((r) => r.error)?.error;
      if (errore) throw new Error("Impossibile caricare i documenti delle commesse del cliente.");
      return risultati.flatMap((r) => (r.data ?? []) as unknown as DocumentoCommessaRiga[]);
    },
  });
}
