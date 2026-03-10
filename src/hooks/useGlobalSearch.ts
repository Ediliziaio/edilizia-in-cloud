import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "./useDebounce";

export interface SearchResult {
  id: string;
  type: "order" | "customer" | "contact" | "ticket";
  title: string;
  subtitle: string;
  url: string;
  icon: string;
}

export function useGlobalSearch(query: string, companyId: string | undefined) {
  const debouncedQuery = useDebounce(query, 250);

  return useQuery<SearchResult[]>({
    queryKey: ["global-search", companyId, debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return [];

      const pattern = `%${debouncedQuery}%`;

      const ordersRes = await supabase
        .from("orders")
        .select("id, order_code, description")
        .eq("company_id", companyId!)
        .or(`order_code.ilike.${pattern},description.ilike.${pattern}`)
        .limit(5) as { data: any[] | null };

      const customersRes = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone")
        .eq("company_id", companyId!)
        .eq("role_type", "customer")
        .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`)
        .limit(5) as { data: any[] | null };

      const contactsRes = await supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, email, phone")
        .eq("company_id", companyId!)
        .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`)
        .limit(5) as { data: any[] | null };

      const ticketsRes = await supabase
        .from("tickets")
        .select("id, subject, status")
        .eq("company_id", companyId!)
        .ilike("subject", pattern)
        .limit(5) as { data: any[] | null };

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

      for (const c of customersRes.data ?? []) {
        results.push({
          id: c.id,
          type: "customer",
          title: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
          subtitle: c.email ?? c.phone ?? "",
          url: `/azienda/clienti/${c.id}`,
          icon: "User",
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
