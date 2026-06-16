import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, Loader2, Save, Paperclip, Package, Info, Search, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableMaterialItem } from "@/components/settings/SortableMaterialItem";

// Shared empty array con riferimento stabile — evita di creare un nuovo []
// ad ogni render (che farebbe triggerare inutilmente gli useEffect che
// lo hanno in dependency list).
const EMPTY_ARRAY: ReadonlyArray<never> = Object.freeze([]);

type QuotePdfMaterial = {
  id: string;
  company_id: string;
  name: string;
  category: string | null;
  storage_path: string;
  file_size_bytes: number | null;
  article_template_id: string | null;
  sort_order: number | null;
  created_by: string;
};

const CATEGORIES = ["generale", "scheda_prodotto", "garanzia", "certificazione", "contratto", "altro"];
const categoryLabels: Record<string, string> = {
  generale: "Generale",
  scheda_prodotto: "Scheda Prodotto",
  garanzia: "Garanzia",
  certificazione: "Certificazione",
  contratto: "Contratto",
  altro: "Altro",
};

export default function SettingsQuoteMaterials() {
  const { role, effectiveCompany, user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === "company_admin" || role === "super_admin";
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState("tutti");
  const [searchQuery, setSearchQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [editItem, setEditItem] = useState<QuotePdfMaterial | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("generale");
  const [deleteItem, setDeleteItem] = useState<QuotePdfMaterial | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Local sorted state for DnD
  const [localMaterials, setLocalMaterials] = useState<QuotePdfMaterial[]>([]);
  const [hasOrderChanges, setHasOrderChanges] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  useEffect(() => {
    if (!isAdmin) navigate("/azienda", { replace: true });
  }, [isAdmin, navigate]);

  const { data: materialsData, isLoading, isError, error: materialsError, refetch } = useQuery({
    queryKey: ["quote-pdf-materials", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_pdf_materials")
        .select("*")
        .eq("company_id", companyId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as QuotePdfMaterial[];
    },
  });
  // Bug fix: usare il riferimento diretto da useQuery senza default inline `= []`.
  // Il default inline rompe la referential equality ad ogni render (new array
  // ogni volta) e fa loopare il useEffect qui sotto "Maximum update depth exceeded".
  const materials = materialsData ?? EMPTY_ARRAY;

  // Sync query data → local state when no pending changes
  useEffect(() => {
    if (!hasOrderChanges) {
      setLocalMaterials(materials);
    }
  }, [materials, hasOrderChanges]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setLocalMaterials((prev) => {
      // When a filter tab is active, drag IDs come from the filtered subset.
      // We must reorder only within the filtered group and preserve the
      // relative order of items not in that group.
      const activeId = active.id as string;
      const overId = over.id as string;

      // Find which items belong to the same group as the dragged items
      const activeItem = prev.find((m) => m.id === activeId);
      const overItem = prev.find((m) => m.id === overId);
      if (!activeItem || !overItem) return prev;

      const oldIdx = prev.findIndex((m) => m.id === activeId);
      const newIdx = prev.findIndex((m) => m.id === overId);
      const reordered = arrayMove(prev, oldIdx, newIdx).map((m, i) => ({
        ...m,
        sort_order: i,
      }));
      return reordered;
    });
    setHasOrderChanges(true);
  }

  async function handleSaveOrder() {
    setSavingOrder(true);
    try {
      const updates = localMaterials.map((m, i) =>
        supabase.from("quote_pdf_materials").update({ sort_order: i }).eq("id", m.id).eq("company_id", companyId!)
      );
      const results = await Promise.all(updates);
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;

      setHasOrderChanges(false);
      queryClient.invalidateQueries({ queryKey: ["quote-pdf-materials"] });
      toast.success("Ordinamento salvato");
    } catch {
      toast.error("Errore nel salvataggio dell'ordinamento");
    } finally {
      setSavingOrder(false);
    }
  }

  const uploadMutation = useMutation({
    mutationFn: async ({ file, sortIndex }: { file: File; sortIndex: number }) => {
      if (!companyId) throw new Error("Company ID mancante");
      if (file.size > 20 * 1024 * 1024) throw new Error("File troppo grande (max 20MB)");
      if (file.type !== "application/pdf") throw new Error("Solo file PDF");
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const createdBy = user?.id ?? authData.user?.id;
      if (!createdBy) throw new Error("Utente non disponibile");

      const fileId = crypto.randomUUID();
      const storagePath = `${companyId}/${fileId}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("quote-materials")
        .upload(storagePath, file, { contentType: "application/pdf" });
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from("quote_pdf_materials")
        .insert({
          company_id: companyId,
          name: file.name.replace(/\.pdf$/i, ""),
          storage_path: storagePath,
          file_size_bytes: file.size,
          created_by: createdBy,
          sort_order: sortIndex,
        });
      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quote-pdf-materials"] });
      toast.success("PDF caricato con successo");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Errore upload"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, category }: { id: string; name: string; category: string }) => {
      const { error } = await supabase
        .from("quote_pdf_materials")
        .update({ name, category })
        .eq("id", id)
        .eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quote-pdf-materials"] });
      toast.success("Materiale aggiornato");
      setEditItem(null);
    },
    onError: () => toast.error("Errore aggiornamento"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (item: QuotePdfMaterial) => {
      const { error } = await supabase
        .from("quote_pdf_materials")
        .delete()
        .eq("id", item.id)
        .eq("company_id", companyId!);
      if (error) throw error;
      const { error: storageError } = await supabase.storage.from("quote-materials").remove([item.storage_path]);
      if (storageError) throw storageError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quote-pdf-materials"] });
      toast.success("Materiale eliminato");
      setDeleteItem(null);
    },
    onError: () => toast.error("Errore eliminazione"),
  });

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length) return;
      const baseIndex = localMaterials.length;
      setUploading(true);
      Promise.all(
        Array.from(files).map((f, i) => uploadMutation.mutateAsync({ file: f, sortIndex: baseIndex + i }))
      )
        .catch(() => {/* errors already shown via onError */})
        .finally(() => {
          setUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        });
    },
    [uploadMutation, localMaterials.length]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type === "application/pdf");
      if (!files.length) return;
      const baseIndex = localMaterials.length;
      setUploading(true);
      Promise.all(files.map((f, i) => uploadMutation.mutateAsync({ file: f, sortIndex: baseIndex + i })))
        .catch(() => {/* errors already shown via onError */})
        .finally(() => setUploading(false));
    },
    [uploadMutation, localMaterials.length]
  );

  const handlePreview = async (storagePath: string) => {
    const { data, error } = await supabase.storage.from("quote-materials").createSignedUrl(storagePath, 300);
    if (error || !data?.signedUrl) {
      toast.error("Impossibile aprire l'anteprima del file");
      return;
    }
    setPreviewUrl(data.signedUrl);
  };

  // Search + tab filter (composti)
  const filtered = localMaterials.filter((m) => {
    if (activeTab === "globali" && m.article_template_id) return false;
    if (activeTab === "prodotto" && !m.article_template_id) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matches =
        (m.name ?? "").toLowerCase().includes(q) ||
        (m.category ?? "").toLowerCase().includes(q);
      if (!matches) return false;
    }
    return true;
  });

  // Stats per KPI
  const totalSizeMB = localMaterials.reduce((s, m) => s + Number(m.file_size_bytes || 0), 0) / (1024 * 1024);
  const globali = localMaterials.filter((m) => !m.article_template_id).length;
  const perProdotto = localMaterials.filter((m) => !!m.article_template_id).length;

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      {/* Header con pattern h-10 w-10 */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Paperclip className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Materiali Preventivi</h1>
            <p className="text-sm text-muted-foreground">
              PDF (schede tecniche, garanzie, certificazioni) da allegare automaticamente ai preventivi
              generati. Trascina per riordinare le priorità nel PDF finale.
            </p>
          </div>
        </div>
        {hasOrderChanges && (
          <Button onClick={handleSaveOrder} disabled={savingOrder} size="sm">
            {savingOrder ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salva ordinamento
          </Button>
        )}
      </div>

      {/* KPI / stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-4 pb-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Totale PDF</p>
            <p className="text-xl font-bold mt-0.5">{localMaterials.length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4 pb-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Globali</p>
            <p className="text-xl font-bold mt-0.5">{globali}</p>
            <p className="text-[10px] text-muted-foreground">Allegati sempre</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="pt-4 pb-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Per prodotto</p>
            <p className="text-xl font-bold mt-0.5">{perProdotto}</p>
            <p className="text-[10px] text-muted-foreground">Solo se prodotto in preventivo</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-4 pb-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Spazio usato</p>
            <p className="text-xl font-bold mt-0.5">{totalSizeMB.toFixed(1)}<span className="text-sm"> MB</span></p>
          </CardContent>
        </Card>
      </div>

      {/* Info box: come funzionano i materiali nel preventivatore */}
      <Alert className="border-blue-300 bg-blue-50/50 dark:bg-blue-900/10">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertTitle className="text-blue-900 dark:text-blue-200 text-sm">Come vengono allegati ai preventivi</AlertTitle>
        <AlertDescription className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
          <p>
            · I PDF <strong>Globali</strong> (nessun prodotto collegato) vengono allegati a <em>tutti</em> i preventivi
            nell'ordine mostrato qui.
          </p>
          <p>
            · I PDF <strong>Per Prodotto</strong> vengono allegati solo quando l'articolo collegato è presente nel preventivo
            (es. scheda tecnica di una specifica serie infissi).
          </p>
          <p>
            · Il flag "Includi schede tecniche" in{" "}
            <Link to="/azienda/impostazioni/margini" className="underline font-medium">/margini</Link>{" "}
            controlla l'abilitazione globale dell'allegato al PDF finale.
          </p>
          <p>
            · Per collegare un PDF a un prodotto specifico: apri l'articolo in{" "}
            <Link to="/azienda/impostazioni/listino" className="underline font-medium">/listino</Link>{" "}
            e usa la sezione "Schede tecniche".
          </p>
        </AlertDescription>
      </Alert>

      {/* Upload dropzone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleFileSelect} />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Caricamento in corso...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Trascina i PDF qui o clicca per selezionare</p>
            <p className="text-xs text-muted-foreground">Solo .pdf — max 20MB per file</p>
          </div>
        )}
      </div>

      {/* Filter tabs + search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList>
            <TabsTrigger value="tutti">Tutti ({localMaterials.length})</TabsTrigger>
            <TabsTrigger value="globali">
              <Paperclip className="h-3 w-3 mr-1" />
              Globali ({globali})
            </TabsTrigger>
            <TabsTrigger value="prodotto">
              <Package className="h-3 w-3 mr-1" />
              Per Prodotto ({perProdotto})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cerca nome o categoria..."
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      {/* Materials list with DnD */}
      {isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Errore nel caricamento dei materiali</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{materialsError instanceof Error ? materialsError.message : "Riprova tra qualche istante."}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>Nessun materiale caricato</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filtered.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {filtered.map((m, index) => (
                <SortableMaterialItem
                  key={m.id}
                  material={m}
                  index={index}
                  onPreview={handlePreview}
                  onEdit={(mat) => {
                    setEditItem(mat);
                    setEditName(mat.name);
                    setEditCategory(mat.category || "generale");
                  }}
                  onDelete={setDeleteItem}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifica materiale</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nome</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Categoria</label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{categoryLabels[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Annulla</Button>
            <Button
              onClick={() => editItem && updateMutation.mutate({ id: editItem.id, name: editName, category: editCategory })}
              disabled={updateMutation.isPending}
            >
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteItem} onOpenChange={(o) => !o && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina materiale</AlertDialogTitle>
            <AlertDialogDescription>
              Vuoi eliminare "{deleteItem?.name}"? L'azione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteItem && deleteMutation.mutate(deleteItem)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PDF preview */}
      <Dialog open={!!previewUrl} onOpenChange={(o) => !o && setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>Anteprima PDF</DialogTitle>
          </DialogHeader>
          {previewUrl && <iframe src={previewUrl} className="w-full flex-1 rounded-md border" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
