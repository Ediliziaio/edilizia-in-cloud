import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";

export interface CompanyGroup { name: string; companyIds: string[] }
export function collectCompanyGroups(tags: Array<{ tag: string; company_id: string }>): CompanyGroup[] {
  const groups = new Map<string, Set<string>>();
  for (const tag of tags) {
    if (!tag.tag.startsWith("Gruppo: ")) continue;
    const name = tag.tag.slice(8).trim();
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, new Set());
    groups.get(name)!.add(tag.company_id);
  }
  return [...groups].map(([name, ids]) => ({ name, companyIds: [...ids].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
}

/** La classificazione in gruppi non modifica i permessi di accesso. */
export function useCompanyGroups() {
  return useQuery({
    queryKey: ["admin-company-groups"],
    queryFn: async () => collectCompanyGroups(await loadCatalogPages((from, to) => supabase
      .from("company_tags").select("id, company_id, tag").like("tag", "Gruppo: %")
      .order("id").range(from, to))),
    staleTime: 60_000,
  });
}

export interface AccountsOverview {
  accounts: number; with_profile: number; without_profile: number; portal: number; roles: string[];
  companies: Array<{ id: string | null; name: string; accounts: number; portal: number }>;
}
export function useAccountsOverview() {
  return useQuery({
    queryKey: ["admin-accounts-overview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_accounts_overview" as never);
      if (error) throw error;
      return data as unknown as AccountsOverview;
    },
    staleTime: 30_000,
  });
}
