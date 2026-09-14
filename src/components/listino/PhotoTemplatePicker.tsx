/**
 * PhotoTemplatePicker — Dialog galleria foto a 2 sorgenti:
 *
 *   ┌─ Tab "Galleria globale" → article_photo_templates
 *   │   • gestita centralmente dal super_admin EdiliziaInCloud
 *   │   • SOLO LETTURA per le aziende (RLS impedisce DELETE/UPDATE lato DB)
 *   │   • foto professionali condivise tra tutti i clienti
 *   │
 *   └─ Tab "Le mie foto" → company_photo_library
 *       • RLS company-scoped: ogni azienda vede SOLO le sue foto
 *       • upload diretto da qui (PNG/JPG/WEBP, max 3 MB)
 *       • delete delle proprie foto
 *
 * Selezione unica condivisa tra tab: al click su "Usa questa foto" il
 * callback `onSelect` riceve la foto scelta (forma normalizzata
 * SelectedPhoto), indipendentemente dalla sorgente.
 *
 * Riusabile in:
 *  - FamilyEditor Step 1 (foto articolo)
 *  - MacroCategorieManager (foto macrocategoria)
 *  - Eventuali altri punti dove serve scegliere una foto standard.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, Search, Image as ImageIcon, Check, X, Upload, Trash2, Globe, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useArticlePhotoTemplates } from "@/hooks/useArticlePhotoTemplates";
import {
  useCompanyPhotoLibrary,
  useUploadCompanyPhoto,
  useDeleteCompanyPhoto,
  type CompanyPhoto,
} from "@/hooks/useCompanyPhotoLibrary";

const VERTICALI = [
  { value: "all",          label: "Tutti i verticali" },
  { value: "serramenti",   label: "Serramenti" },
  { value: "bagno",        label: "Bagno" },
  { value: "fotovoltaico", label: "Fotovoltaico" },
  { value: "tetti",        label: "Tetti" },
  { value: "cappotto",     label: "Cappotto termico" },
  { value: "pompe_calore", label: "Pompe di calore" },
];

/**
 * Forma normalizzata della foto restituita via onSelect.
 * Compatibile sia con ArticlePhotoTemplate (globale) che CompanyPhoto (privata).
 */
export interface SelectedPhoto {
  id: string;
  nome: string;
  image_url: string;
  thumbnail_url?: string | null;
  tags?: string[];
  materiale?: string | null;
  /** Indica la sorgente: "global" = template super_admin, "company" = foto azienda. */
  source: "global" | "company";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-filtro per verticale (es. "serramenti"). */
  initialVertical?: string | null;
  /** Callback con la foto scelta (sorgente normalizzata). */
  onSelect: (photo: SelectedPhoto) => void;
}

type SelectedRef = { id: string; source: "global" | "company" } | null;
type Tab = "global" | "company";

