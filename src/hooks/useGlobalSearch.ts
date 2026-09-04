import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "./useDebounce";
import { queryKeys } from "@/lib/queryKeys";

export interface SearchResult {
  id: string;
  type: "order" | "customer" | "contact" | "ticket" | "quote";
  title: string;
  subtitle: string;
  url: string;
  icon: string;
}

export function useGlobalSearch(query: string, companyId: string | undefined) {
  const debouncedQuery = useDebounce(query, 250);

  return useQuery<SearchResult[]>({
    queryKey: queryKeys.globalSearch.results(companyId, debouncedQuery),
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return [];

      // `%` e `_` sono jolly in un ilike: chi cerca "50%" cerca "50%".
      const pattern = `%${debouncedQuery.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

      // Tutte in parallelo. Una che fallisce (permesso, tabella non leggibile)
      // non deve azzerare la ricerca: si mostra quello che si è trovato.
      const [ordersRes, customersRes, contactsRes, ticketsRes, quotesRes] = await Promise.all([
        (supabase
          .from("orders")
          .select("id, order_code, description")
          .eq("company_id", companyId!) as any)
          .or(`order_code.ilike.${pattern},description.ilike.${pattern}`)
          .limit(5),
        // `profiles` NON ha una colonna `role_type`: il filtro che c'era qui
        // faceva fallire la query con 400, quindi la ricerca globale non ha mai
        // trovato un cliente — e i clienti sono la cosa che si cerca di più.
        // Il ruolo si filtra dopo, su `user_roles`, come fa useCompanyCustomers.
        (supabase
          .from("profiles")
          .select("id, first_name, last_name, business_name, email, phone")
          .eq("company_id", companyId!) as any)
          .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},business_name.ilike.${pattern},email.ilike.${pattern}`)
          .limit(15),
        (supabase
          .from("marketing_contacts")
          .select("id, first_name, last_name, email, phone")
          .eq("company_id", companyId!) as any)
          .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`)
          .limit(5),
        (supabase
          .from("tickets")
          .select("id, subject, status")
          .eq("company_id", companyId!) as any)
          .ilike("subject", pattern)
          .limit(5),
        // I preventivi mancavano del tutto: si cercano per numero, titolo o
        // cliente, che è esattamente come li si nomina al telefono.
        (supabase
          .from("quotes")
          .select("id, quote_number, title, client_name")
          .eq("company_id", companyId!) as any)
          .or(`quote_number.ilike.${pattern},title.ilike.${pattern},client_name.ilike.${pattern}`)
          .limit(5),
      ]);

      // Fra i profili trovati teniamo solo i clienti veri: senza questo passo
      // uscirebbero anche operai e staff, che qui non c'entrano.
      const profiliTrovati = (customersRes.data ?? []) as Array<{ id: string }>;
      let idClienti = new Set<string>();
      if (profiliTrovati.length > 0) {
        const { data: ruoli } = await (supabase
          .from("user_roles")
          .select("user_id") as any)
          .eq("role", "customer")
          .in("user_id", profiliTrovati.map((p) => p.id));
        idClienti = new Set(((ruoli ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
      }

      const results: SearchResult[] = [];

      for (const o of ordersRes.data ?? []) {
        results.push({
          id: o.id,
          type: "order",
          title: o.order_code || "Ordine",
          subtitle: o.description ?? "",
          url: `/azienda/ordini/${o.id}`,
          icon: "Package",
        });
      }

      for (const c of (customersRes.data ?? []) as Array<Record<string, string | null>>) {
        if (!idClienti.has(c.id as string)) continue;
        const nome = (c.business_name ?? "").trim() || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
        results.push({
          id: c.id as string,
          type: "customer",
          title: nome || c.email || "Cliente",
          subtitle: c.email ?? c.phone ?? "",
          url: `/azienda/clienti/${c.id}`,
          icon: "User",
        });
      }

      for (const q of (quotesRes.data ?? []) as Array<Record<string, string | null>>) {
        results.push({
          id: q.id as string,
          type: "quote",
          title: q.title || q.quote_number || "Preventivo",
          subtitle: [q.quote_number, q.client_name].filter(Boolean).join(" · "),
          url: `/azienda/marketing/preventivi/${q.id}`,
          icon: "FileText",
        });
      }

      for (const c of contactsRes.data ?? []) {
        results.push({
          id: c.id,
          type: "contact",
          title: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
          subtitle: c.email ?? c.phone ?? "",
          url: `/azienda/marketing/contatti/${c.id}`,
          icon: "UserCircle",
        });
      }

      for (const t of ticketsRes.data ?? []) {
        results.push({
          id: t.id,
          type: "ticket",
          title: t.subject,
          subtitle: `Stato: ${t.status}`,
          url: `/azienda/assistenza/${t.id}`,
          icon: "MessageSquare",
        });
      }

      return results;
    },
    enabled: !!companyId && debouncedQuery.length >= 2,
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  });
}
