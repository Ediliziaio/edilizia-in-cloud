import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Trash2, Plus, Tag, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type TagUsageCounts = {
  contacts: number;
  opportunities: number;
};

class TagInUseError extends Error {
  usage: TagUsageCounts;

  constructor(usage: TagUsageCounts) {
    super("TAG_IN_USE");
    this.name = "TagInUseError";
    this.usage = usage;
  }
}

function getTagErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "";
}

async function getTagUsageCounts(companyId: string, tagName: string): Promise<TagUsageCounts> {
  const [contactsRes, opportunitiesRes] = await Promise.all([
    supabase
      .from("marketing_contacts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .contains("tags", [tagName]),
    supabase
      .from("marketing_opportunities")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .contains("tags", [tagName]),
  ]);

  if (contactsRes.error) throw contactsRes.error;
  if (opportunitiesRes.error) throw opportunitiesRes.error;

  return {
    contacts: contactsRes.count ?? 0,
    opportunities: opportunitiesRes.count ?? 0,
  };
}

export function TagsConfig() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [newTag, setNewTag] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: tags = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.marketingTags.list(companyId),
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
      if (!companyId) throw new Error("Azienda non disponibile");
      const normalizedName = name.trim().toLowerCase();
      const { error } = await supabase.from("marketing_tags").insert({
        company_id: companyId,
        name: normalizedName,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingTags.all });
      setNewTag("");
      toast.success("Tag aggiunto");
    },
    onError: (e: unknown) => {
      const message = getTagErrorMessage(e);
      const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
      if (message.includes("duplicate") || code === "23505") {
        toast.error("Tag già esistente");
      } else {
        toast.error("Errore nell'aggiunta del tag");
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      if (!companyId) throw new Error("Azienda non disponibile");

      const usage = await getTagUsageCounts(companyId, name);
      if (usage.contacts > 0 || usage.opportunities > 0) {
        throw new TagInUseError(usage);
      }

      const { error } = await supabase.from("marketing_tags").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingTags.all });
      toast.success("Tag eliminato");
    },
    onError: (e: unknown) => {
      if (e instanceof TagInUseError) {
        const total = e.usage.contacts + e.usage.opportunities;
        toast.error(`Tag già usato in ${total} elemento/i. Rimuovilo prima da contatti e opportunità.`);
        return;
      }

      toast.error("Errore nell'eliminazione");
    },
  });

  const handleAdd = () => {
    if (!companyId || !newTag.trim() || addMutation.isPending) return;
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
          maxLength={50}
          disabled={!companyId || addMutation.isPending}
        />
        <Button onClick={handleAdd} disabled={!companyId || !newTag.trim() || addMutation.isPending}>
          <Plus className="h-4 w-4 mr-1" />
          Aggiungi
        </Button>
      </div>

      {isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Tag non disponibili</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{getTagErrorMessage(error) || "Non è stato possibile caricare i tag aziendali."}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
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
                aria-label={`Elimina tag ${tag.name}`}
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
              Puoi eliminare un tag solo se non è usato da contatti o opportunità, così segmentazioni e filtri restano coerenti.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const tag = tags.find((item) => item.id === deleteId);
                if (tag) deleteMutation.mutate({ id: tag.id, name: tag.name });
                setDeleteId(null);
              }}
              disabled={deleteMutation.isPending}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
