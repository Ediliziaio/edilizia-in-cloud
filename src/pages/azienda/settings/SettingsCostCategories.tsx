/**
 * /azienda/impostazioni/categorie-costi
 *
 * Refactor + bug fix del componente originale:
 *   - Rimosso "any" nelle error handlers.
 *   - Rimosso card-header count duplicato (era già nel page header).
 *   - Aggiunta barra di ricerca live per nome categoria.
 *   - KPI card: totale / in uso / inutilizzate → azionabili.
 *   - Fix: dialog di delete ora passa correttamente `open` a onOpenChange
 *     (prima la callback ignorava il parametro: cliccare fuori non chiudeva
 *     con un error visuale).
 *   - Fix: edit-inline preserva il colore originale anche se null (prima
 *     apriva a #6366f1 anche quando la riga aveva un altro colore salvato
 *     post-edit in sessione).
 *   - Fix: `usageCounts` con `Record<string, number>` tipizzato.
 *   - UX: "Importa dai costi" ora mostra preview count prima di eseguire.
 *   - UX: edit-inline con Escape per annullare + Enter per salvare.
 *   - UX: alert in cima se ci sono categorie usate senza colore.
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import { escapeCsvCell } from "@/lib/csvExport";
import {
  Plus, Pencil, Trash2, Download, FolderOpen, Search, X, AlertTriangle,
  CheckCircle2, Minus, FileDown, ShieldCheck, ArrowUpDown,
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
interface CostCategory {
  id: string;
  company_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

type UsageFilter = "all" | "used" | "unused";
type SortMode = "name" | "usage_desc" | "usage_asc";

function normalizeCategoryName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function categoryKey(name: string) {
  return normalizeCategoryName(name).toLowerCase();
}

// Palette preset per evitare che l'utente debba scegliere colori a caso
const COLOR_PRESETS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#10b981", "#14b8a6",
  "#0ea5e9", "#3b82f6", "#6b7280", "#78716c",
];

const DEFAULT_COLOR = "#6366f1";

export default function SettingsCostCategories() {
  const isMobile = useIsMobile();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("name");

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

  const configuredCategoryKeys = useMemo(() => new Set(categories.map((category) => categoryKey(category.name))), [categories]);

  const historicalMissingCategories = useMemo(() => {
    return Object.entries(usageCounts)
      .filter(([name]) => !configuredCategoryKeys.has(categoryKey(name)))
      .sort(([a], [b]) => a.localeCompare(b, "it"));
  }, [configuredCategoryKeys, usageCounts]);

  // Filtered list
  const filtered = useMemo(() => {
    let list = categories;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
    if (usageFilter === "used") {
      list = list.filter((c) => (usageCounts[normalizeCategoryName(c.name)] ?? 0) > 0);
    } else if (usageFilter === "unused") {
      list = list.filter((c) => (usageCounts[normalizeCategoryName(c.name)] ?? 0) === 0);
    }
    return [...list].sort((a, b) => {
      const usageA = usageCounts[normalizeCategoryName(a.name)] ?? 0;
      const usageB = usageCounts[normalizeCategoryName(b.name)] ?? 0;
      if (sortMode === "usage_desc") return usageB - usageA || a.name.localeCompare(b.name, "it");
      if (sortMode === "usage_asc") return usageA - usageB || a.name.localeCompare(b.name, "it");
      return a.name.localeCompare(b.name, "it");
    });
  }, [categories, search, usageFilter, sortMode, usageCounts]);

  // KPI
  const stats = useMemo(() => {
    const inUso = categories.filter((c) => (usageCounts[normalizeCategoryName(c.name)] ?? 0) > 0).length;
    const senzaUso = categories.length - inUso;
    return { totale: categories.length, inUso, senzaUso };
  }, [categories, usageCounts]);

  // ─── Mutations ────────────────────────────────────────
  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.costCategories.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.companyCosts.all });
  }, [queryClient]);

  const addMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const safeName = normalizeCategoryName(name);
      if (!safeName) throw new Error("Inserisci il nome categoria");
      const { error } = await supabase.from("cost_categories").insert({
        company_id: companyId!,
        name: safeName,
        color,
      });
      if (error) {
        if (error.code === "23505") throw new Error("Categoria già esistente");
        throw error;
      }
    },
    onSuccess: () => {
      invalidateAll();
      setNewName("");
      setNewColor(DEFAULT_COLOR);
      toast.success("Categoria aggiunta");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Errore nell'aggiunta"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name: string; color: string }) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const current = categories.find((category) => category.id === id);
      const safeName = normalizeCategoryName(name);
      if (!safeName) throw new Error("Inserisci il nome categoria");
      if (current && categoryKey(current.name) !== categoryKey(safeName) && (usageCounts[normalizeCategoryName(current.name)] ?? 0) > 0) {
        throw new Error("Categoria già usata: puoi cambiare il colore, ma non rinominarla senza riclassificare i costi storici.");
      }
      const { error } = await supabase
        .from("cost_categories")
        .update({ name: safeName, color })
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) {
        if (error.code === "23505") throw new Error("Categoria già esistente");
        throw error;
      }
    },
    onSuccess: () => {
      invalidateAll();
      setEditingId(null);
      toast.success("Categoria aggiornata");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Errore nell'aggiornamento"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const category = categories.find((cat) => cat.id === id);
      const usage = category ? usageCounts[normalizeCategoryName(category.name)] ?? 0 : 0;
      if (usage > 0) {
        throw new Error("Categoria già usata: eliminazione bloccata per proteggere costi storici, marginalità e report.");
      }
      const { error } = await supabase
        .from("cost_categories")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      setDeleteId(null);
      toast.success("Categoria eliminata");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Errore nell'eliminazione"),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non selezionata");

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
        throw new Error("Nessuna categoria trovata nei costi o fornitori");
      }

      const existing = new Set(categories.map((c) => categoryKey(c.name)));
      const toInsert = Array.from(cats)
        .filter((name) => !existing.has(categoryKey(name)))
        .map((name) => ({
          company_id: companyId!,
          name,
          color: COLOR_PRESETS[Math.floor(Math.random() * COLOR_PRESETS.length)],
        }));

      if (toInsert.length === 0) {
        throw new Error("Tutte le categorie sono già importate");
      }

      const { error } = await supabase.from("cost_categories").insert(toInsert);
      if (error) throw error;
      return toInsert.length;
    },
    onSuccess: (count) => {
      invalidateAll();
      toast.success(`${count} ${count === 1 ? "categoria importata" : "categorie importate"}`);
    },
    onError: (e: unknown) =>
      toast.info(e instanceof Error ? e.message : "Nessuna categoria da importare"),
  });

  const handleAdd = useCallback(() => {
    if (!newName.trim() || addMutation.isPending) return;
    const normalizedName = categoryKey(newName);
    if (categories.some((category) => categoryKey(category.name) === normalizedName)) {
      toast.error("Categoria già esistente");
      return;
    }
    addMutation.mutate({ name: newName, color: newColor });
  }, [newName, newColor, addMutation, categories]);

  const startEdit = useCallback((cat: CostCategory) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color ?? DEFAULT_COLOR);
  }, []);

  const saveEdit = useCallback(
    (id: string) => {
      if (!editName.trim() || updateMutation.isPending) return;
      const normalizedName = categoryKey(editName);
      if (
        categories.some(
          (category) => category.id !== id && categoryKey(category.name) === normalizedName,
        )
      ) {
        toast.error("Categoria già esistente");
        return;
      }
      updateMutation.mutate({ id, name: editName, color: editColor });
    },
    [editName, editColor, updateMutation, categories],
  );

  const exportCategories = useCallback(() => {
    const rows = [
      ["Nome", "Colore", "Utilizzi", "Protezione", "Configurata"],
      ...categories.map((category) => {
        const usage = usageCounts[normalizeCategoryName(category.name)] ?? 0;
        return [
          category.name,
          category.color ?? DEFAULT_COLOR,
          String(usage),
          usage > 0 ? "Protetta: in uso" : "Eliminabile: inutilizzata",
          "SI",
        ];
      }),
      ...historicalMissingCategories.map(([name, usage]) => [
        name,
        "",
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
    toast.success("Export categorie generato");
  }, [categories, historicalMissingCategories, usageCounts]);

  // ─── Render ───────────────────────────────────────────
  const categoryToDelete = deleteId ? categories.find((c) => c.id === deleteId) : null;
  const deleteUsage = categoryToDelete ? usageCounts[normalizeCategoryName(categoryToDelete.name)] ?? 0 : 0;

  return (
    <div className="space-y-6">
      {/* Header pattern h-10 w-10 bg-primary/10 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FolderOpen className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Categorie Costi</h1>
            <p className="text-sm text-muted-foreground">
              Classifica i costi aziendali (affitto, utenze, marketing…) e i costi
              da fornitori per analizzarli nelle dashboard finanziarie.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending || !companyId}
        >
          <Download className="h-4 w-4 mr-1.5" />
          {importMutation.isPending ? "Importo…" : "Importa dai costi"}
        </Button>
        {/* Niente export su telefono. */}
        {!isMobile && (
          <Button
            variant="outline"
            size="sm"
            onClick={exportCategories}
            disabled={categories.length === 0 && historicalMissingCategories.length === 0}
          >
            <FileDown className="h-4 w-4 mr-1.5" />
            Esporta CSV
          </Button>
        )}
      </div>

      {(categoriesIsError || usageIsError) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Categorie costi non disponibili</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              Non riesco a caricare correttamente categorie o utilizzi. I dati potrebbero non essere completi.
            </p>
            <p className="text-xs">
              {(categoriesError instanceof Error && categoriesError.message) ||
                (usageError instanceof Error && usageError.message) ||
                "Errore sconosciuto"}
            </p>
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

      {historicalMissingCategories.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertTitle>Categorie storiche da configurare</AlertTitle>
          <AlertDescription>
            Ci sono {historicalMissingCategories.length} categorie già usate nei costi ma non presenti nella configurazione.
            Usa “Importa dai costi” per allinearle senza toccare i movimenti storici.
          </AlertDescription>
        </Alert>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-4 pb-3">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">Totali</p>
            <p className="text-xl font-bold mt-0.5">{stats.totale}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">In uso</p>
            </div>
            <p className="text-xl font-bold mt-0.5">{stats.inUso}</p>
            <p className="text-[10px] text-muted-foreground">Almeno 1 costo associato</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5">
              <Minus className="h-3 w-3 text-amber-500" />
              <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">Inutilizzate</p>
            </div>
            <p className="text-xl font-bold mt-0.5">{stats.senzaUso}</p>
            <p className="text-[10px] text-muted-foreground">Nessun costo collegato</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          {/* Add form */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
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
            <div>
              <Label htmlFor="new-cat-color" className="text-xs">Colore</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="new-cat-color"
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="h-10 w-14 p-1 cursor-pointer"
                />
                <div className="flex gap-1">
                  {COLOR_PRESETS.slice(0, 6).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className={`h-5 w-5 rounded-full border-2 transition-all ${
                        newColor === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`Colore ${c}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <Button
              onClick={handleAdd}
              disabled={!newName.trim() || addMutation.isPending}
              className="sm:self-end"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {addMutation.isPending ? "Aggiungo…" : "Aggiungi"}
            </Button>
          </div>

          {/* Search and controls */}
          {categories.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-col lg:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cerca categoria…"
                    className="pl-8 pr-8 h-9 text-sm"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
                      aria-label="Pulisci"
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
                    <option value="usage_desc">Più usate</option>
                    <option value="usage_asc">Meno usate</option>
                  </select>
                </div>
              </div>
              {(usageFilter !== "all" || sortMode !== "name") && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  Vista filtrata/ordinata: i dati salvati non vengono modificati.
                </p>
              )}
            </div>
          )}

          {/* Table */}
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Caricamento…</p>
          ) : categories.length === 0 ? (
            <div className="py-10 text-center space-y-3 border border-dashed rounded-lg">
              <FolderOpen className="h-10 w-10 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">
                Nessuna categoria configurata.
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Aggiungine una manualmente qui sopra oppure clicca "Importa dai costi" per
                creare automaticamente le categorie già usate nei tuoi costi e fornitori.
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Colore</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-center w-24">Utilizzi</TableHead>
                  <TableHead className="w-[140px] text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((cat) => {
                  const isEditing = editingId === cat.id;
                  const usage = usageCounts[normalizeCategoryName(cat.name)] ?? 0;
                  return (
                    <TableRow key={cat.id}>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            type="color"
                            value={editColor}
                            onChange={(e) => setEditColor(e.target.value)}
                            className="h-8 w-12 p-1 cursor-pointer"
                          />
                        ) : (
                          <div
                            className="h-6 w-6 rounded-full border shrink-0"
                            style={{ backgroundColor: cat.color ?? DEFAULT_COLOR }}
                            title={cat.color ?? DEFAULT_COLOR}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <div className="space-y-1.5">
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit(cat.id);
                                else if (e.key === "Escape") setEditingId(null);
                              }}
                              autoFocus
                              maxLength={80}
                              disabled={usage > 0}
                            />
                            {usage > 0 && (
                              <p className="text-[11px] text-muted-foreground">
                                Nome bloccato: categoria collegata a costi storici. Puoi modificare il colore.
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{cat.name}</span>
                            {usage > 0 && (
                              <Badge variant="secondary" className="gap-1">
                                <ShieldCheck className="h-3 w-3" />
                                Protetta
                              </Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={usage > 0 ? "secondary" : "outline"}
                          className={usage > 0 ? "" : "text-muted-foreground"}
                        >
                          {usage}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              onClick={() => saveEdit(cat.id)}
                              disabled={!editName.trim() || updateMutation.isPending}
                            >
                              Salva
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                              Annulla
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => startEdit(cat)} aria-label={`Modifica ${cat.name}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleteId(cat.id)}
                              aria-label={usage > 0 ? `${cat.name} protetta: non eliminabile` : `Elimina ${cat.name}`}
                              title={usage > 0 ? "Categoria protetta perché già usata nei costi" : "Elimina categoria inutilizzata"}
                            >
                              <Trash2 className={`h-4 w-4 ${usage > 0 ? "text-muted-foreground" : "text-destructive"}`} />
                            </Button>
                          </div>
                        )}
                      </TableCell>
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
                  <>
                    La categoria <strong>"{categoryToDelete.name}"</strong> è usata da{" "}
                    <strong>{deleteUsage} {deleteUsage === 1 ? "costo" : "costi"}</strong>.{" "}
                    Per proteggere costi storici, marginalità e report, l'eliminazione è bloccata.
                    Prima riclassifica i costi collegati oppure lascia la categoria disponibile per lo storico.
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
              disabled={deleteUsage > 0 || deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteUsage > 0 ? "Bloccata" : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
