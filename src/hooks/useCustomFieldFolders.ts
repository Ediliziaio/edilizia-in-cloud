// v8.6.45 — Hook CRUD per le cartelle dei campi personalizzati.
//
// Sblocca la tab "Cartelle" del modulo Custom Fields (prima disabled).
// Le cartelle servono per raggruppare campi custom dello stesso oggetto
// in sezioni logiche (es. "Anagrafica fiscale", "Note operative", ecc.).
//
// Schema: vedi migration 20270517130000_custom_fields_folders_and_softdelete.sql
//   marketing_custom_field_folders (id, company_id, name, object_type,
//     icon, color, position, created_at, updated_at, deleted_at)

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export interface CustomFieldFolder {
  id: string;
  company_id: string;
  name: string;
  object_type: string | null;
  icon: string | null;
  color: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CustomFieldFolderInput {
  name: string;
  object_type?: string | null;
  icon?: string | null;
  color?: string | null;
  position?: number;
}

const FOLDERS_KEY = ["custom-field-folders"] as const;

export function useCustomFieldFolders() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: [...FOLDERS_KEY, companyId],
    queryFn: async (): Promise<CustomFieldFolder[]> => {
      if (!companyId) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("marketing_custom_field_folders")
        .select("id, company_id, name, object_type, icon, color, position, created_at, updated_at, deleted_at")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("position", { ascending: true })
        .order("name", { ascending: true });
      if (error) {
        // v8.6.45 — graceful: la tabella potrebbe non esistere ancora
        // (migration 20270517130000 pending). Ritorna [] invece di lanciare.
        if (
          /marketing_custom_field_folders.*does not exist/i.test(error.message ?? "") ||
          /relation.*marketing_custom_field_folders.*does not exist/i.test(error.message ?? "")
        ) {
          return [];
        }
        throw error;
      }
      return (data ?? []) as CustomFieldFolder[];
    },
    enabled: !!companyId,
    retry: false,
  });
}

export function useCreateCustomFieldFolder() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CustomFieldFolderInput) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const name = input.name.trim();
      if (!name) throw new Error("Il nome cartella è obbligatorio");
      if (name.length > 80) throw new Error("Massimo 80 caratteri");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("marketing_custom_field_folders")
        .insert({
          company_id: companyId,
          name,
          object_type: input.object_type ?? null,
          icon: input.icon ?? null,
          color: input.color ?? null,
          position: input.position ?? 0,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      toast.success("Cartella creata");
      qc.invalidateQueries({ queryKey: FOLDERS_KEY });
    },
    onError: (err: Error) =>
      toast.error("Impossibile creare la cartella", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      }),
  });
}

export function useUpdateCustomFieldFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<CustomFieldFolderInput>) => {
      if (patch.name !== undefined) {
        const name = patch.name.trim();
        if (!name) throw new Error("Il nome cartella è obbligatorio");
        if (name.length > 80) throw new Error("Massimo 80 caratteri");
        patch.name = name;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("marketing_custom_field_folders")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cartella aggiornata");
      qc.invalidateQueries({ queryKey: FOLDERS_KEY });
    },
    onError: (err: Error) =>
      toast.error("Impossibile aggiornare la cartella", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      }),
  });
}

export function useDeleteCustomFieldFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Soft-delete: marca come eliminata. I campi che la referenziano
      // mantengono folder_id ma il join filtra deleted_at IS NULL.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("marketing_custom_field_folders")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cartella eliminata");
      qc.invalidateQueries({ queryKey: FOLDERS_KEY });
      qc.invalidateQueries({ queryKey: ["custom-fields-data"] });
    },
    onError: (err: Error) =>
      toast.error("Impossibile eliminare la cartella", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      }),
  });
}
