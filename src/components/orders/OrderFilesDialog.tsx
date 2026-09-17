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
 * I file sono riquadri con la miniatura salvata al caricamento (o l'icona del
 * tipo); un clic scarica il file.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Receipt, Paperclip, Package, Download, ExternalLink, Loader2, FolderOpen } from "lucide-react";
import { FileThumb } from "./filePreview";
import {
  useUrlMiniature, fmtBytes, fileKind, scaricaAllegato, KIND_LABEL, KIND_TINT,
  type PreviewableFile,
} from "./filePreviewUtils";

import { useIsMobile } from "@/hooks/use-mobile";
interface FileDoc { id: string; file_name: string; file_url: string; file_type?: string | null; file_size?: number | null; thumb_path?: string | null }
interface FiscalDoc { id: string; numero: string; tipo?: string | null; stato?: string | null; totale_da_pagare?: number | null }
interface ItemWithFiles { id: string; name?: string | null; attachments?: FileDoc[] | null }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fatture: FiscalDoc[];
  documenti: FileDoc[];
  items: ItemWithFiles[];
  /** Non più usato: cliccando, gli allegati si scaricano. */
  onOpenDocumento?: (d: FileDoc) => void;
  /** Etichetta tipo allegato commessa. */
  formatDocType?: (d: FileDoc) => string;
  /** Scarica un documento fiscale. */
  onDownloadFattura: (f: FiscalDoc) => void;
  /** Genera/scarica il PDF riepilogo della commessa. */
  onDownloadOrderPdf: () => void;
  pdfBusy?: boolean;
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
  open, onOpenChange, fatture, documenti, items, formatDocType, onDownloadFattura, onDownloadOrderPdf, pdfBusy,
}: Props) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
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

  const { data: miniature = {} } = useUrlMiniature(allAttachments.map((d) => d.thumb_path), open);
  const miniaturaDi = (d: FileDoc) => (d.thumb_path ? miniature[d.thumb_path] : undefined);

  /** Riquadro file: miniatura vera per le immagini, icona tipizzata per il resto. */
  const FileTile = ({ d }: { d: FileDoc }) => {
    const kind = fileKind(d);
    const peso = fmtBytes(d.file_size);
    return (
      <button
        type="button"
        onClick={() => void scaricaAllegato(d.file_url, d.file_name)}
        title={d.file_name}
        className="group flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative flex h-24 items-center justify-center overflow-hidden bg-muted/40 [&>div]:h-full [&>div]:w-full [&>div]:rounded-none [&>div]:border-0">
          <FileThumb file={d as unknown as PreviewableFile} thumbUrl={miniaturaDi(d)} size="tile" />
          <span className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${KIND_TINT[kind]}`}>
            {KIND_LABEL[kind]}
          </span>
        </div>
        <div className="min-w-0 px-2.5 py-2">
          <div className="truncate text-xs font-medium">{d.file_name}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {formatDocType ? formatDocType(d) : KIND_LABEL[kind]}{peso ? ` · ${peso}` : ""}
          </div>
        </div>
      </button>
    );
  };

  /* ── Elenco ──────────────────────────────────────────────────────────────── */
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" /> Documenti e file della commessa
          </DialogTitle>
          <DialogDescription>
            PDF, fatture, allegati e schede prodotto collegati. Clicca un file per scaricarlo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* PDF riepilogo commessa — sempre disponibile, anche a commessa vuota */}
          {/* Il riepilogo è un PDF da scrivania: su telefono non compare. */}
          {!isMobile && (
            <section className="space-y-2">
              <SectionTitle icon={FileText}>Riepilogo commessa</SectionTitle>
              <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={onDownloadOrderPdf} disabled={pdfBusy}>
                {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-blue-600" />}
                Scarica PDF riepilogo (articoli, costi, SAL, diario…)
              </Button>
            </section>
          )}

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
                      {/* La fattura resta raggiungibile: si tocca la riga e si
                          apre la sua pagina. Sparisce solo lo scarico. */}
                      {!isMobile && (
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Scarica ${f.numero}`} onClick={() => onDownloadFattura(f)}>
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
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