export function PhotoTemplatePicker({
  open, onOpenChange, initialVertical, onSelect,
}: Props) {
  const [tab, setTab] = useState<Tab>("global");
  const [vertical, setVertical] = useState<string>(initialVertical ?? "all");
  const [search, setSearch] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("all");
  const [selectedRef, setSelectedRef] = useState<SelectedRef>(null);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(() => new Set());

  // Reset stato selezione/filtri/broken-images alla chiusura del dialog.
  // Pre-filtra il verticale al pre-filtro del caller all'apertura.
  useEffect(() => {
    if (!open) {
      setSelectedRef(null);
      setBrokenImages(new Set());
      setSearch("");
    } else if (initialVertical) {
      setVertical(initialVertical);
      setCategoriaFiltro("all");
    }
  }, [open, initialVertical]);

  // ── Dati globali ──────────────────────────────────────────────────────────
  const { data: globalTemplates = [], isLoading: globalLoading, isError: globalError } =
    useArticlePhotoTemplates({
      vertical: vertical === "all" ? null : vertical,
      categoria: null,
      search,
    });

  // ── Dati azienda ──────────────────────────────────────────────────────────
  const { data: companyPhotos = [], isLoading: companyLoading, isError: companyError } =
    useCompanyPhotoLibrary({
      vertical: vertical === "all" ? null : vertical,
      search,
    });

  // Categorie disponibili nella lista globale (per il dropdown categoria UI)
  const categoriesAvailable = useMemo(() => {
    const cats = new Set<string>();
    globalTemplates.forEach((t) => { if (t.categoria_slug) cats.add(t.categoria_slug); });
    return Array.from(cats).sort();
  }, [globalTemplates]);

  const filteredGlobal = useMemo(
    () => (categoriaFiltro === "all"
      ? globalTemplates
      : globalTemplates.filter((t) => t.categoria_slug === categoriaFiltro)),
    [globalTemplates, categoriaFiltro],
  );

  // Selezione corrente normalizzata
  const selected: SelectedPhoto | null = useMemo(() => {
    if (!selectedRef) return null;
    if (selectedRef.source === "global") {
      const t = filteredGlobal.find((x) => x.id === selectedRef.id);
      if (!t) return null;
      return {
        id: t.id, nome: t.nome, image_url: t.image_url,
        thumbnail_url: t.thumbnail_url, tags: t.tags, materiale: t.materiale,
        source: "global",
      };
    }
    const p = companyPhotos.find((x) => x.id === selectedRef.id);
    if (!p) return null;
    return {
      id: p.id, nome: p.nome, image_url: p.image_url,
      thumbnail_url: p.thumbnail_url, tags: p.tags, materiale: null,
      source: "company",
    };
  }, [selectedRef, filteredGlobal, companyPhotos]);

  const handleConfirm = () => {
    if (!selected) return;
    onSelect(selected);
    onOpenChange(false);
  };

  const markBroken = (id: string) => {
    setBrokenImages((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-orange-600" />
            Galleria foto
          </DialogTitle>
          <DialogDescription>
            Scegli una foto dalla galleria globale (curata da EdiliziaInCloud) oppure dalle tue foto private aziendali.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => { setTab(v as Tab); setSelectedRef(null); }} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2 h-9 shrink-0">
            <TabsTrigger value="global" className="text-xs gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              Galleria globale
            </TabsTrigger>
            <TabsTrigger value="company" className="text-xs gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              Le mie foto
            </TabsTrigger>
          </TabsList>

          {/* Filtri (comuni a entrambi i tab) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-3 pb-1 shrink-0">
            <div>
              <Label className="text-xs text-muted-foreground">Verticale</Label>
              <Select
                value={vertical}
                onValueChange={(v) => { setVertical(v); setCategoriaFiltro("all"); }}
              >
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VERTICALI.map((v) => (
                    <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {tab === "global" && categoriesAvailable.length > 1 && (
              <div>
                <Label className="text-xs text-muted-foreground">Categoria</Label>
                <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutte le categorie</SelectItem>
                    {categoriesAvailable.map((c) => (
                      <SelectItem key={c} value={c}>{prettyLabel(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className={tab === "global" && categoriesAvailable.length > 1 ? "" : "sm:col-span-2"}>
              <Label className="text-xs text-muted-foreground">Cerca</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nome, materiale, tag…"
                  className="h-9 text-xs pl-8"
                />
              </div>
            </div>
          </div>

          {/* Tab GLOBALE */}
          <TabsContent value="global" className="flex-1 overflow-hidden mt-2 data-[state=inactive]:hidden">
            <div className="h-full overflow-y-auto pr-1">
              {globalLoading ? (
                <LoadingState label="Caricamento galleria…" />
              ) : globalError ? (
                <ErrorState />
              ) : filteredGlobal.length === 0 ? (
                <EmptyState
                  hasSearch={!!search}
                  onReset={() => { setSearch(""); setCategoriaFiltro("all"); setVertical("all"); }}
                />
              ) : (
                <PhotoGrid
                  photos={filteredGlobal.map((t) => ({
                    id: t.id, nome: t.nome, thumb: t.thumbnail_url ?? t.image_url,
                    subtitle: t.materiale ? prettyLabel(t.materiale) : null,
                  }))}
                  selectedId={selectedRef?.source === "global" ? selectedRef.id : null}
                  brokenImages={brokenImages}
                  onSelect={(id) => setSelectedRef({ id, source: "global" })}
                  onBroken={markBroken}
                />
              )}
            </div>
          </TabsContent>

          {/* Tab COMPANY (privata) */}
          <TabsContent value="company" className="flex-1 overflow-hidden mt-2 data-[state=inactive]:hidden">
            <CompanyPhotoTab
              photos={companyPhotos}
              loading={companyLoading}
              error={companyError}
              brokenImages={brokenImages}
              selectedId={selectedRef?.source === "company" ? selectedRef.id : null}
              onSelect={(id) => setSelectedRef({ id, source: "company" })}
              onBroken={markBroken}
              onSearchReset={() => { setSearch(""); setVertical("all"); }}
              hasSearch={!!search}
              vertical={vertical === "all" ? null : vertical}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter className="border-t pt-3 sm:items-center sm:justify-between flex-wrap gap-2 shrink-0">
          <div className="text-xs text-muted-foreground">
            {selected ? (
              <span>
                Selezionata: <strong>{selected.nome}</strong>
                {selected.source === "company" && (
                  <Badge variant="outline" className="ml-2 text-[9px] h-4 px-1 border-orange-300 text-orange-700">
                    privata
                  </Badge>
                )}
              </span>
            ) : (
              tab === "global"
                ? `${filteredGlobal.length} foto disponibili`
                : `${companyPhotos.length} foto private`
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!selected}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Usa questa foto
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Sub-component: Tab "Le mie foto" — galleria privata + upload + delete
// ════════════════════════════════════════════════════════════════════════════
interface CompanyPhotoTabProps {
  photos: CompanyPhoto[];
  loading: boolean;
  error: boolean;
  brokenImages: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onBroken: (id: string) => void;
  onSearchReset: () => void;
  hasSearch: boolean;
  vertical: string | null;
}

function CompanyPhotoTab({
  photos, loading, error, brokenImages, selectedId,
  onSelect, onBroken, onSearchReset, hasSearch, vertical,
}: CompanyPhotoTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadName, setUploadName] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [toDelete, setToDelete] = useState<CompanyPhoto | null>(null);

  const uploadMutation = useUploadCompanyPhoto();
  const deleteMutation = useDeleteCompanyPhoto();

  const handleFile = (file: File) => {
    setPendingFile(file);
    // Pre-popola nome dal filename (senza estensione).
    const base = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    setUploadName(base);
  };

  const handleUpload = async () => {
    if (!pendingFile || !uploadName.trim()) return;
    try {
      await uploadMutation.mutateAsync({
        file: pendingFile,
        nome: uploadName.trim(),
        vertical_slug: vertical ?? undefined,
      });
      toast.success(`Foto "${uploadName}" caricata`);
      setPendingFile(null);
      setUploadName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      toast.error("Upload fallito", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteMutation.mutateAsync({ id: toDelete.id, storage_path: toDelete.storage_path });
      toast.success(`Foto "${toDelete.nome}" eliminata`);
      setToDelete(null);
    } catch (err) {
      toast.error("Eliminazione fallita", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    }
  };

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Box upload (sempre visibile in alto) */}
      <div className="border-2 border-dashed border-orange-200 rounded-md p-3 bg-orange-50/40 shrink-0">
        {!pendingFile ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-muted-foreground flex-1 min-w-[200px]">
              <p className="font-medium text-foreground mb-0.5">Carica una nuova foto privata</p>
              PNG, JPG o WEBP · max 3 MB · visibile <strong>solo alla tua azienda</strong>.
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-orange-300 text-orange-700 hover:bg-orange-100"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Scegli file
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <ImageIcon className="h-3.5 w-3.5 text-orange-600 shrink-0" />
              <span className="truncate flex-1">{pendingFile.name}</span>
              <span className="text-muted-foreground shrink-0">{(pendingFile.size / 1024).toFixed(0)} KB</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="Nome foto (per ricerca futura)"
                className="h-8 text-xs flex-1 min-w-[200px]"
                disabled={uploadMutation.isPending}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && uploadName.trim()) void handleUpload();
                }}
              />
              <Button
                size="sm"
                className="bg-orange-500 hover:bg-orange-600 h-8"
                onClick={() => void handleUpload()}
                disabled={!uploadName.trim() || uploadMutation.isPending}
              >
                {uploadMutation.isPending ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Carico…</>
                ) : (
                  "Carica"
                )}
              </Button>
              <Button
                size="sm" variant="ghost"
                className="h-8"
                onClick={() => { setPendingFile(null); setUploadName(""); }}
                disabled={uploadMutation.isPending}
              >
                Annulla
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Lista foto */}
      <div className="flex-1 overflow-y-auto pr-1">
        {loading ? (
          <LoadingState label="Caricamento foto private…" />
        ) : error ? (
          <ErrorState />
        ) : photos.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
            <p>Nessuna foto privata caricata{hasSearch ? " con questi filtri" : ""}.</p>
            <p className="text-xs mt-1">
              Carica la tua prima foto qui sopra — sarà riutilizzabile su tutti gli articoli del listino.
            </p>
            {hasSearch && (
              <Button variant="ghost" size="sm" onClick={onSearchReset} className="mt-2 text-xs gap-1">
                <X className="h-3.5 w-3.5" /> Azzera filtri
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {photos.map((p) => {
              const isSelected = selectedId === p.id;
              const isBroken = brokenImages.has(p.id);
              return (
                <div
                  key={p.id}
                  className={cn(
                    "group relative aspect-square border-2 rounded-md overflow-hidden transition-all bg-slate-50",
                    isSelected
                      ? "border-orange-500 ring-2 ring-orange-300 shadow-md"
                      : "border-slate-200 hover:border-orange-300 hover:shadow-sm",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(p.id)}
                    aria-pressed={isSelected}
                    aria-label={`Seleziona foto ${p.nome}`}
                    className="w-full h-full"
                  >
                    {isBroken ? (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                        <ImageIcon className="h-8 w-8" />
                      </div>
                    ) : (
                      <img
                        src={p.thumbnail_url ?? p.image_url}
                        alt={p.nome}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={() => onBroken(p.id)}
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-end">
                      <p className="text-[10px] font-semibold text-white line-clamp-2 leading-tight">{p.nome}</p>
                    </div>
                    {isSelected && (
                      <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-orange-500 text-white flex items-center justify-center shadow">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </div>
                    )}
                  </button>
                  {/* Bottone delete (appare solo on hover, no su selected per evitare misclick) */}
                  {!isSelected && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setToDelete(p); }}
                      className="absolute top-1.5 left-1.5 h-6 w-6 rounded-full bg-rose-500 text-white items-center justify-center shadow opacity-0 group-hover:flex hidden group-hover:inline-flex"
                      title="Elimina"
                      aria-label={`Elimina foto ${p.nome}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Conferma delete */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o && !deleteMutation.isPending) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare "{toDelete?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              La foto verrà rimossa dalla tua galleria privata. Gli articoli che la usano manterranno l'URL,
              ma se la foto viene eliminata anche dal cloud apparirà rotta nelle preview.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleDelete(); }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Eliminazione…</>
              ) : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Sub-components di presentazione
// ════════════════════════════════════════════════════════════════════════════
interface PhotoGridProps {
  photos: { id: string; nome: string; thumb: string; subtitle: string | null }[];
  selectedId: string | null;
  brokenImages: Set<string>;
  onSelect: (id: string) => void;
  onBroken: (id: string) => void;
}

function PhotoGrid({ photos, selectedId, brokenImages, onSelect, onBroken }: PhotoGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
      {photos.map((p) => {
        const isSelected = selectedId === p.id;
        const isBroken = brokenImages.has(p.id);
        return (
          <button
            type="button"
            key={p.id}
            onClick={() => onSelect(p.id)}
            aria-pressed={isSelected}
            aria-label={`Seleziona foto ${p.nome}`}
            className={cn(
              "group relative aspect-square border-2 rounded-md overflow-hidden transition-all bg-slate-50",
              isSelected
                ? "border-orange-500 ring-2 ring-orange-300 shadow-md"
                : "border-slate-200 hover:border-orange-300 hover:shadow-sm",
            )}
          >
            {isBroken ? (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                <ImageIcon className="h-8 w-8" />
              </div>
            ) : (
              <img
                src={p.thumb}
                alt={p.nome}
                loading="lazy"
                className="w-full h-full object-cover"
                onError={() => onBroken(p.id)}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-end">
              <p className="text-[10px] font-semibold text-white line-clamp-2 leading-tight">{p.nome}</p>
              {p.subtitle && <span className="text-[9px] text-white/80 mt-0.5">{p.subtitle}</span>}
            </div>
            {isSelected && (
              <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-orange-500 text-white flex items-center justify-center shadow">
                <Check className="h-3 w-3" strokeWidth={3} />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="text-center py-12 text-sm text-rose-700">
      Errore caricamento. Riprova fra qualche secondo.
    </div>
  );
}

function EmptyState({ hasSearch, onReset }: { hasSearch: boolean; onReset: () => void }) {
  return (
    <div className="text-center py-12 text-sm text-muted-foreground">
      <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
      Nessuna foto con questi filtri.
      {hasSearch && (
        <Button variant="ghost" size="sm" onClick={onReset} className="mt-2 text-xs gap-1">
          <X className="h-3.5 w-3.5" /> Azzera filtri
        </Button>
      )}
    </div>
  );
}

/** Converte snake_case → "Title Case" per label UI ("box_doccia" → "Box doccia"). */
function prettyLabel(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/^\w/, (c) => c.toUpperCase());
}
