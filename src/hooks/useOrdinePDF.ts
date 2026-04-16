import { useState } from "react";
import { toast } from "sonner";

/**
 * Props minimi per l'OrdinePDF — inlined qui per evitare QUALSIASI
 * import statico (anche `import type`) verso OrdinePDF.tsx.
 *
 * Rolldown, anche con `import type`, in alcuni casi emette un
 * binding "ghost" verso la module-id del file delle types, che
 * finiva per trascinarsi dietro un simbolo di vendor-pdf
 * (EventEmitter polyfill) come dipendenza statica del chunk
 * di OrderDetail → download forzato di 740 KB di vendor-pdf al
 * mount della pagina, ANCHE se l'utente non clicca mai Scarica PDF.
 *
 * Soluzione: tipi inline, nessun import statico verso OrdinePDF.
 * I tipi sono volutamente permissivi (any[]) perché rispecchiano
 * l'interfaccia originale e verranno ristretti quando avremo
 * tipi generati da Supabase.
 */
export interface OrdinePDFProps {
  order: {
    id?: string;
    order_code?: string;
    [key: string]: unknown;
  };
  items?: unknown[];
  laborEmployees?: unknown[];
  laborTeams?: unknown[];
  salList?: unknown[];
  purchaseOrders?: unknown[];
  salespeople?: unknown[];
  campoAssignments?: unknown[];
  installments?: unknown[];
  giornaleLavori?: unknown[];
  varianti?: unknown[];
  diaryEvents?: unknown[];
  diaryMessages?: unknown[];
  companyName?: string;
  statuses?: unknown[];
}

/**
 * Velocity 2.H — PDF lib (@react-pdf/renderer + font embedding, ~740 KB gzip)
 * viene caricata ON-DEMAND al click su "Scarica PDF".
 *
 * Prima: OrderDetail.tsx importava useOrdinePDF → useOrdinePDF importava
 *        @react-pdf/renderer + OrdinePDF.tsx a livello di modulo →
 *        il chunk vendor-pdf veniva FETCHATO al mount della pagina
 *        anche se l'utente non cliccava mai Scarica PDF.
 *
 * Ora: gli import di `pdf` e `OrdinePDF` sono dentro downloadPDF → Rolldown
 *      emette un chunk async separato e il browser lo scarica solo quando
 *      l'utente lo richiede esplicitamente.
 */
export function useOrdinePDF() {
  const [isGenerating, setIsGenerating] = useState(false);

  const downloadPDF = async (opts: OrdinePDFProps) => {
    setIsGenerating(true);
    try {
      // Dynamic imports — qui avviene il code-split
      const [{ pdf }, { OrdinePDF }, React] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/orders/OrdinePDF"),
        import("react"),
      ]);

      // Cast a any: OrdinePDF definisce i suoi props con `any` per
      // compatibilità con tutti i tipi esistenti nel codebase.
      // I tipi runtime sono validati dal componente stesso.
      const element = React.createElement(OrdinePDF, opts as never);
      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Ordine-${opts.order?.order_code ?? "dettaglio"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF scaricato con successo");
    } catch (e) {
      console.error("Errore generazione PDF:", e);
      toast.error("Errore nella generazione del PDF");
    } finally {
      setIsGenerating(false);
    }
  };

  return { downloadPDF, isGenerating };
}
