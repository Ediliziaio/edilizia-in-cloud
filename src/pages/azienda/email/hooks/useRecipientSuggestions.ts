import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RecipientSource =
  | "contact_client"
  | "contact_supplier"
  | "contact"
  | "contact_billing"
  | "inbox_history"
  | "outbox_history";

export interface RecipientSuggestion {
  email: string;
  display_name: string | null;
  source: RecipientSource;
  source_label: string;
  last_used_at: string | null;
  hit_count: number;
}

interface UseRecipientSuggestionsOptions {
  /** Stringa parziale dell'ultimo token che l'utente sta digitando. */
  query: string;
  /** Company corrente — passata esplicitamente per evitare cross-tenant leak. */
  companyId: string | null | undefined;
  /** Email già aggiunte al campo, da escludere dai suggerimenti. */
  excludeEmails?: string[];
  /** Numero massimo di suggerimenti. Default 8. */
  limit?: number;
  /** Forza disabilitato (es. autocomplete chiuso). Default false. */
  disabled?: boolean;
}

/**
 * Suggerimenti destinatari per il composer email.
 *
 * Cerca in 3 fonti via RPC `email_search_recipients`:
 *  1. Anagrafiche native (clienti/fornitori della company)
 *  2. Storico inbox (mittenti delle email ricevute dall'utente)
 *  3. Storico outbox (destinatari delle email già inviate dall'utente)
 *
 * Debounce 200ms lato client per non bombardare Postgres mentre si digita.
 * Cache 30s per query identica.
 */
export function useRecipientSuggestions({
  query,
  companyId,
  excludeEmails = [],
  limit = 8,
  disabled = false,
}: UseRecipientSuggestionsOptions): {
  suggestions: RecipientSuggestion[];
  isLoading: boolean;
} {
  // Debounce lato hook: trasforma `query` in `debouncedQuery` dopo 200ms.
  const [debouncedQuery, setDebouncedQuery] = useState(query.trim());
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => clearTimeout(handle);
  }, [query]);

  const enabled = !disabled && !!companyId && debouncedQuery.length >= 2;
  const exclude = excludeEmails.map((e) => e.toLowerCase());

  const { data, isLoading } = useQuery({
    queryKey: ["email-recipient-suggestions", companyId, debouncedQuery, limit],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("email_search_recipients", {
        p_query: debouncedQuery,
        p_company_id: companyId,
        p_limit: Math.min(limit + exclude.length + 2, 25), // chiediamo qualcuno in più per coprire le esclusioni
      });
      if (error) throw error;
      return (data ?? []) as RecipientSuggestion[];
    },
  });

  const filtered = (data ?? [])
    .filter((row) => !exclude.includes(row.email.toLowerCase()))
    .slice(0, limit);

  return { suggestions: filtered, isLoading };
}
