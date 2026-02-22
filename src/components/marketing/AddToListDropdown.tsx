import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ListPlus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { CreateListDialog } from "./CreateListDialog";

interface AddToListDropdownProps {
  selectedIds: Set<string>;
}

export function AddToListDropdown({ selectedIds }: AddToListDropdownProps) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: lists = [] } = useQuery({
    queryKey: ["marketing-contact-lists", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_contact_lists")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && open,
  });

  const addMutation = useMutation({
    mutationFn: async (listId: string) => {
      const rows = Array.from(selectedIds).map(contactId => ({ list_id: listId, contact_id: contactId }));
      const { error } = await supabase.from("marketing_contact_list_members").upsert(rows, { onConflict: "list_id,contact_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${selectedIds.size} contatti aggiunti alla lista`);
      queryClient.invalidateQueries({ queryKey: ["marketing-contact-lists"] });
      setOpen(false);
    },
    onError: () => toast.error("Errore nell'aggiunta"),
  });

  const createAndAdd = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      if (!companyId) throw new Error("No company");
      const { data: list, error } = await supabase
        .from("marketing_contact_lists")
        .insert({ company_id: companyId, name: data.name, description: data.description || null })
        .select("id")
        .single();
      if (error) throw error;
      const rows = Array.from(selectedIds).map(contactId => ({ list_id: list.id, contact_id: contactId }));
      const { error: err2 } = await supabase.from("marketing_contact_list_members").insert(rows);
      if (err2) throw err2;
    },
    onSuccess: () => {
      toast.success("Lista creata e contatti aggiunti");
      queryClient.invalidateQueries({ queryKey: ["marketing-contact-lists"] });
      setCreateOpen(false);
      setOpen(false);
    },
    onError: () => toast.error("Errore nella creazione"),
  });

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline">
            <ListPlus className="h-4 w-4 mr-1" /> Aggiungi a lista
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {lists.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-1">Nessuna lista</p>
            ) : (
              lists.map((l) => (
                <button
                  key={l.id}
                  className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors"
                  onClick={() => addMutation.mutate(l.id)}
                >
                  {l.name}
                </button>
              ))
            )}
          </div>
          <div className="border-t mt-1 pt-1">
            <button
              className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors flex items-center gap-1.5 text-primary"
              onClick={() => { setOpen(false); setCreateOpen(true); }}
            >
              <Plus className="h-3.5 w-3.5" /> Crea nuova lista
            </button>
          </div>
        </PopoverContent>
      </Popover>
      <CreateListDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSave={(data) => createAndAdd.mutateAsync(data)}
      />
    </>
  );
}
