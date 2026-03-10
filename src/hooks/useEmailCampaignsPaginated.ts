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
    ),
    queryFn: async () => {
      let query = supabase
        .from("email_campaigns")
        .select(
          "id, name, status, type, subject, sender_name, sender_email, folder_id, json_content, html_content, preview_text, scheduled_at, created_at, updated_at",
          { count: "exact" }
        )
        .eq("company_id", companyId!);

      // Folder filter
      if (filters.folderId) {
        query = query.eq("folder_id", filters.folderId);
      } else {
        query = query.is("folder_id", null);
      }

      // Category filter
      if (filters.category !== "all") {
        query = query.eq("type", filters.category);
      }

      // Search (server-side)
      if (filters.search.trim()) {
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

      if (filters.folderId) {
        query = query.eq("folder_id", filters.folderId);
      } else {
        query = query.is("folder_id", null);
      }

      if (filters.search.trim()) {
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
