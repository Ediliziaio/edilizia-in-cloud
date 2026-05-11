/**
 * StepAccessori — Step 5 wizard: accessori e complementi.
 *
 * Tabella semplificata: tipo, descrizione, quantità, prezzo.
 * Foto cantiere/render gestite in Wave 4.
 */
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Image as ImageIcon, Plus, Trash2, Loader2, Upload, X, Sparkles, ExternalLink } from "lucide-react";
import {
  useAddAccessorio, useUpdateAccessorio, useDeleteAccessorio,
  useUploadMedia, useDeleteMedia, useRenderSessions, useImportRender,
} from "@/lib/serramenti/queries";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { SR_ACCESSORI_TIPI } from "@/types/serramenti";
import type { SrProgettoDetail, SrAccessorioRow } from "@/types/serramenti";
import { SrCard, SrCallout, formatEuro } from "@/lib/serramenti/wizardUI";

interface Props {
  progettoId: string;
  detail: SrProgettoDetail;
}

export function StepAccessori({ progettoId, detail }: Props) {
  const addMut = useAddAccessorio(progettoId);
  const updateMut = useUpdateAccessorio(progettoId);
  const deleteMut = useDeleteAccessorio(progettoId);
  const uploadMediaMut = useUploadMedia(progettoId);
  const deleteMediaMut = useDeleteMedia(progettoId);
  const importRenderMut = useImportRender(progettoId);
  const [toDelete, setToDelete] = useState<SrAccessorioRow | null>(null);
  const [renderDialogOpen, setRenderDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).slice(0, 10).forEach((file, idx) => {
      // Solo immagini ragionevoli (< 10 MB)
      if (!file.type.startsWith("image/")) return;
      if (file.size > 10 * 1024 * 1024) return;
      uploadMediaMut.mutate({
        file,
        kind: "situazione",
        position: detail.media.length + idx,
      });
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const accessori = detail.accessori;

  const handleAdd = () => {
    addMut.mutate({
      tipo: "avvolgibile",
      quantita: detail.serramenti.length || 1,
      position: accessori.length,
    });
  };

  const onPatch = (id: string, patch: Partial<SrAccessorioRow>) => {
    if (patch.prezzo_unitario !== undefined || patch.quantita !== undefined) {
      const orig = accessori.find((a) => a.id === id);
      if (orig) {
        const pu = patch.prezzo_unitario ?? orig.prezzo_unitario ?? 0;
        const q = patch.quantita ?? orig.quantita ?? 1;
        patch.prezzo_totale = pu * q;
      }
    }
    updateMut.mutate({ id, patch });
  };

  return (
    <div className="space-y-3">
      <SrCard
        title="Accessori e complementi"
        description="Avvolgibili, cassonetti, zanzariere, persiane e altri elementi che completano la fornitura."
        icon={<ImageIcon className="h-4 w-4" />}
      >
        {accessori.length === 0 ? (
          <div className="border-2 border-dashed border-emerald-200 rounded-md p-6 text-center">
            <p className="text-sm text-muted-foreground mb-3">Nessun accessorio aggiunto</p>
            <Button onClick={handleAdd} className="bg-emerald-700 hover:bg-emerald-800" disabled={addMut.isPending}>
              {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Aggiungi accessorio
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Descrizione</TableHead>
                  <TableHead className="text-xs w-20">Q.tà</TableHead>
                  <TableHead className="text-xs w-32">Prezzo unit.</TableHead>
                  <TableHead className="text-xs w-28">Totale</TableHead>
                  <TableHead className="text-xs w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accessori.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Select
                        value={a.tipo}
                        onValueChange={(v) => onPatch(a.id, { tipo: v })}
                      >
                        <SelectTrigger className="h-8 text-xs w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SR_ACCESSORI_TIPI.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        defaultValue={a.descrizione ?? ""}
                        onBlur={(e) => onPatch(a.id, { descrizione: e.target.value || null })}
                        placeholder="es. Alluminio coibentato"
                        className="h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        defaultValue={a.quantita}
                        onBlur={(e) => onPatch(a.id, { quantita: Math.max(1, Number(e.target.value) || 1) })}
                        className="h-8 text-xs w-16"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        defaultValue={a.prezzo_unitario ?? ""}
                        onBlur={(e) => onPatch(a.id, { prezzo_unitario: e.target.value ? Number(e.target.value) : null })}
                        className="h-8 text-xs w-28"
                      />
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-emerald-700">
                      {formatEuro(a.prezzo_totale)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => setToDelete(a)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Button
              onClick={handleAdd}
              variant="outline"
              className="w-full gap-1 mt-3 border-dashed border-2 border-emerald-300 hover:bg-emerald-50"
              disabled={addMut.isPending}
            >
              {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Aggiungi accessorio
            </Button>
          </div>
        )}

      </SrCard>

      {/* Render foto-realistici */}
      <SrCard
        title="Render foto-realistici AI"
        description="Mostra al cliente come saranno i nuovi serramenti nella sua casa: collegamento al modulo Render Infissi."
        icon={<Sparkles className="h-4 w-4" />}
        variant="highlight"
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={() => setRenderDialogOpen(true)}
            variant="outline"
            className="flex-1 gap-2 border-emerald-300 hover:bg-emerald-50"
          >
            <Sparkles className="h-4 w-4 text-emerald-700" />
            Importa render esistente
          </Button>
          <Button asChild variant="outline" className="flex-1 gap-2">
            <a href="/azienda/render/nuovo" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              Genera nuovo render (apre modulo Render)
            </a>
          </Button>
        </div>

        {/* Anteprima render già importati */}
        {detail.media.filter((m) => m.kind === "render").length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
            {detail.media.filter((m) => m.kind === "render").map((m) => (
              <div key={m.id} className="relative group rounded-md overflow-hidden border bg-muted aspect-video">
                {m.url ? (
                  <img src={m.url} alt={m.caption ?? "render"} className="w-full h-full object-cover" />
                ) : (
                  <Sparkles className="h-6 w-6 mx-auto text-emerald-300 mt-8" />
                )}
                <button
                  onClick={() => deleteMediaMut.mutate(m.id)}
                  className="absolute top-1 right-1 h-6 w-6 rounded-full bg-rose-600 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                  title="Rimuovi"
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-emerald-700/90 text-white text-[10px] px-2 py-0.5 font-semibold">
                  ✨ Render AI
                </div>
              </div>
            ))}
          </div>
        )}

        <SrCallout variant="info" className="mt-3">
          💡 I render compaiono nella pagina 3 del PDF cliente (sezione "Anteprima foto-realistica"). Massimo 4 visibili nel PDF.
        </SrCallout>
      </SrCard>

      {/* Foto cantiere */}
      <SrCard
        title="Foto cantiere"
        description="Carica foto della situazione attuale o cantieri simili. Utili per il backoffice e per il PDF."
        icon={<ImageIcon className="h-4 w-4" />}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          onClick={() => fileInputRef.current?.click()}
          variant="outline"
          className="w-full gap-1 border-dashed border-2 border-emerald-300 hover:bg-emerald-50"
          disabled={uploadMediaMut.isPending}
        >
          {uploadMediaMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Carica foto (multipla supportata, max 10 MB ciascuna)
        </Button>

        {detail.media.filter((m) => m.kind !== "render").length > 0 && (
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 mt-3">
            {detail.media.filter((m) => m.kind !== "render").map((m) => (
              <div key={m.id} className="relative group aspect-square rounded-md overflow-hidden border bg-muted">
                {m.url ? (
                  // eslint-disable-next-line jsx-a11y/img-redundant-alt
                  <img src={m.url} alt={m.caption ?? "foto"} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                )}
                <button
                  onClick={() => deleteMediaMut.mutate(m.id)}
                  className="absolute top-1 right-1 h-6 w-6 rounded-full bg-rose-600 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                  title="Elimina"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </SrCard>

      {/* Dialog selezione render esistente */}
      <ImportRenderDialog
        open={renderDialogOpen}
        onOpenChange={setRenderDialogOpen}
        onSelect={(rsId, idx) => {
          importRenderMut.mutate({ render_session_id: rsId, result_index: idx });
          setRenderDialogOpen(false);
        }}
        importing={importRenderMut.isPending}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare l'accessorio?</AlertDialogTitle>
            <AlertDialogDescription>
              L'operazione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => {
                if (toDelete) deleteMut.mutate(toDelete.id);
                setToDelete(null);
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Dialog: Importa render esistente ───────────────────────────────────────

function ImportRenderDialog({
  open, onOpenChange, onSelect, importing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (renderSessionId: string, resultIndex: number) => void;
  importing: boolean;
}) {
  const { data: sessions = [], isLoading } = useRenderSessions();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importa render esistente</DialogTitle>
          <DialogDescription>
            Scegli un render già generato nel modulo Render Infissi. Apparirà nella pagina 3 del PDF cliente.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            Caricamento render...
          </div>
        ) : sessions.length === 0 ? (
          <div className="py-8 text-center">
            <Sparkles className="h-10 w-10 mx-auto text-emerald-300 mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              Non hai ancora generato nessun render. Vai al modulo Render Infissi per crearne uno.
            </p>
            <Button asChild className="bg-emerald-700 hover:bg-emerald-800">
              <a href="/azienda/render/nuovo" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1" />
                Apri modulo Render
              </a>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto">
            {sessions.map((s) => {
              const urls = (s.result_urls ?? []) as string[];
              const url0 = urls[0];
              if (!url0) return null;
              return (
                <button
                  key={s.id}
                  disabled={importing}
                  onClick={() => onSelect(s.id, 0)}
                  className="group relative rounded-md overflow-hidden border bg-muted aspect-video text-left hover:ring-2 hover:ring-emerald-500 transition disabled:opacity-50"
                >
                  <img src={url0} alt="render" className="w-full h-full object-cover" />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white text-[10px] px-2 py-1.5">
                    <p className="font-semibold">
                      {new Date(s.created_at).toLocaleDateString("it-IT")}
                    </p>
                    {urls.length > 1 && (
                      <p className="opacity-80">+{urls.length - 1} varianti</p>
                    )}
                  </div>
                  {importing && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
