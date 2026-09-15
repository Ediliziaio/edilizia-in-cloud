/**
 * StepAccessori — Step 5 wizard: accessori e complementi.
 *
 * Tabella semplificata: tipo, descrizione, quantità, prezzo.
 * Foto cantiere/render gestite in Wave 4.
 */
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, Loader2, Upload, X, Sparkles, ExternalLink } from "lucide-react";
import {
  useUploadMedia, useDeleteMedia, useRenderSessions, useImportRender,
} from "@/lib/serramenti/queries";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { SrProgettoDetail, SrMediaRow } from "@/types/serramenti";
import { SrCard, SrCallout } from "@/lib/serramenti/wizardUI";

interface Props {
  progettoId: string;
  detail: SrProgettoDetail;
}

export function StepAccessori({ progettoId, detail }: Props) {
  const uploadMediaMut = useUploadMedia(progettoId);
  const deleteMediaMut = useDeleteMedia(progettoId);
  const importRenderMut = useImportRender(progettoId);
  const [renderDialogOpen, setRenderDialogOpen] = useState(false);
  // Builder render in modalita' embed: apre il modulo Render Infissi
  // dentro un Dialog/iframe senza navigare via dal wizard preventivo.
  // Postmessage listener gestisce il completamento e auto-importa.
  const [builderDialogOpen, setBuilderDialogOpen] = useState(false);
  const [mediaToDelete, setMediaToDelete] = useState<SrMediaRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Listener postMessage dal RenderNewV2 in embed:
  //   - type='sr-render-completed' + sessionId -> chiude dialog + importa.
  // Sicurezza: filtro su `event.origin === window.location.origin`
  // (stessa origin per evitare injection cross-domain).
  //
  // PERF: il mutate viene letto via ref per evitare che il listener si
  // ri-registri ad ogni render (importRenderMut e' un oggetto nuovo a
  // ogni render del componente -> deps instabile).
  const importRenderMutateRef = useRef(importRenderMut.mutate);
  useEffect(() => {
    importRenderMutateRef.current = importRenderMut.mutate;
  }, [importRenderMut.mutate]);

  useEffect(() => {
    if (!builderDialogOpen) return;
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; sessionId?: string; error?: string } | null;
      if (data?.type === "sr-render-completed" && data.sessionId) {
        importRenderMutateRef.current(
          { render_session_id: data.sessionId, result_index: 0 },
          {
            onSuccess: () => {
              setBuilderDialogOpen(false);
              toast.success("Render generato e importato nel preventivo");
            },
          },
        );
      }
      // Render fallito nell'iframe -> notifico l'utente nel parent ma
      // NON chiudo il Dialog (cosi' l'utente puo' eventualmente riprovare
      // dallo stesso wizard, o chiudere quando vuole).
      if (data?.type === "sr-render-failed") {
        toast.error("Render fallito", {
          description: data.error ?? "Generazione del render non riuscita. Riprova o contatta il supporto.",
        });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [builderDialogOpen]);

  /**
   * handleFiles — accetta solo immagini ragionevoli (< 10 MB).
   * Differenza dalla versione precedente: notifica esplicitamente l'utente
   * quando uno o più file vengono scartati (prima venivano ignorati in
   * silenzio, creando confusione).
   */
  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const all = Array.from(files).slice(0, 10);
    const skippedNonImage: string[] = [];
    const skippedTooBig: string[] = [];
    let accepted = 0;
    all.forEach((file, idx) => {
      if (!file.type.startsWith("image/")) {
        skippedNonImage.push(file.name);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        skippedTooBig.push(file.name);
        return;
      }
      uploadMediaMut.mutate({
        file,
        kind: "situazione",
        position: detail.media.length + idx,
      });
      accepted++;
    });
    if (skippedNonImage.length > 0) {
      toast.warning(
        `${skippedNonImage.length} file non sono immagini — saltati`,
        { description: skippedNonImage.slice(0, 3).join(", ") + (skippedNonImage.length > 3 ? "…" : "") },
      );
    }
    if (skippedTooBig.length > 0) {
      toast.warning(
        `${skippedTooBig.length} file > 10 MB — saltati`,
        { description: skippedTooBig.slice(0, 3).join(", ") + (skippedTooBig.length > 3 ? "…" : "") },
      );
    }
    if (accepted === 0 && (skippedNonImage.length > 0 || skippedTooBig.length > 0)) {
      toast.error("Nessun file caricato");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const confirmDeleteMedia = () => {
    if (!mediaToDelete) return;
    deleteMediaMut.mutate(mediaToDelete.id, {
      onSettled: () => setMediaToDelete(null),
    });
  };

  const accessori = detail.accessori;

  return (
    <div className="space-y-3">
      {/* I complementi (tapparelle, zanzariere, cassonetti, persiane) stanno nel box
          della loro finestra, in «Composizione offerta»: questo passo ha solo foto
          del cantiere e render. */}
      {accessori.length > 0 && (
        <SrCallout variant="info" icon={<ImageIcon className="h-3.5 w-3.5" />} title="Complementi">
          Tapparelle, zanzariere e cassonetti si aggiungono nel box di ogni finestra, in{" "}
          <strong>Composizione offerta</strong>: prendono le sue misure e il modello già usato.
        </SrCallout>
      )}

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
            className="flex-1 gap-2 border-orange-300 hover:bg-orange-50"
          >
            <Sparkles className="h-4 w-4 text-orange-600" />
            Importa render esistente
          </Button>
          {/* Genera nuovo render: apre il builder Render Infissi DENTRO un
              Dialog (iframe verso /azienda/render/infissi/embed). Al
              completamento postMessage handshake auto-importa nel BOM. */}
          <Button
            onClick={() => setBuilderDialogOpen(true)}
            className="flex-1 gap-2 bg-orange-500 hover:bg-orange-600"
          >
            <Sparkles className="h-4 w-4" />
            Genera nuovo render
          </Button>
        </div>

        {/* Anteprima render già importati. Mostra anche la foto situazione
            originale accoppiata (se importata insieme al render): comunica
            visivamente che nel PDF cliente sara' confronto prima/dopo. */}
        {(() => {
          const renders = detail.media.filter((m) => m.kind === "render");
          const situazioni = detail.media.filter((m) => m.kind === "situazione");
          if (renders.length === 0 && situazioni.length === 0) return null;
          return (
            <div className="space-y-3 mt-3">
              {renders.map((render) => {
                // Trova la foto "prima" associata: stesso render-session in
                // storage_path. Es. "render-session:<id>:0" -> "render-session:<id>:original"
                const sessionId = render.storage_path?.split(":")[1] ?? null;
                const prima = sessionId
                  ? situazioni.find((s) => s.storage_path?.startsWith(`render-session:${sessionId}:`))
                  : null;
                return (
                  <div key={render.id} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {/* PRIMA — foto originale */}
                    <div className="relative group rounded-md overflow-hidden border bg-muted aspect-video">
                      {prima?.url ? (
                        <img loading="lazy" src={prima.url} alt="prima" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground italic">
                          Foto originale mancante
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-slate-800/90 text-white text-[10px] px-2 py-0.5 font-semibold uppercase tracking-wide">
                        Prima
                      </div>
                    </div>
                    {/* DOPO — render AI */}
                    <div className="relative group rounded-md overflow-hidden border bg-muted aspect-video">
                      {render.url ? (
                        <img loading="lazy" src={render.url} alt={render.caption ?? "render"} className="w-full h-full object-cover" />
                      ) : (
                        <Sparkles className="h-6 w-6 mx-auto text-orange-300 mt-8" />
                      )}
                      <button
                        onClick={() => setMediaToDelete(render)}
                        className="absolute top-1 right-1 h-6 w-6 rounded-full bg-rose-600 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                        title="Rimuovi"
                        aria-label="Rimuovi render"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-orange-500/90 text-white text-[10px] px-2 py-0.5 font-semibold uppercase tracking-wide">
                        Dopo · Render AI
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* Situazioni "orfane" (importate senza render abbinato) */}
              {situazioni
                .filter((s) => {
                  const sid = s.storage_path?.split(":")[1] ?? null;
                  return !sid || !renders.some((r) => r.storage_path?.includes(`:${sid}:`));
                })
                .map((m) => (
                  <div key={m.id} className="relative group rounded-md overflow-hidden border bg-muted aspect-video max-w-xs">
                    {m.url && <img loading="lazy" src={m.url} alt="prima" className="w-full h-full object-cover" />}
                    <button
                      onClick={() => setMediaToDelete(m)}
                      className="absolute top-1 right-1 h-6 w-6 rounded-full bg-rose-600 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                      title="Rimuovi"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-slate-800/90 text-white text-[10px] px-2 py-0.5 font-semibold uppercase tracking-wide">
                      Prima · senza render
                    </div>
                  </div>
                ))}
            </div>
          );
        })()}

        <SrCallout variant="info" className="mt-3">
          💡 I render compaiono nella pagina 3 del PDF cliente come confronto <strong>prima / dopo</strong>.
          Massimo 4 coppie visibili nel PDF.
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
          className="w-full gap-1 border-dashed border-2 border-orange-300 hover:bg-orange-50"
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
                  <img loading="lazy" src={m.url} alt={m.caption ?? "foto"} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                )}
                <button
                  onClick={() => setMediaToDelete(m)}
                  className="absolute top-1 right-1 h-6 w-6 rounded-full bg-rose-600 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                  title="Elimina"
                  aria-label="Elimina foto"
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

      {/* Dialog Render Builder inline (iframe verso route embed).
          Larghezza/altezza ottimizzate per il flow wizard (90vw x 90vh).
          Listener postMessage in alto chiude e auto-importa al completamento. */}
      <Dialog open={builderDialogOpen} onOpenChange={setBuilderDialogOpen}>
        <DialogContent className="max-w-7xl w-[95vw] h-[92vh] p-0 gap-0 flex flex-col">
          <DialogHeader className="px-4 py-3 border-b flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-orange-600" />
              <DialogTitle className="text-base">Genera nuovo render</DialogTitle>
            </div>
            <DialogDescription className="sr-only">
              Render builder Infissi caricato in modalita' embed.
              Al completamento si chiude automaticamente e importa nel BOM.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 bg-slate-50">
            {builderDialogOpen && (
              <iframe
                src="/azienda/render/infissi/embed?embed=1"
                title="Render Infissi builder"
                className="w-full h-full border-0"
                // sandbox impostato per consentire script + same-origin
                // (necessario per postMessage e auth via cookies).
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            )}
          </div>
          <div className="px-4 py-2 border-t bg-white flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>Al termine del render il dialog si chiude e l'immagine viene importata automaticamente.</span>
            {importRenderMut.isPending && (
              <span className="flex items-center gap-1 text-orange-700">
                <Loader2 className="h-3 w-3 animate-spin" /> Importazione in corso…
              </span>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {/* AlertDialog conferma eliminazione media — protegge dai click
          accidentali su render AI (costosi da rigenerare) e foto cantiere. */}
      <AlertDialog open={!!mediaToDelete} onOpenChange={(open) => !open && setMediaToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {mediaToDelete?.kind === "render" ? "Eliminare il render?" : "Eliminare la foto?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {mediaToDelete?.kind === "render"
                ? "Il render AI verrà rimosso dal preventivo. Per averlo di nuovo dovrai rigenerarlo dal modulo Render Infissi."
                : "La foto verrà rimossa dal preventivo. Questa azione non può essere annullata."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMediaMut.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteMedia}
              disabled={deleteMediaMut.isPending}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {deleteMediaMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
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
      <DialogContent className="max-h-[90dvh] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-3xl">
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
            <Sparkles className="h-10 w-10 mx-auto text-orange-300 mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              Non hai ancora generato nessun render. Vai al modulo Render Infissi per crearne uno.
            </p>
            <Button asChild className="bg-orange-500 hover:bg-orange-600">
              <a href="/azienda/render/infissi/new" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1" />
                Apri modulo Render
              </a>
            </Button>
          </div>
        ) : (
          <div className="grid max-h-[62dvh] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 md:grid-cols-3">
            {sessions.map((s) => {
              const urls = (s.result_urls ?? []) as string[];
              const url0 = urls[0];
              if (!url0) return null;
              return (
                <button
                  key={s.id}
                  disabled={importing}
                  onClick={() => onSelect(s.id, 0)}
                  className="group relative rounded-md overflow-hidden border bg-muted aspect-video text-left hover:ring-2 hover:ring-orange-500 transition disabled:opacity-50"
                >
                  <img loading="lazy" src={url0} alt="render" className="w-full h-full object-cover" />
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
