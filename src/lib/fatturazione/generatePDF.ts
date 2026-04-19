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

  // P1 FIX: popup bloccati → fallback download diretto invece di fallire
  // silenziosamente. L'utente vede il file scaricato e sa cosa è successo.
  if (!w) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || `documento-${documentoId}.html`;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Cleanup dopo il click (evitiamo revoke immediato)
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    throw new Error(
      "Popup bloccato dal browser. Il PDF è stato scaricato come file HTML. Abilita i popup per questo sito per la stampa diretta.",
    );
  }

  w.onload = () => {
    w.print();
  };
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
