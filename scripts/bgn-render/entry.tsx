// Same renderer and frozen project used by the app. No inferred chapters,
// default model, tax rate or silent simplified-PDF fallback.
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { enrichBagniPdf, type BgnPdfPayload } from "@/hooks/useBagniPDF";
import { BagniPDF } from "@/components/bagni/BagniPDF";
import { validateBathroomRenderInput } from "../../supabase/functions/_shared/bathroomRenderInput";

export async function renderBagnoReale(input: BgnPdfPayload): Promise<Uint8Array> {
  validateBathroomRenderInput(input);
  const enriched = await enrichBagniPdf(input);
  if (Math.abs(enriched.totali.totale - input.progetto.totale) > 0.005 ||
      Math.abs(enriched.totali.imponibile - input.progetto.totale_imponibile) > 0.005) {
    throw new Error("Il totale del documento non coincide con il progetto. PDF non generato.");
  }
  const buf = await renderToBuffer(<BagniPDF {...enriched} />);
  return new Uint8Array(buf);
}
