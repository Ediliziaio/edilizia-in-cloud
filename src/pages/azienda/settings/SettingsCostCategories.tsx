/**
 * /azienda/impostazioni/categorie-costi
 *
 * L'elenco delle categorie con cui si dividono i costi (affitto, utenze, marketing…).
 *   - Una categoria ha solo il nome. Il colore non lo leggeva nessun'altra parte dell'app e non c'è più: la pagina
 *     non lo mostra e non lo scrive (le categorie che ce l'hanno nel database restano com'erano).
 *   - Ricerca, filtri e ordinamento compaiono da 11 categorie in su: sotto, basta l'elenco.
 *   - Una categoria già usata nei costi non si rinomina e non si elimina (storico, marginalità e report).
 *   - «Importa da costi e fornitori» aggiunge le categorie usate ma mancanti dall'elenco, senza toccare i costi.
 *   - La modifica segue la visibilità di «Costi» (modificaSegueVisibilita): in sola lettura non ci sono comandi.
 *   - Gli errori sono sempre in italiano: mai il testo del database.
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import { escapeCsvCell } from "@/lib/csvExport";
import { userErrorMessage } from "@/lib/userErrorMessage";
import {
  Plus, Pencil, Trash2, Download, FolderOpen, Search, X, AlertTriangle, FileDown, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";
import { puoModificareCosti } from "@/lib/permessi/modificaSegueVisibilita";
import { AvvisoSolaLettura } from "@/components/common/AvvisoSolaLettura";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";

interface CostCategory {
  id: string;
  company_id: string;
  name: string;
  /** Non lo legge né lo scrive più la pagina: nel database resta com'era. */
  color: string | null;
  created_at: string;
}

type UsageFilter = "all" | "used" | "unused";
type SortMode = "name" | "usage_desc" | "usage_asc";

/** Da quante categorie compaiono ricerca, filtri e ordinamento: sotto, l'elenco si legge tutto d'un colpo. */
const SOGLIA_STRUMENTI = 11;

/** Un errore che la pagina ha già scritto in italiano: si mostra com'è. Tutto il resto passa da userErrorMessage. */
class ErroreCategoria extends Error {}

function messaggioErrore(errore: unknown, ripiego: string): string {
  return errore instanceof ErroreCategoria ? errore.message : userErrorMessage(errore, ripiego);
}

function normalizeCategoryName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function categoryKey(name: string) {
  return normalizeCategoryName(name).toLowerCase();
}

