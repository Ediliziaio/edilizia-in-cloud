/**
 * PdfBlobLivePreviewPanel — pannello anteprima PDF LIVE persistente, condiviso da
 * tutti i vertical che generano il preventivo come BLOB PDF mostrato in un
 * <iframe src={blobUrl}> (Bagni, Ristrutturazione, Elettrico, Termoidraulico,
 * Tetti, Piscine, Pavimenti, Climatizzazione).
 *
 * A differenza del dialog (modale, on-demand), è SEMPRE visibile a lato dell'editor
 * e si rigenera in modo DEBOUNCED ad ogni modifica del template. Il visore PDF
 * nativo del browser dentro l'iframe gestisce scroll di tutte le pagine + zoom.
 *
 * Il vertical passa una `renderBlobUrl()` (che costruisce i mock + chiama il suo
 * renderXxxPreviewBlobUrl) e una `depsKey` che, cambiando, ritriggera la generazione.
 */
import { useCallback } from "react";
import { Loader2, RefreshCw, ExternalLink, Eye, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGenerazioneProtetta } from "./livePreview/useGenerazioneProtetta";

interface Props {
  /** Costruisce (async) il blob URL del PDF con mock + template correnti. */
  renderBlobUrl: () => Promise<string>;
  /** Chiave che rappresenta lo stato visivo: quando cambia, rigenera (debounced). */
  depsKey: string;
  /** Abilita la generazione solo quando true (es. companyId disponibile). */
  enabled?: boolean;
  debounceMs?: number;
  /** Classe colore accent per il titolo (default arancio). */
  accentClass?: string;
}

export function PdfBlobLivePreviewPanel({
  renderBlobUrl,
  depsKey,
  enabled = true,
  debounceMs = 500,
  accentClass = "text-orange-600",
}: Props) {
  // Debounce, timeout, corsa tra generazioni e revoca dei blob: tutto nell'hook
  // condiviso, così ogni pannello (compreso il Fotovoltaico, che è HTML) eredita
  // le stesse protezioni invece di riscriverle — o dimenticarle.
  const scartaBlob = useCallback((u: string) => URL.revokeObjectURL(u), []);
  const { risultato: url, caricamento: loading, errore: error, rigenera: forceRegen } =
    useGenerazioneProtetta<string>(renderBlobUrl, depsKey, {
      abilitato: enabled,
      debounceMs,
      onScarta: scartaBlob,
    });

  return (
    <div className="flex flex-col h-full rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Eye className={"h-3.5 w-3.5 shrink-0 " + accentClass} />
          <span className={"text-[11px] font-semibold uppercase tracking-wide truncate " + accentClass}>
            Anteprima live PDF
          </span>
          {loading && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> aggiorno…
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="icon" variant="ghost" onClick={forceRegen} disabled={loading || !enabled} title="Aggiorna ora" className="h-7 w-7">
            <RefreshCw className={"h-3.5 w-3.5 " + (loading ? "animate-spin" : "")} />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => url && window.open(url, "_blank")} disabled={!url} title="Apri in nuova scheda" className="h-7 w-7">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="relative flex-1 min-h-0 bg-muted/40">
        {loading && !url && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 p-4 text-center">
              <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
              <p className="text-[11px] text-muted-foreground">Genero l'anteprima…</p>
            </div>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="flex flex-col items-center gap-2 max-w-[260px] text-center">
              <AlertCircle className="h-6 w-6 text-rose-600" />
              <p className="text-[11px] text-muted-foreground">{error}</p>
              <Button size="sm" variant="outline" onClick={forceRegen} className="mt-1 h-7 text-[11px]">Riprova</Button>
            </div>
          </div>
        )}
        {url && (
          <iframe title="Anteprima PDF" src={url} className="h-full w-full border-0 bg-white" />
        )}
        {!url && !loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-[11px] text-muted-foreground">In attesa…</p>
          </div>
        )}
      </div>
    </div>
  );
}
