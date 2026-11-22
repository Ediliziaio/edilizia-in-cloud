import { useEffect, useMemo, useRef } from "react";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { createPdfPreviewUrl } from "@/lib/pdfPreviewSource";
import type { DatiStampaPos } from "../../../../supabase/functions/_shared/posHtml";

type Props = Pick<DatiStampaPos, "contenuto" | "revisione" | "revisioni" | "codiceCommessa">;

export function AnteprimaBozzaPos({ contenuto, revisione, revisioni, codiceCommessa }: Props) {
  const lavoro = useRef<AbortController | null>(null);
  const dati = useMemo<DatiStampaPos>(() => ({
    contenuto, revisione, revisioni, codiceCommessa, stato: "bozza",
  }), [contenuto, revisione, revisioni, codiceCommessa]);
  const chiave = useMemo(() => JSON.stringify(dati), [dati]);

  useEffect(() => () => lavoro.current?.abort(), [chiave]);

  async function genera() {
    lavoro.current?.abort();
    const avvio = new AbortController();
    lavoro.current = avvio;
    try {
      const [{ costruisciHtmlPos }, { disegnaPdfPosNelBrowser }] = await Promise.all([
        import("../../../../supabase/functions/_shared/posHtml"),
        import("@/lib/sicurezza/disegnaPdfPos"),
      ]);
      avvio.signal.throwIfAborted();
      const bytes = await disegnaPdfPosNelBrowser({
        html: costruisciHtmlPos(dati), codice: codiceCommessa ?? "",
        revisione, emessoIl: new Date().toISOString(), anteprima: true,
      }, { segnale: avvio.signal, tempoAvvioMs: 12_000, tempoMassimoMs: 30_000 });
      avvio.signal.throwIfAborted();
      return createPdfPreviewUrl(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }));
    } finally {
      if (lavoro.current === avvio) lavoro.current = null;
    }
  }

  return <PdfBlobLivePreviewPanel renderBlobUrl={genera} depsKey={chiave} debounceMs={750}
    headerLabel="PDF bozza" accentClass="text-primary" downloadFileName={`POS-${codiceCommessa || "cantiere"}-bozza.pdf`}
    showDownloadOnMobile />;
}
