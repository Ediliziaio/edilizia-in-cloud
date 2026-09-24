import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

interface PaginationParams {
  page: number;       // 0-indexed
  perPage: number;
}

interface CampaignFilters {
  search: string;
  category: string;
  folderId: string | null;
  /** filtro stato: "all" | draft | scheduled | sending | sent | failed */
  status?: string;
}

export function useEmailCampaignsPaginated(
  companyId: string | undefined,
  filters: CampaignFilters,
  pagination: PaginationParams
) {
  const { page, perPage } = pagination;

  return useQuery({
    queryKey: queryKeys.emailCampaigns.paginated(
      companyId,
      filters.search,
      filters.category,
      filters.folderId,
      page,
      perPage,
      filters.status ?? "all",
    ),
    queryFn: async () => {
      let query = supabase
        .from("email_campaigns")
        .select(
          "id, name, status, type, subject, sender_name, sender_email, folder_id, json_content, html_content, preview_text, scheduled_at, sent_at, created_at, updated_at, sent_count, failed_count, total_recipients",
          { count: "exact" }
        )
        .eq("company_id", companyId!);

      const searching = !!filters.search.trim();

      // Folder filter — SOLO quando non si sta cercando: la ricerca è globale
      // (prima cercando dalla Home non si trovavano le campagne nelle cartelle).
      if (!searching) {
        if (filters.folderId) {
          query = query.eq("folder_id", filters.folderId);
        } else {
          query = query.is("folder_id", null);
        }
      }

      // Category filter
      if (filters.category !== "all") {
        query = query.eq("type", filters.category);
      }

      // Status filter (chips "Bozze/Pianificate/Inviate/…")
      if (filters.status && filters.status !== "all") {
        // "sent" raggruppa anche "completed" (stesso significato per l'utente)
        if (filters.status === "sent") query = query.in("status", ["sent", "completed"]);
        else query = query.eq("status", filters.status);
      }

      // Search (server-side, cross-cartelle)
      if (searching) {
        query = query.ilike("name", `%${filters.search.trim()}%`);
      }

      const from = page * perPage;
      const to = from + perPage - 1;
      query = query.range(from, to).order("created_at", { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data ?? [], total: count ?? 0 };
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    gcTime: 8 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

interface TemplateFilters {
  search: string;
  folderId: string | null;
}

export function useEmailTemplatesPaginated(
  companyId: string | undefined,
  filters: TemplateFilters,
  pagination: PaginationParams
) {
  const { page, perPage } = pagination;

  return useQuery({
    queryKey: queryKeys.emailTemplates.paginated(
      companyId,
      filters.search,
      filters.folderId,
      page,
      perPage,
    ),
    queryFn: async () => {
      let query = supabase
        .from("email_templates")
        .select("*", { count: "exact" })
        .eq("company_id", companyId!);

      // ricerca globale cross-cartelle (come per le campagne)
      if (!filters.search.trim()) {
        if (filters.folderId) {
          query = query.eq("folder_id", filters.folderId);
        } else {
          query = query.is("folder_id", null);
        }
      } else {
        query = query.ilike("name", `%${filters.search.trim()}%`);
      }

      const from = page * perPage;
      const to = from + perPage - 1;
      query = query.range(from, to).order("created_at", { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data ?? [], total: count ?? 0 };
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    gcTime: 8 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}
