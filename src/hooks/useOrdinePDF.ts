import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import React from "react";
import { toast } from "sonner";
import { OrdinePDF, type OrdinePDFProps } from "@/components/orders/OrdinePDF";

export function useOrdinePDF() {
  const [isGenerating, setIsGenerating] = useState(false);

  const downloadPDF = async (opts: OrdinePDFProps) => {
    setIsGenerating(true);
    try {
      const element = React.createElement(OrdinePDF, opts);
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
