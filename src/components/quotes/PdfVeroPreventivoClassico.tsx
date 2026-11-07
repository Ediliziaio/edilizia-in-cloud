/**
 * Il PDF vero del preventivo classico, a destra dell'editor (07/11/2026).
 *
 * Il PDF del preventivo classico lo fa il server (`generate-quote-pdf`): modello e blocchi collegati, archivio
 * delle condizioni, campi del contratto, immagini riservate. Mentre si scrive il preventivo non è ancora
 * salvato, quindi si manda la bozza com'è sullo schermo (`solo_anteprima` + `bozza`): il server la stampa con
 * la stessa strada di «Scarica PDF», senza salvare né caricare niente. Si chiama solo a pannello visibile,
 * 1,5 s dopo l'ultima modifica e un giro alla volta (`AnteprimaPdfVero`).
 */
import { useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AnteprimaPdfVero } from "@/components/preventivatore/AnteprimaPdfVero";

export interface BozzaPerIlPdf {
  quote: Record<string, unknown>;
  items: Record<string, unknown>[];
}

/** I byte del PDF dalla risposta del server: in base64, o (preventivo di un modulo) dal suo link. */
export async function pdfDallaRisposta(data: unknown): Promise<Blob> {
  const d = (data ?? {}) as { pdf_base64?: string; signed_url?: string; error?: string };
  if (typeof d.pdf_base64 === "string" && d.pdf_base64) {
    const binario = atob(d.pdf_base64);
    return new Blob([Uint8Array.from(binario, (c) => c.charCodeAt(0))], { type: "application/pdf" });
  }
  if (typeof d.signed_url === "string" && d.signed_url) {
    const r = await fetch(d.signed_url);
    if (!r.ok) throw new Error("Il PDF non si è scaricato.");
    return r.blob();
  }
  throw new Error(d.error || "Il server non ha restituito il PDF.");
}

interface Props {
  /** Il preventivo salvato, se c'è: per numero, stato, contatto e allegati. Senza, è un preventivo nuovo. */
  quoteId?: string | null;
  bozza: BozzaPerIlPdf;
  attivo: boolean;
}

export function PdfVeroPreventivoClassico({ quoteId, bozza, attivo }: Props) {
  const chiave = useMemo(() => JSON.stringify([quoteId ?? null, bozza]), [quoteId, bozza]);
  const genera = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("generate-quote-pdf", {
      body: { quote_id: quoteId ?? undefined, solo_anteprima: true, bozza },
    });
    if (error) {
      // Il messaggio del server (per esempio un modello che non si compone) è più utile di quello generico.
      const dettaglio = await (error as { context?: Response }).context?.json?.().catch((): null => null);
      throw new Error((dettaglio as { error?: string } | null)?.error || "Il PDF non si è aggiornato: le modifiche restano qui, riprova.");
    }
    return pdfDallaRisposta(data);
  }, [quoteId, bozza]);
  return <AnteprimaPdfVero genera={genera} chiave={chiave} attivo={attivo} />;
}

export default PdfVeroPreventivoClassico;
