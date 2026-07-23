import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

export interface CompanyCustomer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
}

type RpcResult = {
  data: unknown;
  error: { message?: string; code?: string } | null;
};

export const companyCustomersKeys = {
  byCompany: (companyId: string | null | undefined) =>
    ["company-customers", companyId] as const,
};

/**
 * Lista clienti aziendali risolta lato database.
 *
 * 🛠️ v2 (2026-05-10): bug fix "non vedo i clienti nella creazione commessa"
 *
 *   Prima: chiamavamo SOLO la RPC `get_company_customers`. Se la migration
 *   `20261229002000_company_people_directory.sql` non era applicata su remote
 *   (caso reale di alcune produzioni), la query falliva e il dropdown restava
 *   vuoto senza fallback → impossibile selezionare clienti esistenti, nemmeno
 *   creare nuovi (perché il newly-created non appariva subito).
 *
 *   Ora: SOLO strategie che filtrano DAVVERO per ruolo 'customer' —
 *   1) RPC `get_company_customers` (canonica, SECURITY DEFINER, role='customer')
 *   2) Fallback: `profiles` + `user_roles!inner(role='customer')` (quando la RLS
 *      permette la join). Ritorna anche VUOTO: "0 clienti" è una risposta valida.
 *   3) Se tutto fallisce: lista vuota (l'utente crea col pulsante "+").
 *
 *   ⚠️ 2026-07-16 (bug "vedo operai/dipendenti come clienti nella Nuova Commessa"):
 *   RIMOSSA la vecchia strategia "profiles-only senza filtro ruolo", che dumpava
 *   TUTTI i profili dell'azienda → staff/operai/collaboratori comparivano come
 *   clienti. Non esiste una colonna su `profiles` che distingua cliente da staff
 *   (portal_disabled=false anche per lo staff), quindi il filtro ruolo DEVE
 *   passare da RPC / user_roles. Meglio picker vuoto (+ crea) che dati sbagliati.
 */
export function useCompanyCustomers(companyId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: companyCustomersKeys.byCompany(companyId),
    enabled: !!companyId && enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async (): Promise<CompanyCustomer[]> => {
      if (!companyId) return [];

      // ── Strategia 1: RPC canonica server-side (con 1 retry) ───────────
      // Retry perché dopo una migration la cache schema di PostgREST può essere
      // momentaneamente stantia su una delle istanze (PGRST202) → un secondo
      // tentativo colpisce spesso un'istanza già ricaricata.
      let rpcErrMsg = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const rpc = supabase.rpc as unknown as (
            fn: string,
            args: Record<string, string>,
          ) => Promise<RpcResult>;
          const { data, error } = await rpc("get_company_customers", {
            p_company_id: companyId,
          });

          if (!error && Array.isArray(data)) {
            // eslint-disable-next-line no-console
            console.info(`[EIC picker] clienti azienda ${companyId}: ${data.length} (via RPC)`);
            return data as CompanyCustomer[];
          }
          rpcErrMsg = error?.message ?? "rpc_unknown_error";
          logger.warn(`[useCompanyCustomers] RPC get_company_customers failed (tentativo ${attempt + 1}): ${rpcErrMsg}`);
        } catch (rpcErr) {
          rpcErrMsg = rpcErr instanceof Error ? rpcErr.message : String(rpcErr);
          logger.warn(`[useCompanyCustomers] RPC get_company_customers threw (tentativo ${attempt + 1}):`, rpcErr);
        }
      }

      // ── Strategia 2: profiles + user_roles join (se RLS permette) ──────
      // Tentativo con join esplicito su user_roles. Funziona quando il
      // chiamante ha permesso di leggere user_roles (tipicamente
      // company_admin per la propria company).
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: joinedData, error: joinErr } = await (supabase.from("profiles") as any)
          .select("id, first_name, last_name, email, user_roles!inner(role)")
          .eq("company_id", companyId)
          .eq("user_roles.role", "customer")
          .order("last_name", { ascending: true, nullsFirst: false })
          .order("first_name", { ascending: true, nullsFirst: false })
          .limit(500);

        // Ritorna il risultato role-filtered ANCHE se VUOTO: "0 clienti" è una
        // risposta valida. NON si deve mai ricadere su un dump di tutti i profili
        // (mostrerebbe operai/dipendenti/collaboratori come "clienti" — bug reale
        // nella Nuova Commessa: es. commessa intestata a un dipendente).
        if (!joinErr && Array.isArray(joinedData)) {
          // eslint-disable-next-line no-console
          console.info(`[EIC picker] clienti azienda ${companyId}: ${joinedData.length} (via fallback profiles+user_roles). RPC aveva fallito: ${rpcErrMsg || "n/d"}`);
          return (joinedData as Array<{
            id: string;
            first_name: string | null;
            last_name: string | null;
            email: string | null;
          }>).map((p) => ({
            id: p.id,
            first_name: p.first_name,
            last_name: p.last_name,
            email: p.email,
          }));
        }

        logger.warn("[useCompanyCustomers] profiles+user_roles join failed:", joinErr);
      } catch (joinErr) {
        logger.warn("[useCompanyCustomers] profiles+user_roles join threw:", joinErr);
      }

      // ── Strategia 3: lista vuota (graceful) ────────────────────────────
      // Non lanciamo errore: l'utente vede dropdown vuoto MA può sempre
      // cliccare "+" per crearne uno nuovo. Più resiliente del throw originale.
      // eslint-disable-next-line no-console
      console.warn(`[EIC picker] NESSUN cliente mostrato per azienda ${companyId}. Sia la RPC sia il fallback hanno fallito. Ultimo errore RPC: ${rpcErrMsg || "n/d"}`);
      return [];
    },
  });
}
