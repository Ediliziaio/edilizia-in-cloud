import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Plus, MoreHorizontal, Pencil, Trash2, Users, List } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { CreateListDialog } from "./CreateListDialog";

interface ContactList {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  member_count: number;
}

interface ContactListsViewProps {
  onSelectList: (listId: string, listName: string) => void;
}

export function ContactListsView({ onSelectList }: ContactListsViewProps) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingList, setEditingList] = useState<ContactList | null>(null);

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ["marketing-contact-lists", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_contact_lists")
        .select("id, name, description, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Get member counts
      const { data: counts, error: countError } = await supabase
        .from("marketing_contact_list_members")
        .select("list_id")
        .in("list_id", (data || []).map(l => l.id));
      if (countError) throw countError;

      const countMap: Record<string, number> = {};
      (counts || []).forEach(c => {
        countMap[c.list_id] = (countMap[c.list_id] || 0) + 1;
      });

      return (data || []).map(l => ({ ...l, member_count: countMap[l.id] || 0 })) as ContactList[];
    },
    enabled: !!companyId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["marketing-contact-lists"] });

  const saveMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      if (!companyId) throw new Error("No company");
      if (editingList) {
        const { error } = await supabase
          .from("marketing_contact_lists")
          .update({ name: data.name, description: data.description || null })
          .eq("id", editingList.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("marketing_contact_lists")
          .insert({ company_id: companyId, name: data.name, description: data.description || null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingList ? "Lista aggiornata" : "Lista creata");
      invalidate();
      setEditingList(null);
    },
    onError: () => toast.error("Errore nel salvataggio"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_contact_lists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Lista eliminata"); invalidate(); },
    onError: () => toast.error("Errore nell'eliminazione"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {lists.length} {lists.length === 1 ? "lista" : "liste"}
        </p>
        <Button size="sm" onClick={() => { setEditingList(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nuova Lista
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : lists.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <List className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground">Nessuna lista creata</p>
          <Button variant="outline" onClick={() => { setEditingList(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Crea la tua prima lista
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <Card
              key={list.id}
              className="cursor-pointer hover:border-primary/50 transition-colors group"
              onClick={() => onSelectList(list.id, list.name)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold truncate">{list.name}</h3>
                    {list.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{list.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> {list.member_count} contatti
                      </span>
                      <span>{format(new Date(list.created_at), "dd MMM yyyy", { locale: it })}</span>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => { setEditingList(list); setDialogOpen(true); }}>
                        <Pencil className="h-4 w-4 mr-2" /> Rinomina
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(list.id)}>
                        <Trash2 className="h-4 w-4 mr-2" /> Elimina
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateListDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={(data) => saveMutation.mutateAsync(data)}
        initialData={editingList ? { name: editingList.name, description: editingList.description || "" } : undefined}
        isEditing={!!editingList}
      />
    </div>
  );
}
