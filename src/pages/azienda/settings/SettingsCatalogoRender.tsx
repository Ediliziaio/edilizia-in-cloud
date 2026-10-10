import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, Lock, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";
import { useRenderCatalogAssets } from "@/hooks/useRenderCatalogAssets";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  MAX_CATALOG_REFERENCES,
  RENDER_CATALOG_ACCEPT,
  RENDER_CATALOG_VERTICALI,
  categoriaLabel,
  deleteRenderCatalogAsset,
  updateRenderCatalogAsset,
  uploadRenderCatalogAsset,
  type RenderCatalogAsset,
  type RenderCatalogVerticale,
} from "@/lib/render/renderCatalog";
import { motivoDelRifiuto } from "@/lib/impostazioni/erroriPerUtente";
import { cn } from "@/lib/utils";

interface PendingFile {
  file: File;
  preview: string;
  etichetta: string;
  categoria: string;
}

const MAX_FOTO_PER_VOLTA = 20;

function nomeDaFile(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 120);
}

/**
 * Catalogo render: le foto dei prodotti dell'azienda che il render può
 * allegare come riferimenti. Griglia per verticale, upload multiplo con
 * categoria ed etichetta, correzione di etichetta e categoria, eliminazione.
 *
 * 09/10/2026: eliminare chiede conferma (prima partiva dal pulsante, per sempre: riga e file) e non finge se le
 * regole di accesso non eliminano niente; etichetta e categoria si correggono dalla foto (prima, per un refuso,
 * si cancellava e si ricaricava); chi non ha il permesso «Personalizzazione» in modifica vede il catalogo in sola
 * lettura e il perché; i pulsanti della foto restano sempre visibili (prima comparivano solo passando il mouse:
 * invisibili da tastiera, e da telefono coprivano la miniatura); gli errori dicono il motivo.
 */
