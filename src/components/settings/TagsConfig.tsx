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
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Trash2, Plus, Tag, AlertCircle, Pencil, Search, Users, BriefcaseBusiness, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  areTagListsExactlyEqual,
  DEFAULT_TAG_COLOR,
  normalizeTagList,
  normalizeTagName,
  TAG_COLORS,
} from "@/lib/marketingTags";

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

type TaggedEntity = {
  id: string;
  tags: string[] | null;
};

type RepairResult = {
  normalizedContacts: number;
  normalizedOpportunities: number;
  createdTags: number;
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

function getUsageTotal(usage?: TagUsageCounts) {
  return (usage?.contacts ?? 0) + (usage?.opportunities ?? 0);
}

function createEmptyUsageMap(tagNames: string[]) {
  return Object.fromEntries(
    normalizeTagList(tagNames).map((name) => [name, { contacts: 0, opportunities: 0 }]),
  ) as Record<string, TagUsageCounts>;
}

function addUsageForRows(
  usageMap: Record<string, TagUsageCounts>,
  rows: TaggedEntity[] | null,
  field: keyof TagUsageCounts,
) {
  for (const row of rows ?? []) {
    const rowTags = new Set(normalizeTagList(row.tags));
    rowTags.forEach((tagName) => {
      if (!usageMap[tagName]) return;
      usageMap[tagName][field] += 1;
    });
  }
}

async function getTagUsageMap(companyId: string, tagNames: string[]): Promise<Record<string, TagUsageCounts>> {
  const usageMap = createEmptyUsageMap(tagNames);
  if (Object.keys(usageMap).length === 0) return usageMap;

  const [contactsRes, opportunitiesRes] = await Promise.all([
    supabase
      .from("marketing_contacts")
      .select("id, tags")
      .eq("company_id", companyId)
      .not("tags", "is", null),
    supabase
      .from("marketing_opportunities")
      .select("id, tags")
      .eq("company_id", companyId)
      .not("tags", "is", null),
  ]);

  if (contactsRes.error) throw contactsRes.error;
  if (opportunitiesRes.error) throw opportunitiesRes.error;

  addUsageForRows(usageMap, contactsRes.data as TaggedEntity[] | null, "contacts");
  addUsageForRows(usageMap, opportunitiesRes.data as TaggedEntity[] | null, "opportunities");

  return usageMap;
}

async function getTagUsageCounts(companyId: string, tagName: string): Promise<TagUsageCounts> {
  const normalizedName = normalizeTagName(tagName);
  const usageMap = await getTagUsageMap(companyId, [normalizedName]);
  return usageMap[normalizedName] ?? { contacts: 0, opportunities: 0 };
}

async function repairMarketingTagLinks(companyId: string, existingTags: MarketingTag[]): Promise<RepairResult> {
  const [contactsRes, opportunitiesRes] = await Promise.all([
    supabase.from("marketing_contacts").select("id, tags").eq("company_id", companyId),
    supabase.from("marketing_opportunities").select("id, tags").eq("company_id", companyId),
  ]);

  if (contactsRes.error) throw contactsRes.error;
  if (opportunitiesRes.error) throw opportunitiesRes.error;

  const contacts = (contactsRes.data ?? []) as TaggedEntity[];
  const opportunities = (opportunitiesRes.data ?? []) as TaggedEntity[];
  const usedTagNames = new Set<string>();
  const now = new Date().toISOString();

  const contactUpdates = contacts
    .map((row) => {
      const normalizedTags = normalizeTagList(row.tags);
      normalizedTags.forEach((tag) => usedTagNames.add(tag));
      if (areTagListsExactlyEqual(row.tags, normalizedTags)) return null;
      return supabase
        .from("marketing_contacts")
        .update({ tags: normalizedTags, updated_at: now })
        .eq("id", row.id)
        .eq("company_id", companyId);
    })
    .filter(Boolean);

  const opportunityUpdates = opportunities
    .map((row) => {
      const normalizedTags = normalizeTagList(row.tags);
      normalizedTags.forEach((tag) => usedTagNames.add(tag));
      if (areTagListsExactlyEqual(row.tags, normalizedTags)) return null;
      return supabase
        .from("marketing_opportunities")
        .update({ tags: normalizedTags, updated_at: now })
        .eq("id", row.id)
        .eq("company_id", companyId);
    })
    .filter(Boolean);

  const updateResults = await Promise.all([...contactUpdates, ...opportunityUpdates]);
  const updateError = updateResults.find((result) => result?.error)?.error;
  if (updateError) throw updateError;

  const existingNames = new Set(existingTags.map((tag) => normalizeTagName(tag.name)));
  const missingTagNames = Array.from(usedTagNames).filter((tag) => !existingNames.has(tag));

  if (missingTagNames.length > 0) {
    const { error } = await supabase
      .from("marketing_tags")
      .upsert(
        missingTagNames.map((name) => ({ company_id: companyId, name, color: DEFAULT_TAG_COLOR })),
        { onConflict: "company_id,name", ignoreDuplicates: true },
      );
    if (error) throw error;
  }

  return {
    normalizedContacts: contactUpdates.length,
    normalizedOpportunities: opportunityUpdates.length,
    createdTags: missingTagNames.length,
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

  const tagNames = useMemo(() => normalizeTagList(tags.map((tag) => tag.name)), [tags]);

  const {
    data: usageByName = {},
    isLoading: isUsageLoading,
    isError: isUsageError,
    error: usageError,
    refetch: refetchUsage,
  } = useQuery({
    queryKey: [...queryKeys.marketingTags.list(companyId), "usage", tagNames],
    queryFn: async () => {
      if (!companyId || tags.length === 0) return {};
      return getTagUsageMap(companyId, tags.map((tag) => tag.name));
    },
    enabled: !!companyId && tags.length > 0,
  });

  const normalizedNewTag = normalizeTagName(newTag);
  const filteredTags = useMemo(() => {
    const term = normalizeTagName(search);
    if (!term) return tags;
    return tags.filter((tag) => normalizeTagName(tag.name).includes(term));
  }, [search, tags]);
  const deleteTag = tags.find((item) => item.id === deleteId) ?? null;
  const deleteUsage = deleteTag ? usageByName[normalizeTagName(deleteTag.name)] : undefined;

  const usageSummary = useMemo(() => {
    return tags.reduce(
      (summary, tag) => {
        const usage = usageByName[normalizeTagName(tag.name)];
        const contacts = usage?.contacts ?? 0;
        const opportunities = usage?.opportunities ?? 0;
        summary.contacts += contacts;
        summary.opportunities += opportunities;
        if (contacts + opportunities === 0) summary.unused += 1;
        return summary;
      },
      { total: tags.length, contacts: 0, opportunities: 0, unused: 0 },
    );
  }, [tags, usageByName]);

  const invalidateTagQueries = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.marketingTags.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.tags.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
    queryClient.invalidateQueries({ queryKey: ["marketing-filter-data"] });
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

      const currentNormalizedName = normalizeTagName(currentName);
      const usage = usageByName[currentNormalizedName] ?? await getTagUsageCounts(companyId, currentNormalizedName);
      if (normalizedName !== currentNormalizedName && getUsageTotal(usage) > 0) {
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
      setEditName("");
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
      setDeleteId(null);
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

  const repairMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non disponibile");
      return repairMarketingTagLinks(companyId, tags);
    },
    onSuccess: (result) => {
      invalidateTagQueries();
      toast.success("Tag CRM sincronizzati", {
        description: `${result.createdTags} tag creati, ${result.normalizedContacts} contatti e ${result.normalizedOpportunities} opportunità ripuliti.`,
      });
    },
    onError: (e: unknown) => {
      toast.error("Sincronizzazione tag non riuscita", {
        description: getTagErrorMessage(e) || "Controlla i permessi e riprova.",
      });
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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Tag className="h-6 w-6" />
            Tag
          </h2>
          <p className="text-muted-foreground mt-1 max-w-3xl">
            Gestisci le etichette usate da contatti, opportunità, segmenti e automazioni. Qui puoi tenerle coerenti e disponibili in tutti i selettori CRM.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => repairMutation.mutate()}
          disabled={!companyId || repairMutation.isPending || isLoading}
          className="gap-2 lg:mt-1"
        >
          <RefreshCw className={cn("h-4 w-4", repairMutation.isPending && "animate-spin")} />
          {repairMutation.isPending ? "Sincronizzo..." : "Ripara collegamenti"}
        </Button>
      </div>

      {!companyId && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Azienda non selezionata</AlertTitle>
          <AlertDescription>Seleziona un'azienda per gestire e sincronizzare i tag CRM.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Tag catalogo", value: usageSummary.total, helper: "disponibili nei selettori" },
          { label: "Usi su contatti", value: usageSummary.contacts, helper: "collegamenti CRM letti" },
          { label: "Usi su opportunità", value: usageSummary.opportunities, helper: "pipeline e trattative" },
          { label: "Tag non usati", value: usageSummary.unused, helper: "pronti da pulire" },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">{item.label}</p>
              {isLoading || isUsageLoading ? (
                <Skeleton className="mt-2 h-7 w-16" />
              ) : (
                <p className="mt-2 text-2xl font-semibold">{item.value}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{item.helper}</p>
            </CardContent>
          </Card>
        ))}
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
                {addMutation.isPending ? "Aggiungo..." : "Aggiungi"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative max-w-md md:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca tag..."
            className="pl-9"
          />
        </div>
        {isUsageError && (
          <Button type="button" variant="outline" size="sm" onClick={() => refetchUsage()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Ricalcola utilizzi
          </Button>
        )}
      </div>

      {isUsageError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Utilizzi non aggiornati</AlertTitle>
          <AlertDescription>
            {getTagErrorMessage(usageError) || "Non è stato possibile leggere i collegamenti con contatti e opportunità."}
          </AlertDescription>
        </Alert>
      )}

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
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : tags.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nessun tag creato. Aggiungi il primo tag qui sopra.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table className="min-w-[620px]">
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
                  const usage = usageByName[normalizeTagName(tag.name)];
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
              {editTag && getUsageTotal(usageByName[normalizeTagName(editTag.name)]) > 0 && (
                <p className="text-xs text-amber-700">
                  Tag usato in {getUsageTotal(usageByName[normalizeTagName(editTag.name)])} elemento/i: il cambio nome verra bloccato.
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

      <AlertDialog open={!!deleteId} onOpenChange={(open) => {
        if (!open && !deleteMutation.isPending) setDeleteId(null);
      }}>
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
            <AlertDialogCancel disabled={deleteMutation.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                const tag = tags.find((item) => item.id === deleteId);
                if (tag) deleteMutation.mutate({ id: tag.id, name: tag.name });
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Elimino..." : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
