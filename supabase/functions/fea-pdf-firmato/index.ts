/**
 * fea-pdf-firmato — il PDF firmato di una richiesta di firma, per chi lavora
 * nell'azienda. Se il file non c'è ancora (la generazione dopo la firma non è
 * riuscita) lo costruisce adesso. Restituisce un link che scade in un'ora.
 *
 * Body: { request_id }
 * Output: { url, codice_verifica, nome_file }
 */
import { getCorsHeaders } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { assicuraPdfFirmato } from "../_shared/pdfFirmato.ts";

Deno.serve(async (req: Request) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsH });

  const risposta = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsH, "Content-Type": "application/json" } });

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const body = await req.json().catch(() => ({}));
    const richiestaId = typeof body?.request_id === "string" ? body.request_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(richiestaId)) return risposta(400, { error: "request_id non valido" });

    const { data: r } = await supabaseAdmin
      .from("signature_requests")
      .select("id, company_id, status")
      .eq("id", richiestaId)
      .maybeSingle();
    if (!r) return risposta(404, { error: "Richiesta di firma non trovata" });
    await requireCompanyAccess(supabaseAdmin, userId, r.company_id as string, corsH);
    if (r.status !== "signed") return risposta(409, { error: "Il documento non è ancora firmato" });

    const esito = await assicuraPdfFirmato(supabaseAdmin, r.id as string);
    const nomeFile = `documento-firmato-${esito.codiceVerifica}.pdf`;
    const { data: firmato, error } = await supabaseAdmin.storage
      .from("quote-pdfs")
      .createSignedUrl(esito.path, 3600, { download: nomeFile });
    if (error || !firmato?.signedUrl) return risposta(500, { error: "Link al PDF firmato non disponibile" });

    return risposta(200, { url: firmato.signedUrl, codice_verifica: esito.codiceVerifica, nome_file: nomeFile });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("fea-pdf-firmato error:", err);
    return risposta(500, { error: "Errore interno del server" });
  }
});
