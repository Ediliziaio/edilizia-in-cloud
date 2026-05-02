import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Trash2, Plus, Tag, AlertCircle, Pencil, Search, Users, BriefcaseBusiness } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type MarketingTag = {
  id: string;
  company_id: string;
  name: string;
  color: string | null;
  created_at: string;
};

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

const TAG_COLORS = [
  "#2563eb",
  "#16a34a",
  "#f97316",
  "#dc2626",
  "#9333ea",
  "#0891b2",
  "#ca8a04",
  "#475569",
] as const;

const DEFAULT_TAG_COLOR = TAG_COLORS[0];

function normalizeTagName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function getUsageTotal(usage?: TagUsageCounts) {
  return (usage?.contacts ?? 0) + (usage?.opportunities ?? 0);
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
  const [newColor, setNewColor] = useState(DEFAULT_TAG_COLOR);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editTag, setEditTag] = useState<MarketingTag | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(DEFAULT_TAG_COLOR);

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
      return data as MarketingTag[];
    },
    enabled: !!companyId,
  });

  const { data: usageByName = {}, isLoading: isUsageLoading } = useQuery({
    queryKey: [...queryKeys.marketingTags.list(companyId), "usage"],
    queryFn: async () => {
      if (!companyId || tags.length === 0) return {};
      const entries = await Promise.all(
        tags.map(async (tag) => [tag.name, await getTagUsageCounts(companyId, tag.name)] as const),
      );
      return Object.fromEntries(entries) as Record<string, TagUsageCounts>;
    },
    enabled: !!companyId && tags.length > 0,
  });

  const normalizedNewTag = normalizeTagName(newTag);
  const filteredTags = useMemo(() => {
    const term = normalizeTagName(search);
    if (!term) return tags;
    return tags.filter((tag) => tag.name.includes(term));
  }, [search, tags]);
  const deleteTag = tags.find((item) => item.id === deleteId) ?? null;
  const deleteUsage = deleteTag ? usageByName[deleteTag.name] : undefined;

  const invalidateTagQueries = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.marketingTags.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.tags.all });
  };

  const addMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const normalizedName = normalizeTagName(name);
      if (!normalizedName) throw new Error("Inserisci un nome tag valido");
      if (tags.some((tag) => normalizeTagName(tag.name) === normalizedName)) {
        throw new Error("DUPLICATE_TAG");
      }
      const { error } = await supabase.from("marketing_tags").insert({
        company_id: companyId,
        name: normalizedName,
        color,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateTagQueries();
      setNewTag("");
      setNewColor(DEFAULT_TAG_COLOR);
      toast.success("Tag aggiunto");
    },
    onError: (e: unknown) => {
      const message = getTagErrorMessage(e);
      const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
      if (message.includes("DUPLICATE_TAG") || message.includes("duplicate") || code === "23505") {
        toast.error("Tag già esistente");
      } else {
        toast.error("Errore nell'aggiunta del tag");
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, currentName, nextName, color }: { id: string; currentName: string; nextName: string; color: string }) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const normalizedName = normalizeTagName(nextName);
      if (!normalizedName) throw new Error("Inserisci un nome tag valido");
      if (tags.some((tag) => tag.id !== id && normalizeTagName(tag.name) === normalizedName)) {
        throw new Error("DUPLICATE_TAG");
      }

      const usage = usageByName[currentName] ?? await getTagUsageCounts(companyId, currentName);
      if (normalizedName !== currentName && getUsageTotal(usage) > 0) {
        throw new TagInUseError(usage);
      }

      const { error } = await supabase
        .from("marketing_tags")
        .update({ name: normalizedName, color })
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateTagQueries();
      setEditTag(null);
      toast.success("Tag aggiornato");
    },
    onError: (e: unknown) => {
      if (e instanceof TagInUseError) {
        toast.error("Il nome di un tag già usato non può essere cambiato. Puoi aggiornare solo il colore.");
        return;
      }
      const message = getTagErrorMessage(e);
      const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
      if (message.includes("DUPLICATE_TAG") || message.includes("duplicate") || code === "23505") {
        toast.error("Tag già esistente");
      } else {
        toast.error("Errore nell'aggiornamento del tag");
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
      invalidateTagQueries();
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
    if (!companyId || !normalizedNewTag || addMutation.isPending) return;
    addMutation.mutate({ name: normalizedNewTag, color: newColor });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  const openEdit = (tag: MarketingTag) => {
    setEditTag(tag);
    setEditName(tag.name);
    setEditColor(tag.color || DEFAULT_TAG_COLOR);
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

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="space-y-2">
              <Label htmlFor="new-tag">Nuovo tag</Label>
              <Input
                id="new-tag"
                placeholder="Es. cliente caldo"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={50}
                disabled={!companyId || addMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Il nome viene normalizzato per evitare duplicati tra CRM, segmenti e automazioni.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {TAG_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Colore tag ${color}`}
                  onClick={() => setNewColor(color)}
                  className={cn(
                    "h-8 w-8 rounded-full border-2 transition",
                    newColor === color ? "border-foreground" : "border-transparent",
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
              <Button onClick={handleAdd} disabled={!companyId || !normalizedNewTag || addMutation.isPending}>
                <Plus className="h-4 w-4 mr-1" />
                Aggiungi
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca tag..."
          className="pl-9"
        />
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
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead className="w-[180px]">Utilizzi</TableHead>
                <TableHead className="w-[120px] text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTags.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-sm text-muted-foreground">
                    Nessun tag corrisponde alla ricerca.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTags.map((tag) => {
                  const usage = usageByName[tag.name];
                  const totalUsage = getUsageTotal(usage);
                  return (
                    <TableRow key={tag.id}>
                      <TableCell>
                        <Badge variant="secondary" className="gap-2 px-3 py-1.5 text-sm">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color || DEFAULT_TAG_COLOR }} />
                          {tag.name}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {isUsageLoading ? (
                          <span className="text-sm text-muted-foreground">Calcolo...</span>
                        ) : (
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {usage?.contacts ?? 0}</span>
                            <span className="inline-flex items-center gap-1"><BriefcaseBusiness className="h-3 w-3" /> {usage?.opportunities ?? 0}</span>
                            {totalUsage > 0 && <Badge variant="outline">{totalUsage} tot.</Badge>}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(tag)} aria-label={`Modifica tag ${tag.name}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => setDeleteId(tag.id)} aria-label={`Elimina tag ${tag.name}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!editTag} onOpenChange={(open) => !open && setEditTag(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica tag</DialogTitle>
            <DialogDescription>
              Puoi aggiornare colore e nome. Se il tag è già usato, il nome resta bloccato per non perdere segmentazioni e collegamenti CRM.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-tag-name">Nome tag</Label>
              <Input
                id="edit-tag-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={50}
                disabled={updateMutation.isPending}
              />
              {editTag && getUsageTotal(usageByName[editTag.name]) > 0 && (
                <p className="text-xs text-amber-700">
                  Tag usato in {getUsageTotal(usageByName[editTag.name])} elemento/i: il cambio nome verra bloccato.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Colore</Label>
              <div className="flex flex-wrap gap-2">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Colore tag ${color}`}
                    onClick={() => setEditColor(color)}
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition",
                      editColor === color ? "border-foreground" : "border-transparent",
                    )}
                    style={{ backgroundColor: color }}
                    disabled={updateMutation.isPending}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditTag(null)}>Annulla</Button>
            <Button
              type="button"
              disabled={!editTag || !normalizeTagName(editName) || updateMutation.isPending}
              onClick={() => {
                if (!editTag) return;
                updateMutation.mutate({
                  id: editTag.id,
                  currentName: editTag.name,
                  nextName: editName,
                  color: editColor,
                });
              }}
            >
              Salva modifiche
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina tag</AlertDialogTitle>
            <AlertDialogDescription>
              Puoi eliminare un tag solo se non è usato da contatti o opportunità, così segmentazioni e filtri restano coerenti.
              {deleteTag && (
                <span className="mt-2 block">
                  Uso attuale: {deleteUsage?.contacts ?? 0} contatti, {deleteUsage?.opportunities ?? 0} opportunità.
                </span>
              )}
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
