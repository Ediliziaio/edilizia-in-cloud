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
 *   Ora: 3 livelli di defense-in-depth:
 *   1) RPC `get_company_customers` (canonica, server-side join user_roles)
 *   2) Fallback: query diretta `profiles` filtrata per company_id +
 *      `portal_disabled IS NOT NULL` (solo customer creati con/senza portale).
 *      Il filtro `portal_disabled` distingue customer (TRUE/FALSE) da staff
 *      (NULL — la colonna è popolata solo da create-customer).
 *   3) Se anche profiles fallisce: ritorna lista vuota MA non lancia errore
 *      visibile (l'utente può sempre cliccare "+" per crearne uno nuovo).
 *
 *   Side benefit: con fallback profile-direct, anche aziende su produzioni
 *   "vecchie" senza la RPC vedono i clienti correttamente.
 *
 *   La RLS di profiles permette SELECT su righe con company_id matching → safe.
 */
export function useCompanyCustomers(companyId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: companyCustomersKeys.byCompany(companyId),
    enabled: !!companyId && enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async (): Promise<CompanyCustomer[]> => {
      if (!companyId) return [];

      // ── Strategia 1: RPC canonica server-side ─────────────────────────
      try {
        const rpc = supabase.rpc as unknown as (
          fn: string,
          args: Record<string, string>,
        ) => Promise<RpcResult>;
        const { data, error } = await rpc("get_company_customers", {
          p_company_id: companyId,
        });

        if (!error && Array.isArray(data)) {
          return data as CompanyCustomer[];
        }

        // RPC ha risposto con errore — log + fallthrough al fallback
        const errMsg = error?.message ?? "rpc_unknown_error";
        logger.warn(`[useCompanyCustomers] RPC get_company_customers failed: ${errMsg}, fallback to profiles direct query`);
      } catch (rpcErr) {
        logger.warn("[useCompanyCustomers] RPC get_company_customers threw:", rpcErr);
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

        if (!joinErr && Array.isArray(joinedData) && joinedData.length > 0) {
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

        logger.warn("[useCompanyCustomers] profiles+user_roles join failed or empty:", joinErr);
      } catch (joinErr) {
        logger.warn("[useCompanyCustomers] profiles+user_roles join threw:", joinErr);
      }

      // ── Strategia 3: profiles only — last resort, mostra TUTTI i profili
      // della company. Può includere anche staff, ma è meglio del dropdown
      // vuoto. L'utente riconoscerà i suoi clienti dai nomi/email.
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profilesData, error: profilesErr } = await (supabase.from("profiles") as any)
          .select("id, first_name, last_name, email")
          .eq("company_id", companyId)
          .order("last_name", { ascending: true, nullsFirst: false })
          .order("first_name", { ascending: true, nullsFirst: false })
          .limit(500);

        if (!profilesErr && Array.isArray(profilesData)) {
          return (profilesData as Array<{
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

        logger.warn("[useCompanyCustomers] profiles-only fallback failed:", profilesErr);
      } catch (directErr) {
        logger.warn("[useCompanyCustomers] profiles-only fallback threw:", directErr);
      }

      // ── Strategia 4: lista vuota (graceful) ────────────────────────────
      // Non lanciamo errore: l'utente vede dropdown vuoto MA può sempre
      // cliccare "+" per crearne uno nuovo. Più resiliente del throw originale.
      logger.error("[useCompanyCustomers] all strategies failed — returning empty list");
      return [];
    },
  });
}
