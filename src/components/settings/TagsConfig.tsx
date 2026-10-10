import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
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
import { Trash2, Plus, AlertCircle, Pencil, Search, Users, BriefcaseBusiness, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DEFAULT_TAG_COLOR,
  normalizeTagList,
  normalizeTagName,
  TAG_COLORS,
} from "@/lib/marketingTags";
import { leggiUsoTag, tagFuoriElenco, type UsoTag } from "@/lib/impostazioni/usoTag";
import { userErrorMessage } from "@/lib/userErrorMessage";

type MarketingTag = {
  id: string;
  company_id: string;
  name: string;
  color: string | null;
  created_at: string;
};

type TagUsageCounts = UsoTag;

/** Quanti tag fuori elenco si mostrano prima di «Mostra tutti»: la piattaforma ne ha oltre 200. */
const FUORI_ELENCO_VISIBILI = 20;

/** Come si chiamano i colori dei tag, per chi non li vede (lettore di schermo). */
const NOMI_COLORI: Record<string, string> = {
  "#2563eb": "Blu",
  "#16a34a": "Verde",
  "#f97316": "Arancione",
  "#dc2626": "Rosso",
  "#9333ea": "Viola",
  "#0891b2": "Azzurro",
  "#ca8a04": "Giallo",
  "#475569": "Grigio",
};
const nomeColore = (colore: string) => NOMI_COLORI[colore.toLowerCase()] ?? colore;
/** 21880 → «21.880». */
const num = (n: number) => n.toLocaleString("it-IT");

class TagInUseError extends Error {
  usage: TagUsageCounts;

  constructor(usage: TagUsageCounts) {
    super("TAG_IN_USE");
    this.name = "TagInUseError";
    this.usage = usage;
  }
}

/** Non si riesce a sapere se il tag è usato (l'elenco dei tag dei contatti è incompleto): meglio non toccarlo. */
class UsoNonVerificabileError extends Error {
  constructor() {
    super("USO_NON_VERIFICABILE");
    this.name = "UsoNonVerificabileError";
  }
}

function getTagErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "";
}

function getUsageTotal(usage?: TagUsageCounts) {
  return (usage?.contatti ?? 0) + (usage?.opportunita ?? 0);
}

/**
 * Quanti contatti e opportunità hanno QUESTO tag, letti adesso (la guardia di eliminazione e di rinomina non si
 * fida di quello che la pagina mostrava qualche minuto fa).
 */
async function getTagUsageCounts(companyId: string, tagName: string): Promise<TagUsageCounts> {
  const normalizedName = normalizeTagName(tagName);
  const { uso, elencoContattiIncompleto } = await leggiUsoTag(companyId);
  const trovato = uso[normalizedName];
  if (!trovato && elencoContattiIncompleto) throw new UsoNonVerificabileError();
  return trovato ?? { contatti: 0, opportunita: 0 };
}