export default function SettingsCatalogoRender() {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const isMobile = useIsMobile();
  const permissions = usePermissions();
  const canEdit = permissions.canEditSettingsCustomization;
  const confirm = useConfirm();
  const [verticale, setVerticale] = useState<RenderCatalogVerticale>("bagno");
  const [reloadKey, setReloadKey] = useState(0);
  const { assets, urls, loading, error } = useRenderCatalogAssets(companyId, verticale, reloadKey);
  const def = useMemo(() => RENDER_CATALOG_VERTICALI.find((v) => v.value === verticale)!, [verticale]);
  const [filtroCategoria, setFiltroCategoria] = useState<string>("tutte");
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  // La foto di cui si sta correggendo etichetta e categoria.
  const [inModifica, setInModifica] = useState<RenderCatalogAsset | null>(null);
  const [bozza, setBozza] = useState({ etichetta: "", categoria: "" });
  const [salvando, setSalvando] = useState(false);

  // Cambiando tipo di prodotto le categorie sono altre: il filtro riparte da «Tutte» (nel gestore, non in un effetto).
  const cambiaVerticale = (v: RenderCatalogVerticale) => {
    setVerticale(v);
    setFiltroCategoria("tutte");
  };
  useEffect(() => () => pending.forEach((p) => URL.revokeObjectURL(p.preview)), [pending]);

  const visibili = useMemo(
    () => (filtroCategoria === "tutte" ? assets : assets.filter((a) => a.categoria === filtroCategoria)),
    [assets, filtroCategoria],
  );

  const onFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (files.length > MAX_FOTO_PER_VOLTA) {
      toast.info(`Ho preso le prime ${MAX_FOTO_PER_VOLTA} foto: le altre caricale dopo.`);
    }
    const categoriaDefault = filtroCategoria !== "tutte" ? filtroCategoria : def.categorie[0].value;
    setPending(Array.from(files).slice(0, MAX_FOTO_PER_VOLTA).map((file) => ({
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
    const fallite: { nome: string; motivo: string }[] = [];
    for (const p of pending) {
      try {
        await uploadRenderCatalogAsset({
          companyId, userId: user.id, file: p.file, verticale, categoria: p.categoria, etichetta: p.etichetta,
        });
        ok += 1;
      } catch (e) {
        fallite.push({ nome: p.file.name, motivo: motivoDelRifiuto(e, "Riprova tra poco.") });
      }
    }
    setUploading(false);
    setPending([]);
    if (ok > 0) setReloadKey((k) => k + 1);
    // Un solo messaggio: tutto riuscito, o quali foto no e perché (prima uno per foto, con il testo grezzo del server).
    if (fallite.length === 0) {
      toast.success(ok === 1 ? "Foto aggiunta al catalogo" : `${ok} foto aggiunte al catalogo`);
      return;
    }
    const titolo = ok > 0
      ? `Aggiunte ${ok} foto su ${ok + fallite.length}`
      : fallite.length === 1 ? `Non sono riuscito a caricare ${fallite[0].nome}` : "Non sono riuscito a caricare le foto";
    toast.error(titolo, { description: fallite.slice(0, 3).map((f) => `${f.nome}: ${f.motivo}`).join(" · ") });
  }, [companyId, user, pending, verticale]);

  const elimina = useCallback(async (asset: RenderCatalogAsset) => {
    const ok = await confirm({
      title: `Eliminare «${asset.etichetta}» dal catalogo?`,
      description: "La foto non sarà più tra quelle che puoi scegliere per un render. Non si può annullare.",
      confirmLabel: "Elimina",
      variant: "destructive",
    });
    if (!ok) return;
    setDeleting(asset.id);
    try {
      await deleteRenderCatalogAsset(asset);
      toast.success("Foto eliminata");
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast.error(`Non sono riuscito a eliminare «${asset.etichetta}»`, { description: motivoDelRifiuto(e, "Riprova tra poco.") });
    } finally {
      setDeleting(null);
    }
  }, [confirm]);

  const apriModifica = (asset: RenderCatalogAsset) => {
    setInModifica(asset);
    setBozza({ etichetta: asset.etichetta, categoria: asset.categoria });
  };

  const salvaModifica = useCallback(async () => {
    if (!inModifica) return;
    const etichetta = bozza.etichetta.trim();
    if (!etichetta) return;
    setSalvando(true);
    try {
      await updateRenderCatalogAsset(inModifica.id, { etichetta: etichetta.slice(0, 120), categoria: bozza.categoria });
      toast.success("Foto aggiornata");
      setInModifica(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast.error(`Non sono riuscito ad aggiornare «${inModifica.etichetta}»`, { description: motivoDelRifiuto(e, "Riprova tra poco.") });
    } finally {
      setSalvando(false);
    }
  }, [inModifica, bozza]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Carica le foto dei prodotti che vendi (su fondo neutro, da catalogo). Quando prepari un render potrai
        sceglierne fino a {MAX_CATALOG_REFERENCES}: il render mostrerà il tuo prodotto, adattato alla prospettiva
        e alla luce della foto del cliente.
      </p>

      {!canEdit && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            Stai consultando il catalogo: lo cambia chi ha il permesso «Personalizzazione» in modifica.
          </AlertDescription>
        </Alert>
      )}

      <div className={cn("flex gap-2", isMobile ? "flex-col" : "flex-wrap items-center")}>
        {isMobile ? (
          <Select value={verticale} onValueChange={(v) => cambiaVerticale(v as RenderCatalogVerticale)}>
            <SelectTrigger className="h-9" aria-label="Tipo di prodotto"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RENDER_CATALOG_VERTICALI.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Tipo di prodotto">
            {RENDER_CATALOG_VERTICALI.map((v) => (
              <Button
                key={v.value}
                size="sm"
                variant={v.value === verticale ? "default" : "outline"}
                aria-pressed={v.value === verticale}
                onClick={() => cambiaVerticale(v.value)}
              >
                {v.label}
              </Button>
            ))}
          </div>
        )}
        <div className="flex flex-1 gap-2">
          <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
            <SelectTrigger className="h-9 flex-1 md:max-w-[220px]" aria-label="Filtra per categoria"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutte">Tutte le categorie</SelectItem>
              {def.categorie.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {canEdit && (
            <>
              <Button className="flex-1 md:flex-none" onClick={() => fileInput.current?.click()}>
                <ImagePlus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Carica foto
              </Button>
              <input ref={fileInput} type="file" accept={RENDER_CATALOG_ACCEPT} multiple hidden onChange={(e) => onFiles(e.target.files)} />
            </>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
          Non riesco a leggere il catalogo.
          <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>Riprova</Button>
        </div>
      )}
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Caricamento…</div>
      ) : visibili.length === 0 ? (
        canEdit ? (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-sm text-muted-foreground hover:border-primary/60"
          >
            <ImagePlus className="h-6 w-6" aria-hidden="true" />
            Nessuna foto per {def.label.toLowerCase()}{filtroCategoria !== "tutte" ? ` · ${categoriaLabel(verticale, filtroCategoria)}` : ""}. Tocca per caricare.
          </button>
        ) : (
          <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
            Nessuna foto per {def.label.toLowerCase()}{filtroCategoria !== "tutte" ? ` · ${categoriaLabel(verticale, filtroCategoria)}` : ""}.
          </p>
        )
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {visibili.map((a) => (
            <li key={a.id} className="overflow-hidden rounded-lg border bg-card">
              <div className="aspect-square bg-muted">
                {urls[a.storage_path] && <img src={urls[a.storage_path]} alt={a.etichetta} className="h-full w-full object-cover" loading="lazy" />}
              </div>
              <div className="space-y-1 p-1.5">
                <p className="truncate text-xs font-medium" title={a.etichetta}>{a.etichetta}</p>
                <Badge variant="secondary" className="block h-4 max-w-full truncate px-1 text-[10px] font-normal">{categoriaLabel(verticale, a.categoria)}</Badge>
                {canEdit && (
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      aria-label={`Modifica «${a.etichetta}»`}
                      title="Modifica etichetta e categoria"
                      onClick={() => apriModifica(a)}
                      className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Elimina «${a.etichetta}»`}
                      title="Elimina dal catalogo"
                      disabled={deleting === a.id}
                      onClick={() => void elimina(a)}
                      className="rounded-full p-1 text-destructive hover:bg-destructive/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {deleting === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
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
                    <Label htmlFor={`catalogo-etichetta-${i}`} className="text-[11px]">Etichetta (come la vedrà il render)</Label>
                    <Input
                      id={`catalogo-etichetta-${i}`}
                      value={p.etichetta}
                      maxLength={120}
                      placeholder="es. Mobile sospeso rovere 120 cm"
                      onChange={(e) => setPending((arr) => arr.map((x, j) => j === i ? { ...x, etichetta: e.target.value } : x))}
                      className="h-8 text-sm"
                    />
                  </div>
                  <Select value={p.categoria} onValueChange={(v) => setPending((arr) => arr.map((x, j) => j === i ? { ...x, categoria: v } : x))}>
                    <SelectTrigger className="h-8 text-sm" aria-label={`Categoria di ${p.etichetta || p.file.name}`}><SelectValue /></SelectTrigger>
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

      {/* Correggere un refuso nell'etichetta o cambiare categoria, senza cancellare e ricaricare la foto. */}
      <Dialog open={inModifica !== null} onOpenChange={(open) => { if (!open && !salvando) setInModifica(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifica la foto</DialogTitle>
          </DialogHeader>
          {inModifica && (
            <div className="flex gap-3">
              {urls[inModifica.storage_path] && (
                <img src={urls[inModifica.storage_path]} alt="" className="h-20 w-20 shrink-0 rounded-md border object-cover" />
              )}
              <div className="flex-1 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="catalogo-modifica-etichetta" className="text-xs">Etichetta (come la vedrà il render)</Label>
                  <Input
                    id="catalogo-modifica-etichetta"
                    value={bozza.etichetta}
                    maxLength={120}
                    onChange={(e) => setBozza((b) => ({ ...b, etichetta: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="catalogo-modifica-categoria" className="text-xs">Categoria</Label>
                  <Select value={bozza.categoria} onValueChange={(v) => setBozza((b) => ({ ...b, categoria: v }))}>
                    <SelectTrigger id="catalogo-modifica-categoria"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {def.categorie.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={salvando} onClick={() => setInModifica(null)}>Annulla</Button>
            <Button disabled={salvando || !bozza.etichetta.trim()} onClick={() => void salvaModifica()}>
              {salvando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
