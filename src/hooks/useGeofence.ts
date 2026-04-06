import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CantiereGeofence, CantiereGeofenceInsert } from "@/types/fleet";

/**
 * Hook CRUD per i geofence circolari dei cantieri.
 */
export function useGeofence(companyId: string) {
  const queryClient = useQueryClient();
  const queryKey = ["cantieri-geofence", companyId];

  const { data: geofences = [], isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<CantiereGeofence[]> => {
      const { data, error } = await (supabase
        .from("cantieri_geofence" as never)
        .select("id, company_id, order_id, nome, center_lat, center_lng, radius_mt, is_active, created_at, updated_at")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("nome") as unknown as Promise<{ data: CantiereGeofence[] | null; error: unknown }>);

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async (input: CantiereGeofenceInsert): Promise<CantiereGeofence> => {
      const { data, error } = await (supabase
        .from("cantieri_geofence" as never)
        .insert({ ...input, company_id: companyId })
        .select()
        .single() as unknown as Promise<{ data: CantiereGeofence | null; error: unknown }>);
      if (error) throw error;
      return data!;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<CantiereGeofence> & { id: string }): Promise<void> => {
      const { error } = await (supabase
        .from("cantieri_geofence" as never)
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("company_id", companyId) as unknown as Promise<{ error: unknown }>);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      // Soft-delete: set is_active = false
      const { error } = await (supabase
        .from("cantieri_geofence" as never)
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("company_id", companyId) as unknown as Promise<{ error: unknown }>);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    geofences,
    isLoading,
    createGeofence: createMutation.mutateAsync,
    updateGeofence: updateMutation.mutateAsync,
    deleteGeofence: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
