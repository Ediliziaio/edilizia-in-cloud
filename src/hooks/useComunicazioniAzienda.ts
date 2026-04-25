import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ComunicazioneRow {
  id: string;
  tipo: "email" | "sms" | "notifica_inapp";
  oggetto: string | null;
  corpo: string;
  inviato_da_nome: string | null;
  stato: "inviato" | "consegnato" | "fallito" | "in_coda";
  is_automatica: boolean;
  created_at: string;
}

export interface NuovaComunicazione {
  tipo: "email" | "sms" | "notifica_inapp";
  oggetto?: string;
  corpo: string;
  inviato_da_nome?: string;
}

/**
 * FIX SCHEMA: la tabella `superadmin_comunicazioni` non esiste nel DB
 * (errore PostgREST "Impossibile caricare le comunicazioni").
 *
 * Strategy: graceful degradation. La query intercetta l'errore "table not found"
 * e ritorna lista vuota invece di propagare. La UI mostra il banner standard
 * "nessuna comunicazione" e l'admin può comunque aprire il modal (la insert
 * fallirà esplicitamente, ma con messaggio comprensibile).
 *
 * Quando la tabella verrà creata via migration dedicata, il flow tornerà
 * funzionante senza modifiche a questo hook.
 */

// Codici errore Postgres che indicano "tabella non esiste"
const TABLE_MISSING_CODES = new Set(["42P01", "PGRST205"]);

function isTableMissingError(error: { code?: string; message?: string }): boolean {
  if (error.code && TABLE_MISSING_CODES.has(error.code)) return true;
  // PostgREST può rispondere con messaggi tipo "Could not find the table 'public.X'"
  return /could not find.*table|relation.*does not exist/i.test(error.message ?? "");
}

export function useComunicazioniAzienda(companyId: string | undefined) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["comunicazioni-azienda", companyId],
    queryFn: async (): Promise<ComunicazioneRow[]> => {
      if (!companyId) return [];
      // Cast `as never` per superare il check di types.ts che non conosce
      // questa tabella (non c'è ancora). Se la tabella esiste runtime
      // funziona, altrimenti intercettiamo l'errore.
      const result = await (supabase
        .from("superadmin_comunicazioni" as never)
        .select("id, tipo, oggetto, corpo, inviato_da_nome, stato, is_automatica, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(100) as unknown as Promise<{
        data: ComunicazioneRow[] | null;
        error: { code?: string; message?: string } | null;
      }>);

      if (result.error) {
        if (isTableMissingError(result.error)) {
          // Graceful: tabella non disponibile, ritorna empty senza propagare
          console.info(
            "[useComunicazioniAzienda] Tabella superadmin_comunicazioni non presente. " +
              "Storico vuoto. Crea la tabella per attivare il modulo.",
          );
          return [];
        }
        throw new Error("Impossibile caricare le comunicazioni: " + result.error.message);
      }
      return result.data ?? [];
    },
    enabled: !!companyId,
    // Retry minimo: se la tabella manca, retry non aiuta
    retry: 1,
  });

  const inviaComunicazione = useMutation({
    mutationFn: async (payload: NuovaComunicazione & { company_id: string }) => {
      const result = await (supabase
        .from("superadmin_comunicazioni" as never)
        .insert({
          company_id: payload.company_id,
          tipo: payload.tipo,
          oggetto: payload.oggetto ?? null,
          corpo: payload.corpo,
          inviato_da_nome: payload.inviato_da_nome ?? null,
          stato: "inviato",
          is_automatica: false,
        }) as unknown as Promise<{ error: { code?: string; message?: string } | null }>);

      if (result.error) {
        if (isTableMissingError(result.error)) {
          throw new Error(
            "Modulo comunicazioni non configurato: la tabella " +
              "`superadmin_comunicazioni` non è presente nel database. " +
              "Contatta il team backend per crearla.",
          );
        }
        throw new Error(result.error.message);
      }
    },
    onSuccess: () => {
      toast.success("Comunicazione registrata", {
        description: "Salvata nello storico azienda.",
      });
      queryClient.invalidateQueries({ queryKey: ["comunicazioni-azienda", companyId] });
      queryClient.invalidateQueries({ queryKey: ["company-detail", companyId] });
    },
    onError: (err: Error) => {
      toast.error("Errore comunicazione", { description: err.message });
    },
  });

  return {
    comunicazioni: data ?? [],
    isLoading,
    isError,
    inviaComunicazione,
    inviaComuinicazione: inviaComunicazione, // alias retrocompat (typo originale)
  };
}