export default function SettingsCostCategories() {
  const isMobile = useIsMobile();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  // La modifica segue la visibilità (migration 20280921220000, 21/09/2026):
  // chi ha «Costi» in vista e non è in sola lettura può anche scrivere qui.
  // Prima la pagina non controllava nessun permesso: chiunque riuscisse ad
  // aprirla (route su canViewCosts) vedeva i pulsanti, e il database prima
  // d'oggi li accettava solo dall'amministratore — un bottone finto.
  const permissions = usePermissions();
  const puoModificare = !permissions.isLoading && puoModificareCosti(permissions);

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [importOpen, setImportOpen] = useState(false);

  const {
    data: categories = [],
    isLoading,
    isError: categoriesIsError,
    error: categoriesError,
    refetch: refetchCategories,
  } = useQuery({
    queryKey: queryKeys.costCategories.list(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cost_categories")
        .select("*")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CostCategory[];
    },
    enabled: !!companyId,
  });

  // Conteggio utilizzi per ogni nome di categoria (company_costs.category = stringa)
  const {
    data: usageCounts = {},
    isLoading: usageLoading,
    isError: usageIsError,
    error: usageError,
    refetch: refetchUsage,
  } = useQuery<Record<string, number>>({
    queryKey: queryKeys.costCategories.usage(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_costs")
        .select("category")
        .eq("company_id", companyId!)
        .not("category", "is", null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((c) => {
        const cat = (c as { category: string | null }).category;
        const normalized = cat ? normalizeCategoryName(cat) : "";
        if (normalized) counts[normalized] = (counts[normalized] ?? 0) + 1;
      });
      return counts;
    },
    enabled: !!companyId,
  });
  const usageKnown = !usageLoading && !usageIsError && !!companyId;
  const canWrite = puoModificare && !isLoading && !categoriesIsError && !!companyId;
  const mostraStrumenti = categories.length >= SOGLIA_STRUMENTI;

  const configuredCategoryKeys = useMemo(() => new Set(categories.map((category) => categoryKey(category.name))), [categories]);

  const historicalMissingCategories = useMemo(() => {
    return Object.entries(usageCounts)
      .filter(([name]) => !configuredCategoryKeys.has(categoryKey(name)))
      .sort(([a], [b]) => a.localeCompare(b, "it"));
  }, [configuredCategoryKeys, usageCounts]);

  // Elenco mostrato. Sotto la soglia i filtri non si vedono: quelli rimasti da prima (per esempio dopo aver
  // eliminato delle categorie) non devono nascondere righe senza che ci sia un comando per toglierli.
  const filtered = useMemo(() => {
    if (!mostraStrumenti) return [...categories].sort((a, b) => a.name.localeCompare(b.name, "it"));
    let list = categories;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
    if (usageKnown && usageFilter === "used") {
      list = list.filter((c) => (usageCounts[normalizeCategoryName(c.name)] ?? 0) > 0);
    } else if (usageKnown && usageFilter === "unused") {
      list = list.filter((c) => (usageCounts[normalizeCategoryName(c.name)] ?? 0) === 0);
    }
    return [...list].sort((a, b) => {
      const usageA = usageCounts[normalizeCategoryName(a.name)] ?? 0;
      const usageB = usageCounts[normalizeCategoryName(b.name)] ?? 0;
      if (usageKnown && sortMode === "usage_desc") return usageB - usageA || a.name.localeCompare(b.name, "it");
      if (usageKnown && sortMode === "usage_asc") return usageA - usageB || a.name.localeCompare(b.name, "it");
      return a.name.localeCompare(b.name, "it");
    });
  }, [categories, mostraStrumenti, search, usageFilter, sortMode, usageCounts, usageKnown]);

  // Una riga sola al posto delle tre tessere: quante sono e quante servono davvero.
  const riepilogo = useMemo(() => {
    if (isLoading || categoriesIsError || categories.length === 0) return null;
    const quante = categories.length === 1 ? "1 categoria" : `${categories.length} categorie`;
    if (!usageKnown) return quante;
    const usate = categories.filter((c) => (usageCounts[normalizeCategoryName(c.name)] ?? 0) > 0).length;
    return `${quante} · ${usate} ${usate === 1 ? "usata" : "usate"} nei costi`;
  }, [categories, usageCounts, usageKnown, isLoading, categoriesIsError]);

  // ─── Mutations ────────────────────────────────────────
  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.costCategories.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.companyCosts.all });
  }, [queryClient]);

  const addMutation = useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      if (!canWrite) throw new ErroreCategoria("Modifica categorie non disponibile");
      if (!companyId) throw new ErroreCategoria("Azienda non selezionata");
      const safeName = normalizeCategoryName(name);
      if (!safeName) throw new ErroreCategoria("Inserisci il nome categoria");
      // Solo azienda e nome: il colore non si scrive più (nel database resta vuoto).
      const { error } = await supabase.from("cost_categories").insert({
        company_id: companyId!,
        name: safeName,
      });
      if (error) {
        if (error.code === "23505") throw new ErroreCategoria("Categoria già esistente");
        throw error;
      }
    },
    onSuccess: () => {
      invalidateAll();
      setNewName("");
      toast.success("Categoria aggiunta");
    },
    onError: (e: unknown) =>
      toast.error(messaggioErrore(e, "Non sono riuscito ad aggiungere la categoria. Riprova.")),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      if (!canWrite) throw new ErroreCategoria("Modifica categorie non disponibile");
      if (!companyId) throw new ErroreCategoria("Azienda non selezionata");
      const current = categories.find((category) => category.id === id);
      const safeName = normalizeCategoryName(name);
      if (!safeName) throw new ErroreCategoria("Inserisci il nome categoria");
      if (!current) throw new ErroreCategoria("Categoria non trovata: ricarica i dati");
      if (!usageKnown && categoryKey(current.name) !== categoryKey(safeName)) throw new ErroreCategoria("Utilizzi non disponibili: non puoi ancora rinominare la categoria");
      if (current && categoryKey(current.name) !== categoryKey(safeName) && (usageCounts[normalizeCategoryName(current.name)] ?? 0) > 0) {
        throw new ErroreCategoria("Categoria già usata nei costi: il nome non si può cambiare.");
      }
      const { error } = await supabase
        .from("cost_categories")
        .update({ name: safeName })
        .eq("id", id)
        .eq("company_id", companyId).select("id").single();
      if (error) {
        if (error.code === "23505") throw new ErroreCategoria("Categoria già esistente");
        throw error;
      }
    },
    onSuccess: () => {
      invalidateAll();
      setEditingId(null);
      toast.success("Categoria aggiornata");
    },
    onError: (e: unknown) =>
      toast.error(messaggioErrore(e, "Non sono riuscito ad aggiornare la categoria. Riprova.")),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!canWrite || !usageKnown) throw new ErroreCategoria("Eliminazione non disponibile: verifica categorie e utilizzi");
      if (!companyId) throw new ErroreCategoria("Azienda non selezionata");
      const category = categories.find((cat) => cat.id === id);
      if (!category) throw new ErroreCategoria("Categoria non trovata: ricarica i dati");
      const usage = category ? usageCounts[normalizeCategoryName(category.name)] ?? 0 : 0;
      if (usage > 0) {
        throw new ErroreCategoria("Categoria già usata: eliminazione bloccata per proteggere costi storici, marginalità e report.");
      }
      const { error } = await supabase
        .from("cost_categories")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId).select("id").single();
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      setDeleteId(null);
      toast.success("Categoria eliminata");
    },
    onError: (e: unknown) =>
      toast.error(messaggioErrore(e, "Non sono riuscito a eliminare la categoria. Riprova.")),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!canWrite) throw new ErroreCategoria("Importazione non disponibile");
      if (!companyId) throw new ErroreCategoria("Azienda non selezionata");

      const { data: costs, error: costsError } = await supabase
        .from("company_costs")
        .select("category")
        .eq("company_id", companyId!)
        .not("category", "is", null);
      if (costsError) throw costsError;

      const { data: supplierData, error: suppliersError } = await supabase
        .from("suppliers")
        .select("product_category")
        .eq("company_id", companyId!)
        .not("product_category", "is", null);
      if (suppliersError) throw suppliersError;

      const cats = new Set<string>();
      (costs ?? []).forEach((c) => {
        const cat = (c as { category: string | null }).category;
        const normalized = cat ? normalizeCategoryName(cat) : "";
        if (normalized) cats.add(normalized);
      });
      (supplierData ?? []).forEach((s) => {
        const cat = (s as { product_category: string | null }).product_category;
        const normalized = cat ? normalizeCategoryName(cat) : "";
        if (normalized) cats.add(normalized);
      });

      if (cats.size === 0) {
        throw new ErroreCategoria("Nessuna categoria trovata nei costi o fornitori");
      }

      const existing = new Set(categories.map((c) => categoryKey(c.name)));
      // Solo azienda e nome, come l'aggiunta a mano: niente colore a caso.
      const toInsert = Array.from(cats)
        .filter((name) => !existing.has(categoryKey(name)))
        .map((name) => ({
          company_id: companyId!,
          name,
        }));

      if (toInsert.length === 0) {
        throw new ErroreCategoria("Tutte le categorie sono già importate");
      }

      const { error } = await supabase.from("cost_categories").insert(toInsert);
      if (error) throw error;
      return toInsert.length;
    },
    onSuccess: (count) => {
      invalidateAll();
      setImportOpen(false);
      toast.success(`${count} ${count === 1 ? "categoria importata" : "categorie importate"}`);
    },
    onError: (e: unknown) =>
      toast.error(messaggioErrore(e, "Importazione non riuscita: controlla i dati e riprova")),
  });
  const busy = addMutation.isPending || updateMutation.isPending || deleteMutation.isPending || importMutation.isPending;
  const confermaUscita = useSettingsDraftGuard(!!newName.trim() || !!editingId || busy);

  const handleAdd = useCallback(() => {
    if (!canWrite || busy || !newName.trim()) return;
    const normalizedName = categoryKey(newName);
    if (categories.some((category) => categoryKey(category.name) === normalizedName)) {
      toast.error("Categoria già esistente");
      return;
    }
    addMutation.mutate({ name: newName });
  }, [newName, addMutation, categories, canWrite, busy]);

  const startEdit = useCallback((cat: CostCategory) => {
    if (!canWrite || busy || !confermaUscita()) return;
    setEditingId(cat.id);
    setEditName(cat.name);
  }, [canWrite, busy, confermaUscita]);

  const saveEdit = useCallback(
    (id: string) => {
      if (!canWrite || busy || !editName.trim()) return;
      const normalizedName = categoryKey(editName);
      if (
        categories.some(
          (category) => category.id !== id && categoryKey(category.name) === normalizedName,
        )
      ) {
        toast.error("Categoria già esistente");
        return;
      }
      // Il nome è lo stesso (una categoria già usata ha il nome bloccato): niente da salvare. Si chiude la riga
      // senza scrivere e senza un «Categoria aggiornata» che non è vero.
      const current = categories.find((category) => category.id === id);
      if (current && normalizeCategoryName(current.name) === normalizeCategoryName(editName)) {
        setEditingId(null);
        return;
      }
      updateMutation.mutate({ id, name: editName });
    },
    [editName, updateMutation, categories, canWrite, busy],
  );

  const exportCategories = useCallback(() => {
    if (isLoading || categoriesIsError || !usageKnown) return;
    const rows = [
      ["Nome", "Utilizzi", "Protezione", "Configurata"],
      ...categories.map((category) => {
        const usage = usageCounts[normalizeCategoryName(category.name)] ?? 0;
        return [
          category.name,
          String(usage),
          usage > 0 ? "Protetta: in uso" : "Eliminabile: inutilizzata",
          "SI",
        ];
      }),
      ...historicalMissingCategories.map(([name, usage]) => [
        name,
        String(usage),
        "Storica: manca in configurazione",
        "NO",
      ]),
    ];
    const csv = rows
      .map((row) => row.map((value) => escapeCsvCell(value, ",")).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `categorie-costi-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success("File scaricato");
  }, [categories, historicalMissingCategories, usageCounts, isLoading, categoriesIsError, usageKnown]);

  // ─── Render ───────────────────────────────────────────
  const categoryToDelete = deleteId ? categories.find((c) => c.id === deleteId) : null;
  const deleteUsage = categoryToDelete ? usageCounts[normalizeCategoryName(categoryToDelete.name)] ?? 0 : 0;
  // Del motivo tecnico si mostra solo la frase italiana (rete, permessi…): il testo del database non si vede mai.
  const dettaglioErrore = categoriesIsError || usageIsError ? userErrorMessage(categoriesError ?? usageError, "") : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        {/* Titolo e icona li mette già la testata delle Impostazioni: qui la frase e, sotto, i numeri. */}
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-muted-foreground">
            Le categorie con cui dividi i costi (affitto, utenze, marketing…). Le scegli quando registri un costo e
            servono a leggerli nei report.
          </p>
          {riepilogo && <p className="text-sm font-medium">{riepilogo}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {puoModificare && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
              disabled={busy || !canWrite}
            >
              <Download className="h-4 w-4 mr-1.5" />
              {importMutation.isPending ? "Importo…" : "Importa da costi e fornitori"}
            </Button>
          )}
          {/* Niente export su telefono. */}
          {!isMobile && (
            <Button
              variant="outline"
              size="sm"
              onClick={exportCategories}
              disabled={isLoading || categoriesIsError || !usageKnown || (categories.length === 0 && historicalMissingCategories.length === 0)}
            >
              <FileDown className="h-4 w-4 mr-1.5" />
              Esporta CSV
            </Button>
          )}
        </div>
      </div>

      {(categoriesIsError || usageIsError) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Categorie costi non disponibili</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              Non riesco a caricare correttamente categorie o utilizzi. I dati potrebbero non essere completi.
            </p>
            {dettaglioErrore && <p className="text-xs">{dettaglioErrore}</p>}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchCategories();
                refetchUsage();
              }}
            >
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!categoriesIsError && usageKnown && historicalMissingCategories.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertTitle>Categorie usate nei costi ma non nell'elenco</AlertTitle>
          <AlertDescription>
            {historicalMissingCategories.length === 1
              ? "C'è 1 categoria usata nei costi ma non nell'elenco. Premi «Importa da costi e fornitori» per aggiungerla senza toccare i costi già registrati."
              : `Ci sono ${historicalMissingCategories.length} categorie usate nei costi ma non nell'elenco. Premi «Importa da costi e fornitori» per aggiungerle senza toccare i costi già registrati.`}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-5 space-y-4">
          {!puoModificare && (
            <AvvisoSolaLettura>
              Sola lettura: qui serve il permesso «Costi», e chi ce l&apos;ha in «Sola lettura» non può scrivere.
            </AvvisoSolaLettura>
          )}
          {/* Add form */}
          {puoModificare && (
          <fieldset disabled={busy || !canWrite} className="m-0 min-w-0 border-0 p-0 flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="new-cat-name" className="text-xs">Nuova categoria</Label>
              <Input
                id="new-cat-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="es. Affitto, Utenze, Marketing…"
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                maxLength={80}
              />
            </div>
            <Button
              onClick={handleAdd}
              disabled={!newName.trim() || addMutation.isPending}
              className="sm:self-end"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {addMutation.isPending ? "Aggiungo…" : "Aggiungi"}
            </Button>
          </fieldset>
          )}

          {/* Ricerca, filtri e ordinamento: solo quando l'elenco è lungo abbastanza da servire */}
          {mostraStrumenti && (
            <div className="space-y-3">
              <div className="flex flex-col lg:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cerca categoria…"
                    aria-label="Cerca una categoria"
                    className="pl-8 pr-8 h-9 text-sm"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
                      aria-label="Cancella la ricerca"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {([
                    ["all", "Tutte"],
                    ["used", "In uso"],
                    ["unused", "Inutilizzate"],
                  ] as const).map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={usageFilter === value ? "default" : "outline"}
                      onClick={() => setUsageFilter(value)}
                      disabled={value !== "all" && !usageKnown}
                    >
                      {label}
                    </Button>
                  ))}
                  <select
                    value={sortMode}
                    onChange={(event) => setSortMode(event.target.value as SortMode)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    aria-label="Ordina categorie"
                  >
                    <option value="name">Nome A-Z</option>
                    <option value="usage_desc" disabled={!usageKnown}>Più usate</option>
                    <option value="usage_asc" disabled={!usageKnown}>Meno usate</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Caricamento…</p>
          ) : categoriesIsError ? null : categories.length === 0 ? (
            <div className="py-10 text-center space-y-3 border border-dashed rounded-lg">
              <FolderOpen className="h-10 w-10 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">
                Nessuna categoria configurata.
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {puoModificare
                  ? "Aggiungine una qui sopra oppure premi «Importa da costi e fornitori» per creare le categorie già usate nei tuoi costi e fornitori."
                  : "Nessuna categoria creata finora."}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Nessuna categoria corrisponde ai filtri attivi.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setSearch("");
                  setUsageFilter("all");
                  setSortMode("name");
                }}
              >
                Mostra tutte
              </Button>
            </div>
          ) : (
            <Table className="block md:table">
              <TableHeader className="hidden md:table-header-group">
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-center w-24">Utilizzi</TableHead>
                  {puoModificare && <TableHead className="w-[140px] text-right">Azioni</TableHead>}
                </TableRow>
              </TableHeader>
              {/* Su telefono ogni categoria è una scheda col suo bordo («!»: il corpo della tabella lo toglie all'ultima riga). */}
              <TableBody className="block space-y-2 md:table-row-group md:space-y-0">
                {filtered.map((cat) => {
                  const isEditing = editingId === cat.id;
                  const usage = usageCounts[normalizeCategoryName(cat.name)] ?? 0;
                  return (
                    <TableRow key={cat.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center rounded-lg border max-md:!border p-2 md:table-row md:border-x-0 md:border-t-0 md:p-0">
                      <TableCell className="min-w-0 p-1 md:p-4">
                        {isEditing ? (
                          <div className="space-y-1.5">
                            <Input
                              value={editName}
                              aria-label={`Nome categoria ${cat.name}`}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit(cat.id);
                                else if (e.key === "Escape") setEditingId(null);
                              }}
                              autoFocus
                              maxLength={80}
                              disabled={busy || !canWrite || !usageKnown || usage > 0}
                            />
                            {usage > 0 && (
                              <p className="text-[11px] text-muted-foreground">
                                Nome bloccato: la categoria è usata nei costi.
                              </p>
                            )}
                            {usageIsError && (
                              <p className="text-[11px] text-muted-foreground">
                                Utilizzi non disponibili: il nome non si può cambiare adesso.
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="break-words font-medium">{cat.name}</span>
                            {usageKnown && usage > 0 && (
                              <Badge variant="secondary" className="gap-1">
                                <ShieldCheck className="h-3 w-3" />
                                Protetta
                              </Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="p-1 text-center md:p-4">
                        <Badge
                          variant={usage > 0 ? "secondary" : "outline"}
                          className={usage > 0 ? "" : "text-muted-foreground"}
                        >
                          {usageKnown ? usage : "–"}
                        </Badge>
                      </TableCell>
                      {puoModificare && (
                        <TableCell className="col-span-2 p-1 text-right md:p-4">
                          {isEditing ? (
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                onClick={() => saveEdit(cat.id)}
                                disabled={!canWrite || busy || !editName.trim()}
                              >
                                Salva
                              </Button>
                              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditingId(null)}>
                                Annulla
                              </Button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!canWrite || busy} onClick={() => startEdit(cat)} aria-label={`Modifica ${cat.name}`}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                className="h-8 w-8"
                                variant="ghost"
                                disabled={!canWrite || busy || !usageKnown || usage > 0}
                                onClick={() => setDeleteId(cat.id)}
                                aria-label={usage > 0 ? `${cat.name} protetta: non eliminabile` : `Elimina ${cat.name}`}
                                title={usage > 0 ? "Categoria protetta perché già usata nei costi" : "Elimina categoria inutilizzata"}
                              >
                                <Trash2 className={`h-4 w-4 ${usage > 0 ? "text-muted-foreground" : "text-destructive"}`} />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation — fix: passa `open` a onOpenChange per chiusura corretta */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {deleteUsage > 0 && <AlertTriangle className="h-5 w-5 text-amber-500" />}
              Elimina categoria
            </AlertDialogTitle>
            <AlertDialogDescription>
              {categoryToDelete ? (
                deleteUsage > 0 ? (
                  // Il pulsante «Elimina» è spento per le categorie già usate: questo ramo c'è per quando gli utilizzi
                  // cambiano mentre la finestra è aperta.
                  <>
                    La categoria <strong>"{categoryToDelete.name}"</strong> è usata da{" "}
                    <strong>{deleteUsage} {deleteUsage === 1 ? "costo" : "costi"}</strong>.{" "}
                    Per proteggere costi storici, marginalità e report, l'eliminazione è bloccata: lascia la categoria nell'elenco per lo storico.
                  </>
                ) : (
                  <>La categoria <strong>"{categoryToDelete.name}"</strong> verrà rimossa.</>
                )
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={!canWrite || !usageKnown || deleteUsage > 0 || busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteUsage > 0 ? "Bloccata" : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={importOpen} onOpenChange={(open) => { if (!busy) setImportOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Importare le categorie mancanti?</AlertDialogTitle>
            <AlertDialogDescription>Legge costi e fornitori dell'azienda e aggiunge solo le categorie che mancano. Non modifica i movimenti storici.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annulla</AlertDialogCancel>
            <AlertDialogAction disabled={busy || !canWrite} onClick={(event) => { event.preventDefault(); importMutation.mutate(); }}>{importMutation.isPending ? "Importo…" : "Importa categorie"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
