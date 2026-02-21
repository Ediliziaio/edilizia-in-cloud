import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Tag } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function TagsConfig() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [newTag, setNewTag] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ["marketing_tags", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_tags")
        .select("*")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("marketing_tags").insert({
        company_id: companyId!,
        name: name.trim().toLowerCase(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_tags"] });
      setNewTag("");
      toast.success("Tag aggiunto");
    },
    onError: (e: any) => {
      if (e.message?.includes("duplicate") || e.code === "23505") {
        toast.error("Tag già esistente");
      } else {
        toast.error("Errore nell'aggiunta del tag");
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_tags"] });
      toast.success("Tag eliminato");
    },
    onError: () => toast.error("Errore nell'eliminazione"),
  });

  const handleAdd = () => {
    if (!newTag.trim()) return;
    addMutation.mutate(newTag);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Tag className="h-6 w-6" />
          Tag
        </h2>
        <p className="text-muted-foreground mt-1">
          Gestisci i tag utilizzati nei Contatti e nelle Opportunità. I tag creati qui saranno disponibili in tutti i selettori.
        </p>
      </div>

      <div className="flex gap-2 max-w-md">
        <Input
          placeholder="Nuovo tag..."
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button onClick={handleAdd} disabled={!newTag.trim() || addMutation.isPending}>
          <Plus className="h-4 w-4 mr-1" />
          Aggiungi
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Caricamento...</p>
      ) : tags.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nessun tag creato. Aggiungi il primo tag qui sopra.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Badge
              key={tag.id}
              variant="secondary"
              className="gap-1.5 px-3 py-1.5 text-sm"
            >
              {tag.name}
              <button
                onClick={() => setDeleteId(tag.id)}
                className="ml-1 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina tag</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare questo tag? Non verrà rimosso dai contatti che lo utilizzano già.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) deleteMutation.mutate(deleteId);
                setDeleteId(null);
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
