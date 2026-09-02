import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRenderCatalogAssets } from "@/hooks/useRenderCatalogAssets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  MAX_CATALOG_REFERENCES,
  RENDER_CATALOG_ACCEPT,
  RENDER_CATALOG_VERTICALI,
  categoriaLabel,
  deleteRenderCatalogAsset,
  uploadRenderCatalogAsset,
  type RenderCatalogAsset,
  type RenderCatalogVerticale,
} from "@/lib/render/renderCatalog";
import { cn } from "@/lib/utils";

interface PendingFile {
  file: File;
  preview: string;
  etichetta: string;
  categoria: string;
}

function nomeDaFile(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 120);
}

/**
 * Catalogo render: le foto dei prodotti dell'azienda che il wizard puo'
 * allegare al render come riferimenti. Griglia per verticale, upload
 * multiplo con categoria ed etichetta, eliminazione.
 */
export default function SettingsCatalogoRender() {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const isMobile = useIsMobile();
  const [verticale, setVerticale] = useState<RenderCatalogVerticale>("bagno");
  const [reloadKey, setReloadKey] = useState(0);
  const { assets, urls, loading, error } = useRenderCatalogAssets(companyId, verticale, reloadKey);
  const def = useMemo(() => RENDER_CATALOG_VERTICALI.find((v) => v.value === verticale)!, [verticale]);
  const [filtroCategoria, setFiltroCategoria] = useState<string>("tutte");
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => setFiltroCategoria("tutte"), [verticale]);
  useEffect(() => () => pending.forEach((p) => URL.revokeObjectURL(p.preview)), [pending]);

  const visibili = useMemo(
    () => (filtroCategoria === "tutte" ? assets : assets.filter((a) => a.categoria === filtroCategoria)),
    [assets, filtroCategoria],
  );

  const onFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const categoriaDefault = filtroCategoria !== "tutte" ? filtroCategoria : def.categorie[0].value;
    setPending(Array.from(files).slice(0, 20).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      etichetta: nomeDaFile(file.name),
      categoria: categoriaDefault,
    })));
    if (fileInput.current) fileInput.current.value = "";
  }, [def, filtroCategoria]);

  const salva = useCallback(async () => {
    if (!companyId || !user) return;
    setUploading(true);
    let ok = 0;
    for (const p of pending) {
      try {
        await uploadRenderCatalogAsset({
          companyId, userId: user.id, file: p.file, verticale, categoria: p.categoria, etichetta: p.etichetta,
        });
        ok += 1;
      } catch (e) {
        toast.error(`${p.file.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setUploading(false);
    setPending([]);
    if (ok > 0) {
      toast.success(ok === 1 ? "Foto aggiunta al catalogo" : `${ok} foto aggiunte al catalogo`);
      setReloadKey((k) => k + 1);
    }
  }, [companyId, user, pending, verticale]);

  const elimina = useCallback(async (asset: RenderCatalogAsset) => {
    setDeleting(asset.id);
    try {
      await deleteRenderCatalogAsset(asset);
      toast.success("Foto eliminata");
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(null);
    }
  }, []);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Carica le foto dei prodotti che vendi (su fondo neutro, da catalogo). Nel wizard del render
        potrai sceglierne fino a {MAX_CATALOG_REFERENCES}: il render mostrerà il tuo prodotto, adattato
        alla prospettiva e alla luce della foto del cliente.
      </p>

      <div className={cn("flex gap-2", isMobile ? "flex-col" : "flex-wrap items-center")}>
        {isMobile ? (
          <Select value={verticale} onValueChange={(v) => setVerticale(v as RenderCatalogVerticale)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RENDER_CATALOG_VERTICALI.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex flex-wrap gap-1">
            {RENDER_CATALOG_VERTICALI.map((v) => (
              <Button key={v.value} size="sm" variant={v.value === verticale ? "default" : "outline"} onClick={() => setVerticale(v.value)}>
                {v.label}
              </Button>
            ))}
          </div>
        )}
        <div className="flex flex-1 gap-2">
          <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
            <SelectTrigger className="h-9 flex-1 md:max-w-[220px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutte">Tutte le categorie</SelectItem>
              {def.categorie.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button className="flex-1 md:flex-none" onClick={() => fileInput.current?.click()}>
            <ImagePlus className="mr-1.5 h-4 w-4" /> Carica foto
          </Button>
          <input ref={fileInput} type="file" accept={RENDER_CATALOG_ACCEPT} multiple hidden onChange={(e) => onFiles(e.target.files)} />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Caricamento…</div>
      ) : visibili.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-sm text-muted-foreground hover:border-primary/60"
        >
          <ImagePlus className="h-6 w-6" />
          Nessuna foto per {def.label.toLowerCase()}{filtroCategoria !== "tutte" ? ` · ${categoriaLabel(verticale, filtroCategoria)}` : ""}. Tocca per caricare.
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {visibili.map((a) => (
            <div key={a.id} className="group relative overflow-hidden rounded-lg border bg-card">
              <div className="aspect-square bg-muted">
                {urls[a.storage_path] && <img src={urls[a.storage_path]} alt={a.etichetta} className="h-full w-full object-cover" loading="lazy" />}
              </div>
              <div className="space-y-0.5 p-1.5">
                <p className="truncate text-xs font-medium" title={a.etichetta}>{a.etichetta}</p>
                <Badge variant="secondary" className="h-4 px-1 text-[10px] font-normal">{categoriaLabel(verticale, a.categoria)}</Badge>
              </div>
              <button
                type="button"
                aria-label="Elimina foto"
                disabled={deleting === a.id}
                onClick={() => elimina(a)}
                className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-destructive shadow md:opacity-0 md:group-hover:opacity-100"
              >
                {deleting === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={pending.length > 0} onOpenChange={(open) => { if (!open && !uploading) setPending([]); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{pending.length === 1 ? "Nuova foto prodotto" : `${pending.length} nuove foto prodotto`} · {def.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {pending.map((p, i) => (
              <div key={p.preview} className="flex gap-3">
                <img src={p.preview} alt="" className="h-16 w-16 shrink-0 rounded-md border object-cover" />
                <div className="flex-1 space-y-1.5">
                  <div>
                    <Label className="text-[11px]">Etichetta (come la vedrà il render)</Label>
                    <Input
                      value={p.etichetta}
                      maxLength={120}
                      placeholder="es. Mobile sospeso rovere 120 cm"
                      onChange={(e) => setPending((arr) => arr.map((x, j) => j === i ? { ...x, etichetta: e.target.value } : x))}
                      className="h-8 text-sm"
                    />
                  </div>
                  <Select value={p.categoria} onValueChange={(v) => setPending((arr) => arr.map((x, j) => j === i ? { ...x, categoria: v } : x))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {def.categorie.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={uploading} onClick={() => setPending([])}>Annulla</Button>
            <Button className="flex-1 sm:flex-none" disabled={uploading || pending.some((p) => !p.etichetta.trim())} onClick={salva}>
              {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Salva nel catalogo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