export function TagsConfig() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();
  const canEdit = !permissions.isLoading && (permissions.isAdmin || permissions.canEditSettingsCustomization);
  const queryClient = useQueryClient();
  const [newTag, setNewTag] = useState("");
  const [newColor, setNewColor] = useState<string>(DEFAULT_TAG_COLOR);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editTag, setEditTag] = useState<MarketingTag | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string>(DEFAULT_TAG_COLOR);
  const [addMissingOpen, setAddMissingOpen] = useState(false);
  const [mostraTuttiFuori, setMostraTuttiFuori] = useState(false);
  const confermaUscita = useSettingsDraftGuard(canEdit && (!!newTag.trim() || (!!editTag && (editName !== editTag.name || editColor !== (editTag.color || DEFAULT_TAG_COLOR)))));

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

  // Quanti contatti e opportunità usano ogni tag, anche quelli che non sono nell'elenco. Non dipende dall'elenco:
  // una azienda con l'elenco vuoto ma i contatti già taggati (importazioni, automazioni) vede comunque cosa c'è.
  const {
    data: lettura,
    isLoading: isUsageLoading,
    isError: isUsageError,
    error: usageError,
    refetch: refetchUsage,
  } = useQuery({
    queryKey: [...queryKeys.marketingTags.list(companyId), "uso"],
    queryFn: () => leggiUsoTag(companyId!),
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });
  const usageByName = useMemo(() => lettura?.uso ?? {}, [lettura]);

  const normalizedNewTag = normalizeTagName(newTag);
  const usageKnown = !!companyId && !isLoading && !isError && !isUsageLoading && !isUsageError;
  const filteredTags = useMemo(() => {
    const term = normalizeTagName(search);
    if (!term) return tags;
    return tags.filter((tag) => normalizeTagName(tag.name).includes(term));
  }, [search, tags]);
  const deleteTag = tags.find((item) => item.id === deleteId) ?? null;
  const deleteUsage = deleteTag ? usageByName[normalizeTagName(deleteTag.name)] : undefined;

  // Tag che i contatti e le opportunità hanno già ma che non sono nell'elenco (importazioni, automazioni, moduli).
  const fuoriElenco = useMemo(() => (usageKnown ? tagFuoriElenco(usageByName, tags) : []), [usageKnown, usageByName, tags]);
  const fuoriElencoFiltrati = useMemo(() => {
    const term = normalizeTagName(search);
    return term ? fuoriElenco.filter((tag) => tag.nome.includes(term)) : fuoriElenco;
  }, [search, fuoriElenco]);
  const fuoriElencoMostrati = mostraTuttiFuori ? fuoriElencoFiltrati : fuoriElencoFiltrati.slice(0, FUORI_ELENCO_VISIBILI);
  const nonUsati = useMemo(
    () => tags.filter((tag) => getUsageTotal(usageByName[normalizeTagName(tag.name)]) === 0).length,
    [tags, usageByName],
  );

  const invalidateTagQueries = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.marketingTags.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.tags.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
    queryClient.invalidateQueries({ queryKey: ["marketing-filter-data"] });
  };

  const addMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      if (!canEdit || isLoading || isError) throw new Error("Modifica dei tag non disponibile");
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
        toast.error("Non sono riuscito ad aggiungere il tag", { description: userErrorMessage(e, "Riprova tra poco.") });
      }
    },
  });

  // Mette nell'elenco i tag che i contatti e le opportunità hanno già. Scrive SOLO nell'elenco dei tag: non cambia
  // nessun contatto né nessuna opportunità (prima «Ripara collegamenti» riscriveva anche quelli, fino a mille alla volta).
  const addMissingMutation = useMutation({
    mutationFn: async (names: string[]) => {
      if (!canEdit || isLoading || isError) throw new Error("Modifica dei tag non disponibile");
      if (!companyId) throw new Error("Azienda non disponibile");
      const known = new Set(tags.map((tag) => normalizeTagName(tag.name)));
      const toAdd = normalizeTagList(names).filter((name) => !known.has(name));
      if (toAdd.length === 0) return 0;
      const { error } = await supabase
        .from("marketing_tags")
        .upsert(
          toAdd.map((name) => ({ company_id: companyId, name, color: DEFAULT_TAG_COLOR })),
          { onConflict: "company_id,name", ignoreDuplicates: true },
        );
      if (error) throw error;
      return toAdd.length;
    },
    onSuccess: (added) => {
      invalidateTagQueries();
      setAddMissingOpen(false);
      toast.success(added === 1 ? "Tag aggiunto all'elenco" : `${added} tag aggiunti all'elenco`);
    },
    onError: (e: unknown) => {
      toast.error("Non sono riuscito ad aggiungere i tag", {
        description: userErrorMessage(e, "Controlla i permessi e riprova."),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, currentName, nextName, color }: { id: string; currentName: string; nextName: string; color: string }) => {
      if (!canEdit || isLoading || isError) throw new Error("Modifica dei tag non disponibile");
      if (!companyId) throw new Error("Azienda non disponibile");
      const normalizedName = normalizeTagName(nextName);
      if (!normalizedName) throw new Error("Inserisci un nome tag valido");
      if (tags.some((tag) => tag.id !== id && normalizeTagName(tag.name) === normalizedName)) {
        throw new Error("DUPLICATE_TAG");
      }

      const currentNormalizedName = normalizeTagName(currentName);
      // Solo se il nome cambia serve sapere se il tag è usato; per il solo colore non si legge niente.
      if (normalizedName !== currentNormalizedName) {
        const usage = usageByName[currentNormalizedName] ?? await getTagUsageCounts(companyId, currentNormalizedName);
        if (getUsageTotal(usage) > 0) throw new TagInUseError(usage);
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
        toast.error("Il nome di un tag già usato non si può cambiare. Puoi cambiare solo il colore.");
        return;
      }
      if (e instanceof UsoNonVerificabileError) {
        toast.error("Non riesco a controllare se il tag è usato, quindi non cambio il nome. Cambia solo il colore.");
        return;
      }
      const message = getTagErrorMessage(e);
      const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
      if (message.includes("DUPLICATE_TAG") || message.includes("duplicate") || code === "23505") {
        toast.error("Tag già esistente");
      } else {
        toast.error("Non sono riuscito ad aggiornare il tag", { description: userErrorMessage(e, "Riprova tra poco.") });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      if (!canEdit || isLoading || isError) throw new Error("Modifica dei tag non disponibile");
      if (!companyId) throw new Error("Azienda non disponibile");

      // Letto adesso e per tutta l'azienda (oltre le mille righe di una risposta): è la guardia che impedisce di
      // eliminare un tag che contatti o opportunità hanno ancora.
      const usage = await getTagUsageCounts(companyId, name);
      if (usage.contatti > 0 || usage.opportunita > 0) {
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
        const total = e.usage.contatti + e.usage.opportunita;
        toast.error(`Questo tag è ancora su ${num(total)} ${total === 1 ? "contatto o opportunità" : "tra contatti e opportunità"}: toglilo da lì e riprova.`);
        return;
      }
      if (e instanceof UsoNonVerificabileError) {
        toast.error("Non riesco a controllare se il tag è usato, quindi non lo elimino.");
        return;
      }

      toast.error("Non sono riuscito a eliminare il tag", { description: userErrorMessage(e, "Riprova tra poco.") });
    },
  });

  const handleAdd = () => {
    if (!canEdit || isLoading || isError || !companyId || !normalizedNewTag || addMutation.isPending) return;
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

  const editUsage = editTag ? getUsageTotal(usageByName[normalizeTagName(editTag.name)]) : 0;

  return (
    <div className="space-y-6">
      {!canEdit && (
        <p role="status" className="text-sm text-muted-foreground">
          Stai solo consultando: per cambiare i tag serve il permesso «Branding &amp; Template» in modifica (o essere amministratore).
        </p>
      )}

      {!companyId && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Azienda non selezionata</AlertTitle>
          <AlertDescription>Seleziona un'azienda per gestire i tag.</AlertDescription>
        </Alert>
      )}

      {/* Una riga al posto di quattro riquadri: quanti tag e quanti non usati. */}
      {(isLoading || isError || tags.length > 0 || fuoriElenco.length > 0) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            {isLoading || (!isError && isUsageLoading) ? (
              <Skeleton className="h-5 w-48" />
            ) : (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                <span className="font-medium text-foreground">{isError ? "–" : tags.length}</span> tag
                {usageKnown ? (
                  <> · <span className="font-medium text-foreground">{nonUsati}</span> non usati</>
                ) : (
                  <> · non riesco a contare quanti sono usati</>
                )}
              </p>
            )}
            {usageKnown && fuoriElenco.length > 0 && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Altri {fuoriElenco.length}{lettura?.elencoContattiIncompleto ? " (o più)" : ""} tag sono sui contatti o sulle opportunità ma non in questo elenco.
              </p>
            )}
          </div>
          {canEdit && usageKnown && fuoriElenco.length > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddMissingOpen(true)}
              disabled={!companyId || addMissingMutation.isPending || isLoading || isError}
              size="sm" className="h-11 gap-2 self-start sm:h-9"
            >
              <RefreshCw className={cn("h-4 w-4", addMissingMutation.isPending && "animate-spin")} />
              {addMissingMutation.isPending ? "Aggiungo…" : "Aggiungi i tag mancanti"}
            </Button>
          )}
        </div>
      )}

      {canEdit && <Card>
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
                aria-describedby="new-tag-aiuto"
                disabled={!companyId || isLoading || isError || addMutation.isPending}
              />
              <p id="new-tag-aiuto" className="text-xs text-muted-foreground">
                Maiuscole e spazi vengono uniformati: «Cliente caldo» e «cliente  caldo» sono lo stesso tag.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Colore del nuovo tag">
              {TAG_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  disabled={isLoading || isError || addMutation.isPending}
                  aria-label={`Colore ${nomeColore(color)}`}
                  aria-pressed={newColor === color}
                  onClick={() => setNewColor(color)}
                  className={cn(
                    "h-11 w-11 rounded-full border-2 transition sm:h-8 sm:w-8",
                    newColor === color ? "border-foreground" : "border-transparent",
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
              <Button size="sm" className="h-11 sm:h-9" onClick={handleAdd} disabled={!companyId || !normalizedNewTag || isLoading || isError || addMutation.isPending}>
                <Plus className="h-4 w-4 mr-1" />
                {addMutation.isPending ? "Aggiungo…" : "Aggiungi"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative max-w-md md:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca tag…"
            aria-label="Cerca tag"
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
            {userErrorMessage(usageError, "Non è stato possibile contare dove sono usati i tag.")}
          </AlertDescription>
        </Alert>
      )}

      {isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Tag non disponibili</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{userErrorMessage(error, "Non è stato possibile caricare i tag dell'azienda.")}</p>
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
        <p className="text-muted-foreground text-sm">
          {fuoriElenco.length > 0
            ? "L'elenco è vuoto, ma i tuoi contatti hanno già dei tag (sotto)."
            : "Nessun tag creato. Aggiungi il primo tag qui sopra."}
        </p>
      ) : (
        <div className="rounded-lg border">
          <Table className="block md:table">
            <TableHeader className="hidden md:table-header-group">
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead className="w-[180px]">Su quanti</TableHead>
                <TableHead className="w-[120px] text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="block md:table-row-group">
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
                    <TableRow key={tag.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center md:table-row">
                      <TableCell className="col-span-2 min-w-0 md:w-auto">
                        <Badge variant="secondary" className="max-w-full break-words whitespace-normal gap-2 px-3 py-1.5 text-sm">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color || DEFAULT_TAG_COLOR }} />
                          {tag.name}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {isUsageError ? <span className="text-xs text-muted-foreground">Utilizzi non disponibili</span> : isUsageLoading ? (
                          <span className="text-sm text-muted-foreground">Calcolo…</span>
                        ) : (
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1" title="Contatti"><Users className="h-3 w-3" aria-hidden="true" /> <span className="sr-only">Contatti: </span>{num(usage?.contatti ?? 0)}</span>
                            <span className="inline-flex items-center gap-1" title="Opportunità"><BriefcaseBusiness className="h-3 w-3" aria-hidden="true" /> <span className="sr-only">Opportunità: </span>{num(usage?.opportunita ?? 0)}</span>
                            {totalUsage > 0 && <Badge variant="outline">{num(totalUsage)} tot.</Badge>}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {canEdit && <>
                        <Button type="button" variant="ghost" size="icon" className="h-11 w-11 sm:h-10 sm:w-10" onClick={() => openEdit(tag)} aria-label={`Modifica tag ${tag.name}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-11 w-11 sm:h-10 sm:w-10" disabled={!usageKnown} onClick={() => setDeleteId(tag.id)} aria-label={`Elimina tag ${tag.name}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        </>}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* I tag che i contatti e le opportunità hanno già ma che non sono nell'elenco. */}
      {usageKnown && fuoriElencoFiltrati.length > 0 && (
        <section aria-labelledby="tag-fuori-elenco" className="space-y-2">
          <div>
            <h2 id="tag-fuori-elenco" className="text-base font-semibold">Tag usati ma non in elenco</h2>
            <p className="text-sm text-muted-foreground">
              Arrivano da importazioni, automazioni e moduli. Aggiungili all'elenco per sceglierli dai selettori e dare loro un colore.
            </p>
          </div>
          <ul className="divide-y rounded-lg border">
            {fuoriElencoMostrati.map((tag) => (
              <li key={tag.nome} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge variant="outline" className="max-w-full break-words whitespace-normal px-3 py-1 text-sm">{tag.nome}</Badge>
                  <span className="text-xs text-muted-foreground">Non in elenco</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1" title="Contatti"><Users className="h-3 w-3" aria-hidden="true" /> <span className="sr-only">Contatti: </span>{num(tag.contatti)}</span>
                    <span className="inline-flex items-center gap-1" title="Opportunità"><BriefcaseBusiness className="h-3 w-3" aria-hidden="true" /> <span className="sr-only">Opportunità: </span>{num(tag.opportunita)}</span>
                  </div>
                  {canEdit && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-11 sm:h-9"
                      disabled={addMissingMutation.isPending}
                      onClick={() => addMissingMutation.mutate([tag.nome])}
                      aria-label={`Aggiungi all'elenco il tag ${tag.nome}`}
                    >
                      Aggiungi all'elenco
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {!mostraTuttiFuori && fuoriElencoFiltrati.length > FUORI_ELENCO_VISIBILI && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setMostraTuttiFuori(true)}>
              Mostra tutti ({fuoriElencoFiltrati.length})
            </Button>
          )}
        </section>
      )}

      <Dialog open={!!editTag} onOpenChange={(open) => { if (!open && !updateMutation.isPending && confermaUscita()) setEditTag(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica tag</DialogTitle>
            <DialogDescription>
              Il colore lo puoi cambiare quando vuoi. Il nome solo se il tag non è su nessun contatto o opportunità.
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
                aria-describedby={editUsage > 0 ? "edit-tag-bloccato" : undefined}
                disabled={updateMutation.isPending}
              />
              {editTag && editUsage > 0 && (
                <p id="edit-tag-bloccato" className="text-xs text-amber-700 dark:text-amber-400">
                  Questo tag è su {num(editUsage)} {editUsage === 1 ? "contatto o opportunità" : "tra contatti e opportunità"}: per rinominarlo toglilo prima da lì.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label id="edit-tag-colore">Colore</Label>
              <div className="flex flex-wrap gap-2" role="group" aria-labelledby="edit-tag-colore">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Colore ${nomeColore(color)}`}
                    aria-pressed={editColor === color}
                    onClick={() => setEditColor(color)}
                    className={cn(
                      "h-11 w-11 rounded-full border-2 transition sm:h-8 sm:w-8",
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
            <Button type="button" variant="outline" disabled={updateMutation.isPending} onClick={() => { if (confermaUscita()) setEditTag(null); }}>Annulla</Button>
            <Button
              type="button"
              disabled={!canEdit || !editTag || !normalizeTagName(editName) || updateMutation.isPending}
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
            <AlertDialogTitle>Eliminare il tag?</AlertDialogTitle>
            <AlertDialogDescription>
              Si può eliminare solo un tag che non è su nessun contatto o opportunità.
              {deleteTag && (
                <span className="mt-2 block">
                  Ora: {num(deleteUsage?.contatti ?? 0)} contatti, {num(deleteUsage?.opportunita ?? 0)} opportunità.
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
              {deleteMutation.isPending ? "Elimino…" : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={addMissingOpen} onOpenChange={setAddMissingOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aggiungere i tag mancanti?</AlertDialogTitle>
            <AlertDialogDescription>
              Alcuni contatti e opportunità hanno tag che non sono in questo elenco (arrivano da importazioni e
              automazioni). Li aggiungo all'elenco; maiuscole e spazi vengono uniformati. Non cancello nessun tag e non
              cambio i contatti. Questa operazione modifica i dati dell'azienda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canEdit || isError || addMissingMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                addMissingMutation.mutate(fuoriElenco.map((tag) => tag.nome));
              }}
            >
              Sì, aggiungili
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
