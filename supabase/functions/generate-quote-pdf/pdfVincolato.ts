import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { STATI_FIRMA_APERTA } from "../_shared/statoFirma.ts";
import { percorsoDellAzienda } from "../_shared/impaginaPreventivo.ts";

type PdfVincolato =
  | { errore: string; stato: 409 | 503 }
  | { success: true; pdf_path: string; signed_url: string; gia_firmato?: true; in_firma?: true };

export async function leggiPdfVincolato(admin: SupabaseClient, quote: {
  id: string;
  company_id: string;
  signed_at?: string | null;
  pdf_storage_path?: string | null;
}): Promise<PdfVincolato | null> {
  const query = admin.from("signature_requests")
    .select("documento_path, signed_pdf_path")
    .eq("quote_id", quote.id)
    .eq("company_id", quote.company_id);
  const { data: richiesta, error } = await (quote.signed_at
    ? query.eq("status", "signed").order("signed_at", { ascending: false })
    : query.in("status", STATI_FIRMA_APERTA).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false })
  ).limit(1).maybeSingle();
  if (error) return { errore: "Lo stato della firma è temporaneamente indisponibile.", stato: 503 } as const;
  if (!richiesta && !quote.signed_at) return null;

  const percorso = percorsoDellAzienda(
    (quote.signed_at ? richiesta?.signed_pdf_path : null) ?? richiesta?.documento_path ?? quote.pdf_storage_path,
    quote.company_id,
  );
  if (!percorso) return { errore: "Il PDF associato alla firma non è disponibile.", stato: 409 } as const;

  const { data, error: erroreFile } = await admin.storage.from("quote-pdfs").createSignedUrl(percorso, 3600);
  if (erroreFile || !data?.signedUrl) return { errore: "Il PDF associato alla firma non si apre. Riprova.", stato: 503 } as const;
  return {
    success: true,
    pdf_path: percorso,
    signed_url: data.signedUrl,
    ...(quote.signed_at ? { gia_firmato: true } : { in_firma: true }),
  } as const;
}
