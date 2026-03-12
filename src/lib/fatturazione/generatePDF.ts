// src/lib/fatturazione/generatePDF.ts
// Client-side helper to call the generate-native-pdf edge function

import { supabase } from "@/integrations/supabase/client";

/**
 * Calls the edge function to generate a PDF and triggers a download.
 */
export async function downloadNativePDF(documentoId: string, filename?: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("generate-native-pdf", {
    body: { documento_id: documentoId },
  });

  if (error) {
    // Extract detailed error from response context
    const detail = error.context ? await error.context.json?.().catch((): null => null) : null;
    throw new Error(detail?.error || error.message || "Errore nella generazione del PDF");
  }

  if (!data?.html) {
    throw new Error("Nessun contenuto PDF generato");
  }

  // Open HTML in new tab for print/save as PDF
  const blob = new Blob([data.html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (w) {
    w.onload = () => {
      w.print();
    };
  }
  // Cleanup after delay
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/**
 * Generates and uploads the PDF, returning the storage URL.
 */
export async function uploadNativePDF(documentoId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("generate-native-pdf", {
    body: { documento_id: documentoId, upload: true },
  });

  if (error) {
    const detail = error.context ? await error.context.json?.().catch((): null => null) : null;
    throw new Error(detail?.error || error.message || "Errore nell'upload del PDF");
  }

  return data?.pdf_url ?? "";
}
