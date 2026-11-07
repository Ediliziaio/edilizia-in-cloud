// Same renderer and frozen project used by the app. No inferred chapters,
// default model, tax rate or silent simplified-PDF fallback.
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { enrichBagniPdf, type BgnPdfPayload } from "@/hooks/useBagniPDF";
import { BagniPDF } from "@/components/bagni/BagniPDF";
import { validateBathroomRenderInput } from "../../supabase/functions/_shared/bathroomRenderInput";
import { CHIAVE_ARCHIVIO } from "../../supabase/functions/_shared/condizioniArchivio";

export async function renderBagnoReale(input: BgnPdfPayload): Promise<Uint8Array> {
  validateBathroomRenderInput(input);
  // Il server ha già letto l'archivio «Contratti e condizioni» (qui non c'è un database): si appoggia sul
  // modello congelato, dove il PDF lo cerca, e il caricatore del browser non lo rilegge.
  const archivio = (input as { condizioni_archivio?: unknown }).condizioni_archivio;
  const snapshot = input.progetto.modello_snapshot as { template?: Record<string, unknown> } | null | undefined;
  const conArchivio = archivio && snapshot?.template
    ? { ...input, progetto: { ...input.progetto, modello_snapshot: { ...snapshot, template: { ...snapshot.template, [CHIAVE_ARCHIVIO]: archivio } } } }
    : input;
  const enriched = await enrichBagniPdf(conArchivio as BgnPdfPayload);
  if (Math.abs(enriched.totali.totale - input.progetto.totale) > 0.005 ||
      Math.abs(enriched.totali.imponibile - input.progetto.totale_imponibile) > 0.005) {
    throw new Error("Il totale del documento non coincide con il progetto. PDF non generato.");
  }
  const buf = await renderToBuffer(<BagniPDF {...enriched} />);
  return new Uint8Array(buf);
}
