/**
 * Il documento vero del fotovoltaico, a destra del wizard (07/11/2026).
 *
 * Florin: «a destra vorrei vedere l'anteprima proprio del PDF che si va a generare». Il preventivo fotovoltaico
 * è HTML, fatto da `fv-genera-pdf` (`renderFvPdfHtml`) coi dati salvati del progetto: impianto, produzione,
 * finanziamento, viste satellitari. Qui si chiede la stessa pagina con `solo_anteprima` — niente storage, niente
 * registro — e la si mostra in un iframe, rimpicciolita come in `FvLivePreviewPanel`.
 *
 * Si rifà dopo ogni salvataggio del progetto (`versione`), non a ogni tasto: ogni giro chiede a Google le viste
 * satellitari. Un giro alla volta, e fermo quando la colonna non si vede.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { LARGHEZZA_A4_PX, useFitScale } from "@/components/shared/livePreview/useFitScale";

interface Props {
  progettoId: string;
  /** Cambia a ogni salvataggio del progetto: è quello che rifà la pagina. */
  versione: string;
  /** Come la chiamata di «Genera PDF»: il layout reale dei pannelli e la falda. */
  extra?: Record<string, unknown>;
  attivo: boolean;
}

export function PdfVeroFotovoltaico({ progettoId, versione, extra, attivo }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [pagine, setPagine] = useState<number | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const [aggiornatoAlle, setAggiornatoAlle] = useState<string | null>(null);
  const fit = useFitScale(LARGHEZZA_A4_PX);
  const occupato = useRef(false);
  const daRifare = useRef(false);
  const ultimaChiave = useRef("");
  const extraRef = useRef(extra);
  extraRef.current = extra;
  const chiave = `${progettoId}:${versione}`;

  const giro = useCallback(async (): Promise<void> => {
    if (occupato.current) { daRifare.current = true; return; }
    occupato.current = true;
    setInCorso(true);
    try {
      const { data, error } = await supabase.functions.invoke("fv-genera-pdf", {
        body: { progetto_id: progettoId, tipo: "vendita", solo_anteprima: true, ...(extraRef.current ?? {}) },
      });
      if (error) {
        const dettaglio = await (error as { context?: Response }).context?.json?.().catch((): null => null);
        throw new Error((dettaglio as { error?: string } | null)?.error || "La pagina non si è aggiornata: riprova.");
      }
      const d = (data ?? {}) as { html?: string; pages_count?: number };
      if (typeof d.html !== "string" || !d.html) throw new Error("Il server non ha restituito la pagina.");
      setHtml(d.html);
      setPagine(typeof d.pages_count === "number" ? d.pages_count : null);
      setErrore("");
      setAggiornatoAlle(new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore sconosciuto");
    } finally {
      occupato.current = false;
      setInCorso(false);
      if (daRifare.current) { daRifare.current = false; void giro(); }
    }
  }, [progettoId]);

  useEffect(() => {
    if (!attivo || chiave === ultimaChiave.current) return;
    ultimaChiave.current = chiave;
    void giro();
  }, [attivo, chiave, giro]);

  const scala = fit.scala;
  return (
    <div className="flex h-[calc(100dvh-11rem)] min-h-[420px] flex-col rounded-md border border-slate-200 bg-slate-100">
      <div className="flex items-center justify-between border-b bg-white px-3 py-1.5 text-[11px] text-slate-600">
        <span className="flex items-center gap-1.5" role="status">
          {inCorso && <Loader2 className="h-3 w-3 animate-spin" />}
          {inCorso
            ? "Aggiorno il documento…"
            : html
              ? `${pagine ? `${pagine} pagine · ` : ""}aggiornato alle ${aggiornatoAlle}, all'ultimo salvataggio`
              : "Documento del preventivo"}
        </span>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => void giro()} aria-label="Aggiorna il documento ora">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
      <div ref={fit.ref} className="flex-1 overflow-auto">
        {errore && !html ? (
          <div className="m-3 space-y-2 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <p className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Il documento non si è generato: {errore}</p>
            <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => void giro()}>Riprova</Button>
          </div>
        ) : !html ? (
          <p className="m-6 text-center text-xs text-slate-500">{attivo ? "Preparo il documento…" : "Il documento si prepara quando il pannello è aperto."}</p>
        ) : (
          // Due livelli, come in FvLivePreviewPanel: fuori lo spazio già ridotto, dentro il foglio vero rimpicciolito.
          <div style={{ width: LARGHEZZA_A4_PX * scala, height: "100%", overflow: "hidden" }}>
            <div style={{ width: LARGHEZZA_A4_PX, height: `${100 / scala}%`, transform: `scale(${scala})`, transformOrigin: "top left" }}>
              <iframe
                srcDoc={html}
                sandbox="allow-same-origin"
                title="Il documento vero del preventivo fotovoltaico"
                className="border-0 bg-white"
                style={{ width: LARGHEZZA_A4_PX, height: "100%", border: 0 }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PdfVeroFotovoltaico;
