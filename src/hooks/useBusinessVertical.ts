/**
 * useBusinessVertical — MP-VERT-01
 *
 * Hook che ritorna il vertical configurato per la company corrente
 * (incluso secondary_verticals). Cache 10 minuti.
 *
 * Usage:
 *   const { data, isLoading } = useBusinessVertical();
 *   if (data?.vertical?.has_render_module) { ... }
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export interface BusinessVerticalRow {
  id: string;
  vertical_key: string;
  display_name: string;
  short_label: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  has_render_module: boolean;
  render_categories: string[];
  enabled_personas: string[];
  vertical_personas: string[];
  kb_areas: string[];
  recommended_plan: string | null;
  enabled: boolean;
  sort_order: number;
}

export interface BusinessVerticalResult {
  vertical_key: string | null;
  secondary_verticals: string[];
  /** Vertical PRIMARY hydrated (può essere null se non configurato). */
  vertical: BusinessVerticalRow | null;
  /** Tutti i vertical secondari hydrated. */
  secondaries: BusinessVerticalRow[];
}

export function useBusinessVertical() {
  const companyId = useEffectiveCompanyId();

  return useQuery<BusinessVerticalResult>({
    queryKey: ["business-vertical", companyId],
    enabled: !!companyId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async (): Promise<BusinessVerticalResult> => {
      const { data: c, error: cErr } = await supabase
        .from("companies")
        .select("vertical_key, secondary_verticals")
        .eq("id", companyId!)
        .maybeSingle();
      if (cErr) throw new Error(cErr.message);

      const verticalKey = (c as { vertical_key?: string | null } | null)?.vertical_key ?? null;
      const secondaryKeys = ((c as { secondary_verticals?: string[] } | null)?.secondary_verticals ?? []) as string[];

      const allKeys = [verticalKey, ...secondaryKeys].filter(Boolean) as string[];
      let primary: BusinessVerticalRow | null = null;
      let secondaries: BusinessVerticalRow[] = [];

      if (allKeys.length > 0) {
        const { data: vs, error: vErr } = await supabase
          .from("business_verticals" as never)
          .select(
            "id, vertical_key, display_name, short_label, description, icon, color, has_render_module, render_categories, enabled_personas, vertical_personas, kb_areas, recommended_plan, enabled, sort_order"
          )
          .in("vertical_key", allKeys);
        if (vErr) throw new Error(vErr.message);
        const list = ((vs ?? []) as unknown) as BusinessVerticalRow[];
        primary = list.find((v) => v.vertical_key === verticalKey) ?? null;
        secondaries = list.filter((v) => secondaryKeys.includes(v.vertical_key));
      }

      return {
        vertical_key: verticalKey,
        secondary_verticals: secondaryKeys,
        vertical: primary,
        secondaries,
      };
    },
  });
}

/**
 * Lista TUTTI i verticali disponibili nel sistema (per onboarding wizard /
 * settings page). Cache 30 minuti.
 */
export function useAllBusinessVerticals() {
  return useQuery<BusinessVerticalRow[]>({
    queryKey: ["business-verticals", "all"],
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<BusinessVerticalRow[]> => {
      const { data, error } = await supabase
        .from("business_verticals" as never)
        .select(
          "id, vertical_key, display_name, short_label, description, icon, color, has_render_module, render_categories, enabled_personas, vertical_personas, kb_areas, recommended_plan, enabled, sort_order"
        )
        .eq("enabled", true)
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown) as BusinessVerticalRow[];
    },
  });
}
