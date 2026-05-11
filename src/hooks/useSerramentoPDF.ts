/**
 * useSerramentoPDF — download PDF cliente del preventivo serramenti.
 *
 * Pattern mutuato da useOrdinePDF (per evitare di trascinarsi 740 KB di
 * vendor-pdf nel chunk principale quando l'utente non clicca mai "Scarica PDF"):
 * - Tipi inline qui (zero import statici verso SerramentoPDF.tsx).
 * - `pdf()` + `SerramentoPDF` importati dinamicamente dentro `downloadPDF`.
 * - Rolldown emette un chunk async separato che il browser scarica al click.
 */
import { useState } from "react";
import { toast } from "sonner";
import type { SrProgettoDetail, SrTemplatePdfRow } from "@/types/serramenti";

export interface SerramentoPdfPayload {
  detail: SrProgettoDetail;
  template?: SrTemplatePdfRow | null;
  company?: {
    name?: string | null;
    ragione_sociale?: string | null;
    indirizzo?: string | null;
    telefono?: string | null;
    email?: string | null;
    partita_iva?: string | null;
    logo_url?: string | null;
  } | null;
}

export function useSerramentoPDF() {
  const [isGenerating, setIsGenerating] = useState(false);

  const downloadPDF = async (opts: SerramentoPdfPayload): Promise<{ ok: boolean; blob?: Blob; url?: string }> => {
    setIsGenerating(true);
    try {
      // Dynamic imports — qui Rolldown fa il code-split. Niente di tutto questo
      // viene caricato finché l'utente non clicca "Scarica PDF".
      const [{ pdf }, { SerramentoPDF }, React] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/serramenti/SerramentoPDF"),
        import("react"),
      ]);

      const element = React.createElement(SerramentoPDF, opts);
      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const filename = `Preventivo-${opts.detail.progetto.code ?? "stima"}-${
        [opts.detail.progetto.cliente_nome, opts.detail.progetto.cliente_cognome].filter(Boolean).join("_") || "cliente"
      }.pdf`;
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF scaricato con successo", { description: filename });
      return { ok: true, blob, url };
    } catch (err) {
      // Log dettagliato in console per debug, toast utente più amichevole
      // eslint-disable-next-line no-console
      console.error("Errore generazione PDF serramenti:", err);
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error("Errore nella generazione del PDF", { description: msg });
      return { ok: false };
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * Genera il PDF e lo apre in una nuova tab (per anteprima senza download
   * forzato). Utile come alternativa al download diretto.
   */
  const previewPDF = async (opts: SerramentoPdfPayload): Promise<void> => {
    setIsGenerating(true);
    try {
      const [{ pdf }, { SerramentoPDF }, React] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/serramenti/SerramentoPDF"),
        import("react"),
      ]);
      const element = React.createElement(SerramentoPDF, opts);
      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (!win) {
        toast.success("PDF generato", {
          description: "Apertura bloccata dal browser.",
          action: { label: "Apri", onClick: () => window.open(url, "_blank") },
          duration: 10000,
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Errore preview PDF serramenti:", err);
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error("Errore nella generazione del PDF", { description: msg });
    } finally {
      setIsGenerating(false);
    }
  };

  return { downloadPDF, previewPDF, isGenerating };
}
