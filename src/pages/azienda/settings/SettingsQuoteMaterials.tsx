import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Upload, FileText, Loader2, Save } from "lucide-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableMaterialItem } from "@/components/settings/SortableMaterialItem";

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
  const { role, effectiveCompany } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === "company_admin" || role === "super_admin";
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState("tutti");
  const [uploading, setUploading] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("generale");
  const [deleteItem, setDeleteItem] = useState<any | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Local sorted state for DnD
  const [localMaterials, setLocalMaterials] = useState<any[]>([]);
  const [hasOrderChanges, setHasOrderChanges] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  useEffect(() => {
    if (!isAdmin) navigate("/azienda", { replace: true });
  }, [isAdmin, navigate]);

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ["quote-pdf-materials", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_pdf_materials")
        .select("*")
        .eq("company_id", companyId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

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
      const oldIdx = prev.findIndex((m) => m.id === active.id);
      const newIdx = prev.findIndex((m) => m.id === over.id);
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
        supabase.from("quote_pdf_materials").update({ sort_order: i }).eq("id", m.id)
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
    mutationFn: async (file: File) => {
      if (!companyId) throw new Error("Company ID mancante");
      if (file.size > 20 * 1024 * 1024) throw new Error("File troppo grande (max 20MB)");
      if (file.type !== "application/pdf") throw new Error("Solo file PDF");

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
          created_by: (await supabase.auth.getUser()).data.user!.id,
          sort_order: localMaterials.length,
        });
      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quote-pdf-materials"] });
      toast.success("PDF caricato con successo");
    },
    onError: (e: any) => toast.error(e.message || "Errore upload"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, category }: { id: string; name: string; category: string }) => {
      const { error } = await supabase
        .from("quote_pdf_materials")
        .update({ name, category })
        .eq("id", id);
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
    mutationFn: async (item: any) => {
      await supabase.storage.from("quote-materials").remove([item.storage_path]);
      const { error } = await supabase.from("quote_pdf_materials").delete().eq("id", item.id);
      if (error) throw error;
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
      setUploading(true);
      Promise.all(Array.from(files).map((f) => uploadMutation.mutateAsync(f)))
        .finally(() => {
          setUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        });
    },
    [uploadMutation]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type === "application/pdf");
      if (!files.length) return;
      setUploading(true);
      Promise.all(files.map((f) => uploadMutation.mutateAsync(f))).finally(() => setUploading(false));
    },
    [uploadMutation]
  );

  const handlePreview = async (storagePath: string) => {
    const { data } = await supabase.storage.from("quote-materials").createSignedUrl(storagePath, 300);
    if (data?.signedUrl) setPreviewUrl(data.signedUrl);
  };

  const filtered = localMaterials.filter((m: any) => {
    if (activeTab === "tutti") return true;
    if (activeTab === "globali") return !m.article_template_id;
    if (activeTab === "prodotto") return !!m.article_template_id;
    return true;
  });

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Materiali Preventivi</h1>
          <p className="text-muted-foreground">
            Gestisci i PDF da allegare ai preventivi. Trascina per riordinare.
          </p>
        </div>
        {hasOrderChanges && (
          <Button onClick={handleSaveOrder} disabled={savingOrder} size="sm">
            {savingOrder ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salva ordinamento
          </Button>
        )}
      </div>

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

      {/* Filter tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="tutti">Tutti ({localMaterials.length})</TabsTrigger>
          <TabsTrigger value="globali">
            Globali ({localMaterials.filter((m: any) => !m.article_template_id).length})
          </TabsTrigger>
          <TabsTrigger value="prodotto">
            Per Prodotto ({localMaterials.filter((m: any) => !!m.article_template_id).length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Materials list with DnD */}
      {isLoading ? (
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
              {filtered.map((m: any, index: number) => (
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
        <DialogContent>
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
