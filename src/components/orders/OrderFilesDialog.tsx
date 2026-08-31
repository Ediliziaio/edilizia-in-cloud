/**
 * OrderFilesDialog — hub unico di tutti i file/documenti collegati a una commessa:
 *  - PDF riepilogo commessa (generato)
 *  - Fatture / documenti fiscali collegati
 *  - Allegati commessa (order_attachments)
 *  - Allegati degli articoli (schede tecniche, PDF prodotto)
 *
 * Gli allegati (commessa + articoli) vivono nel bucket privato "order-attachments"
 * e si aprono via signed URL. Il campo file_url contiene il PERCORSO relativo
 * (es. "orders/<id>/1-scheda.pdf"); le righe vecchie possono contenere un URL
 * intero, gestito dal marker piu' sotto.
 *
 * Anteprime: invece di un elenco di righe tutte uguali, i file diventano riquadri
 * con miniatura reale (immagini) o icona tipizzata, e un clic apre l'anteprima
 * dentro al popup — immagine a schermo o PDF nel visualizzatore del browser —
 * senza costringere a scaricare il file per capire cos'e'.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  FileText, Receipt, Paperclip, Package, Download, ExternalLink, Loader2,
  FolderOpen, ArrowLeft, ImageIcon, FileSpreadsheet, File as FileIcon,
} from "lucide-react";

interface FileDoc { id: string; file_name: string; file_url: string; file_type?: string | null; file_size?: number | null }
interface FiscalDoc { id: string; numero: string; tipo?: string | null; stato?: string | null; totale_da_pagare?: number | null }
interface ItemWithFiles { id: string; name?: string | null; attachments?: FileDoc[] | null }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fatture: FiscalDoc[];
  documenti: FileDoc[];
  items: ItemWithFiles[];
  /** Apre un allegato commessa (order_attachments) — handler già presente in OrderDetail. */
  onOpenDocumento: (d: FileDoc) => void;
  /** Etichetta tipo allegato commessa. */
  formatDocType?: (d: FileDoc) => string;
  /** Scarica un documento fiscale. */
  onDownloadFattura: (f: FiscalDoc) => void;
  /** Genera/scarica il PDF riepilogo della commessa. */
  onDownloadOrderPdf: () => void;
  pdfBusy?: boolean;
}

const BUCKET = "order-attachments";
const MARKER = `/${BUCKET}/`;

/** Dal valore salvato ricava il percorso dentro al bucket (regge anche gli URL interi legacy). */
function toStoragePath(fileUrl: string): string {
  if (fileUrl.includes(MARKER)) return fileUrl.split(MARKER)[1].split("?")[0];
  return fileUrl;
}

/** Apre un file del bucket in una scheda nuova via signed URL. */
async function openOrderAttachment(fileUrl: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(toStoragePath(fileUrl), 3600);
  if (error || !data?.signedUrl) { toast.error("Impossibile aprire il file"); return; }
  window.open(data.signedUrl, "_blank", "noopener");
}

type FileKind = "image" | "pdf" | "sheet" | "other";

/** Il tipo si decide dal MIME quando c'e', altrimenti dall'estensione del nome. */
function fileKind(d: FileDoc): FileKind {
  const mime = (d.file_type || "").toLowerCase();
  const ext = (d.file_name.split(".").pop() || "").toLowerCase();
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"].includes(ext)) return "image";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.includes("sheet") || mime.includes("excel") || ["xlsx", "xls", "csv"].includes(ext)) return "sheet";
  return "other";
}

function KindIcon({ kind, className }: { kind: FileKind; className?: string }) {
  if (kind === "image") return <ImageIcon className={className} />;
  if (kind === "pdf") return <FileText className={className} />;
  if (kind === "sheet") return <FileSpreadsheet className={className} />;
  return <FileIcon className={className} />;
}

