import { useState, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import { apriDocumentoNativo } from "@/lib/mobile/documenti";
import { condividiFile } from "@/lib/mobile/condividiFile";
import { readPdfPreviewBlob } from "@/lib/pdfPreviewSource";

/** Un normale link sul web; nell'app apre o salva il file senza abbandonare la schermata. */
export function DocumentFileLink({ href, download, onClick, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const [busy, setBusy] = useState(false);
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (busy || props["aria-disabled"] === true || props["aria-disabled"] === "true") { event.preventDefault(); return; }
    if (event.defaultPrevented || !Capacitor.isNativePlatform() || !href) return;
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const nome = typeof download === "string" ? download : (href.split(/[?#]/, 1)[0].split("/").pop() || "documento");
    void (async () => {
      if (download !== undefined && download !== false) await condividiFile(await readPdfPreviewBlob(href), nome, nome);
      else await apriDocumentoNativo(href, nome);
    })().catch(() => toast.error("Documento non disponibile. Riprova.")).finally(() => setBusy(false));
  };
  return <a {...props} href={href} download={download} onClick={click} aria-disabled={busy || props["aria-disabled"]}>{children}</a>;
}
