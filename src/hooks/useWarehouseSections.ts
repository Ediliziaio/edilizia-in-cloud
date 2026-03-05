import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface WarehouseSection {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  color: string;
  position: number;
  created_at: string;
}

export function useWarehouseSections() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const { data: sections = [], isLoading } = useQuery({
    queryKey: ["warehouse-sections", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("warehouse_sections")
        .select("*")
        .eq("company_id", companyId)
        .order("position");
      if (error) throw error;
      return data as WarehouseSection[];
    },
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; color: string }) => {
      if (!companyId) throw new Error("No company");
      const maxPos = sections.length > 0 ? Math.max(...sections.map(s => s.position)) + 1 : 0;
      const { error } = await supabase.from("warehouse_sections").insert({
        company_id: companyId,
        name: data.name,
        description: data.description || null,
        color: data.color,
        position: maxPos,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-sections"] });
      toast.success("Sezione creata");
    },
    onError: (e: any) => {
      if (e?.message?.includes("duplicate")) {
        toast.error("Esiste già una sezione con questo nome");
      } else {
        toast.error("Errore nella creazione della sezione");
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; description?: string; color: string }) => {
      const { error } = await supabase
        .from("warehouse_sections")
        .update({ name: data.name, description: data.description || null, color: data.color })
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-sections"] });
      toast.success("Sezione aggiornata");
    },
    onError: () => toast.error("Errore nell'aggiornamento"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("warehouse_sections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-sections"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock"] });
      toast.success("Sezione eliminata");
    },
    onError: () => toast.error("Errore nell'eliminazione"),
  });

  return {
    sections,
    isLoading,
    createSection: createMutation.mutate,
    updateSection: updateMutation.mutate,
    deleteSection: deleteMutation.mutate,
    isPending: createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  };
}
