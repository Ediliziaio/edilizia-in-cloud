/**
 * OrderFilesDialog — hub unico di tutti i file/documenti collegati a una commessa:
 *  - PDF riepilogo commessa (generato)
 *  - Fatture / documenti fiscali collegati
 *  - Allegati commessa (order_attachments)
 *  - Allegati degli articoli (schede tecniche, PDF prodotto)
 *
 * Riusa i dati/handler già presenti in OrderDetail; gli allegati (commessa+articoli)
 * vivono nel bucket "order-attachments" e si aprono via signed URL.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Receipt, Paperclip, Package, Download, ExternalLink, Loader2, FolderOpen } from "lucide-react";

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

/** Apre un file del bucket order-attachments (path relativo o URL completo) via signed URL. */
async function openOrderAttachment(fileUrl: string) {
  let path = fileUrl;
  const marker = "/order-attachments/";
  if (fileUrl.includes(marker)) path = fileUrl.split(marker)[1].split("?")[0];
  const { data, error } = await supabase.storage.from("order-attachments").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) { toast.error("Impossibile aprire il file"); return; }
  window.open(data.signedUrl, "_blank", "noopener");
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
  typeof n === "number" ? new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n) : "";

export function OrderFilesDialog({
  open, onOpenChange, fatture, documenti, items, onOpenDocumento, formatDocType, onDownloadFattura, onDownloadOrderPdf, pdfBusy,
}: Props) {
  const navigate = useNavigate();
  const itemsWithFiles = useMemo(
    () => items.filter((i) => (i.attachments?.length ?? 0) > 0),
    [items],
  );
  const totalItemFiles = itemsWithFiles.reduce((s, i) => s + (i.attachments?.length ?? 0), 0);
  const isEmpty = fatture.length === 0 && documenti.length === 0 && totalItemFiles === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" /> Documenti e file della commessa
          </DialogTitle>
          <DialogDescription>PDF, fatture, allegati e schede prodotto collegati.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* PDF riepilogo commessa */}
          <section className="space-y-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Riepilogo commessa
            </h4>
            <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={onDownloadOrderPdf} disabled={pdfBusy}>
              {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-blue-600" />}
              Scarica PDF riepilogo (articoli, costi, SAL, diario…)
            </Button>
          </section>

          {/* Fatture / documenti fiscali */}
          <section className="space-y-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5" /> Fatture e documenti fiscali
              {fatture.length > 0 && <span className="text-muted-foreground/70">({fatture.length})</span>}
            </h4>
            {fatture.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nessun documento fiscale collegato.</p>
            ) : (
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
            )}
          </section>

          {/* Allegati commessa */}
          <section className="space-y-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5" /> Allegati commessa
              {documenti.length > 0 && <span className="text-muted-foreground/70">({documenti.length})</span>}
            </h4>
            {documenti.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nessun allegato caricato sulla commessa.</p>
            ) : (
              <ul className="space-y-1.5">
                {documenti.map((d) => (
                  <li key={d.id}>
                    <button type="button" onClick={() => onOpenDocumento(d)}
                      className="flex w-full items-center justify-between gap-2 rounded-md border bg-card p-2 text-left text-sm hover:bg-accent transition-colors">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{d.file_name}</div>
                        <div className="text-[11px] text-muted-foreground">{formatDocType ? formatDocType(d) : (d.file_type || "File")}</div>
                      </div>
                      <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Allegati / schede degli articoli */}
          <section className="space-y-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" /> Schede e allegati articoli
              {totalItemFiles > 0 && <span className="text-muted-foreground/70">({totalItemFiles})</span>}
            </h4>
            {itemsWithFiles.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nessun allegato sugli articoli.</p>
            ) : (
              <div className="space-y-3">
                {itemsWithFiles.map((it) => (
                  <div key={it.id} className="space-y-1">
                    <div className="text-xs font-medium text-foreground/80 truncate">{it.name || "Articolo"}</div>
                    <ul className="space-y-1.5">
                      {(it.attachments ?? []).map((a) => (
                        <li key={a.id}>
                          <button type="button" onClick={() => openOrderAttachment(a.file_url)}
                            className="flex w-full items-center justify-between gap-2 rounded-md border bg-card p-2 text-left text-sm hover:bg-accent transition-colors">
                            <span className="truncate">{a.file_name}</span>
                            <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          {isEmpty && (
            <p className="text-center text-sm text-muted-foreground py-2">
              Nessun documento fiscale o allegato presente. Puoi comunque scaricare il <strong>PDF riepilogo</strong> qui sopra.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default OrderFilesDialog;