const KIND_LABEL: Record<FileKind, string> = { image: "Immagine", pdf: "PDF", sheet: "Foglio", other: "File" };
/** Tinta per tipo: aiuta a riconoscere il file a colpo d'occhio nella griglia. */
const KIND_TINT: Record<FileKind, string> = {
  image: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  pdf: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  sheet: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  other: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

function fmtBytes(n?: number | null): string {
  if (typeof n !== "number" || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function fiscalTypeLabel(t?: string | null) {
  switch (t) {
    case "fattura": return "Fattura";
    case "nota_credito": return "Nota di credito";
    case "proforma": return "Proforma";
    case "ddt": return "DDT";
    case "preventivo": return "Preventivo";
    default: return t || "Documento";
  }
}
const fmtEur = (n?: number | null) =>
  typeof n === "number" ? new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n) : "";

/** Intestazione di sezione con conteggio. */
function SectionTitle({ icon: Icon, children, count }: { icon: typeof FileText; children: React.ReactNode; count?: number }) {
  return (
    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5" /> {children}
      {typeof count === "number" && count > 0 && (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{count}</span>
      )}
    </h4>
  );
}

export function OrderFilesDialog({
  open, onOpenChange, fatture, documenti, items, onOpenDocumento, formatDocType, onDownloadFattura, onDownloadOrderPdf, pdfBusy,
}: Props) {
  const navigate = useNavigate();
  /** File aperto in anteprima dentro al popup (null = si vede la griglia). */
  const [preview, setPreview] = useState<FileDoc | null>(null);

  const itemsWithFiles = useMemo(
    () => items.filter((i) => (i.attachments?.length ?? 0) > 0),
    [items],
  );
  const totalItemFiles = itemsWithFiles.reduce((s, i) => s + (i.attachments?.length ?? 0), 0);
  const isEmpty = fatture.length === 0 && documenti.length === 0 && totalItemFiles === 0;

  /** Tutti gli allegati (commessa + articoli): servono per firmare gli URL in blocco. */
  const allAttachments = useMemo(
    () => [...documenti, ...itemsWithFiles.flatMap((i) => i.attachments ?? [])],
    [documenti, itemsWithFiles],
  );

  /**
   * URL firmati di TUTTI gli allegati in una sola chiamata (createSignedUrls),
   * invece di una richiesta per miniatura. Servono sia per le anteprime delle
   * immagini nella griglia sia per il visualizzatore qui dentro.
   */
  const { data: signedByPath = {}, isLoading: signing } = useQuery({
    queryKey: ["order-files-signed", allAttachments.map((a) => a.file_url).sort().join("|")],
    enabled: open && allAttachments.length > 0,
    staleTime: 45 * 60 * 1000, // gli URL durano un'ora: non rifirmare a ogni apertura
    queryFn: async (): Promise<Record<string, string>> => {
      const paths = Array.from(new Set(allAttachments.map((a) => toStoragePath(a.file_url))));
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
      if (error) return {};
      const map: Record<string, string> = {};
      (data ?? []).forEach((r) => { if (r.signedUrl && r.path) map[r.path] = r.signedUrl; });
      return map;
    },
  });

  const urlOf = (d: FileDoc): string | undefined => signedByPath[toStoragePath(d.file_url)];

  /** Riquadro file: miniatura vera per le immagini, icona tipizzata per il resto. */
  const FileTile = ({ d }: { d: FileDoc }) => {
    const kind = fileKind(d);
    const url = urlOf(d);
    const size = fmtBytes(d.file_size);
    return (
      <button
        type="button"
        onClick={() => setPreview(d)}
        title={d.file_name}
        className="group flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative flex h-24 items-center justify-center overflow-hidden bg-muted/40">
          {kind === "image" && url ? (
            <img
              src={url}
              alt={d.file_name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
            />
          ) : signing && kind === "image" ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <KindIcon kind={kind} className="h-8 w-8 text-muted-foreground/70" />
          )}
          <span className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${KIND_TINT[kind]}`}>
            {KIND_LABEL[kind]}
          </span>
        </div>
        <div className="min-w-0 px-2.5 py-2">
          <div className="truncate text-xs font-medium">{d.file_name}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {formatDocType ? formatDocType(d) : KIND_LABEL[kind]}{size ? ` · ${size}` : ""}
          </div>
        </div>
      </button>
    );
  };

  /* ── Anteprima a tutta larghezza dentro al popup ─────────────────────────── */
  if (preview) {
    const kind = fileKind(preview);
    const url = urlOf(preview);
    return (
      <Dialog open={open} onOpenChange={(v) => { if (!v) setPreview(null); onOpenChange(v); }}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2 pr-8">
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setPreview(null)} aria-label="Torna ai documenti">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <KindIcon kind={kind} className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-base">{preview.file_name}</span>
            </DialogTitle>
            <DialogDescription>
              {KIND_LABEL[kind]}{fmtBytes(preview.file_size) ? ` · ${fmtBytes(preview.file_size)}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/30">
            {!url ? (
              <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparo l'anteprima…
              </div>
            ) : kind === "image" ? (
              <img src={url} alt={preview.file_name} className="mx-auto max-h-[62vh] object-contain" />
            ) : kind === "pdf" ? (
              /* Il visualizzatore PDF del browser: nessuna libreria da caricare. */
              <iframe src={url} title={preview.file_name} className="h-[62vh] w-full border-0 bg-white" />
            ) : (
              <div className="flex h-72 flex-col items-center justify-center gap-2 px-6 text-center">
                <KindIcon kind={kind} className="h-10 w-10 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">
                  Questo tipo di file non si può sfogliare qui: scaricalo o aprilo in una scheda nuova.
                </p>
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap justify-end gap-2 pt-3">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openOrderAttachment(preview.file_url)}>
              <ExternalLink className="h-4 w-4" /> Apri in una scheda
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => onOpenDocumento(preview)}>
              <Download className="h-4 w-4" /> Scarica
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  /* ── Elenco ──────────────────────────────────────────────────────────────── */
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" /> Documenti e file della commessa
          </DialogTitle>
          <DialogDescription>
            PDF, fatture, allegati e schede prodotto collegati. Clicca un file per vederlo senza scaricarlo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* PDF riepilogo commessa — sempre disponibile, anche a commessa vuota */}
          <section className="space-y-2">
            <SectionTitle icon={FileText}>Riepilogo commessa</SectionTitle>
            <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={onDownloadOrderPdf} disabled={pdfBusy}>
              {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-blue-600" />}
              Scarica PDF riepilogo (articoli, costi, SAL, diario…)
            </Button>
          </section>

          {/* Fatture / documenti fiscali — righe, non riquadri: qui contano numero e importo */}
          {fatture.length > 0 && (
            <section className="space-y-2">
              <SectionTitle icon={Receipt} count={fatture.length}>Fatture e documenti fiscali</SectionTitle>
              <ul className="space-y-1.5">
                {fatture.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 rounded-md border bg-card p-2 text-sm">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { onOpenChange(false); navigate(`/azienda/documenti/${f.id}`); }}>
                      <span className="font-medium truncate inline-flex items-center gap-1">{f.numero} <ExternalLink className="h-3 w-3 opacity-50" /></span>
                      <span className="block text-[11px] text-muted-foreground">{fiscalTypeLabel(f.tipo)}{f.stato ? ` · ${f.stato}` : ""}</span>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      {f.totale_da_pagare != null && <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtEur(f.totale_da_pagare)}</span>}
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Scarica ${f.numero}`} onClick={() => onDownloadFattura(f)}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Allegati commessa */}
          {documenti.length > 0 && (
            <section className="space-y-2">
              <SectionTitle icon={Paperclip} count={documenti.length}>Allegati commessa</SectionTitle>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                {documenti.map((d) => <FileTile key={d.id} d={d} />)}
              </div>
            </section>
          )}

          {/* Allegati / schede degli articoli */}
          {itemsWithFiles.length > 0 && (
            <section className="space-y-3">
              <SectionTitle icon={Package} count={totalItemFiles}>Schede e allegati articoli</SectionTitle>
              {itemsWithFiles.map((it) => (
                <div key={it.id} className="space-y-2">
                  <div className="truncate text-xs font-medium text-foreground/80">{it.name || "Articolo"}</div>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                    {(it.attachments ?? []).map((a) => <FileTile key={a.id} d={a} />)}
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* Un solo stato vuoto, invece di tre "nessun…" uno sotto l'altro */}
          {isEmpty && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center">
              <FolderOpen className="h-9 w-9 text-muted-foreground/40" />
              <p className="text-sm font-medium">Nessun file collegato a questa commessa</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Fatture, allegati e schede prodotto compariranno qui. Intanto puoi scaricare il PDF riepilogo qui sopra.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default OrderFilesDialog;
