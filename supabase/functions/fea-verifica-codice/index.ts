/**
 * Verifica pubblica di un documento firmato: chi riceve il PDF firmato scrive
 * il codice di verifica stampato sul certificato (XXXX-XXXX-XXXX) e vede chi
 * l'ha firmato, quando e per quale azienda, con l'impronta del PDF firmato.
 * La pagina confronta poi nel browser l'impronta del file che ha in mano:
 * se coincide, il file è quello firmato, senza modifiche.
 *
 * Mostra solo il minimo: nome di chi firma, data, azienda, titolo e impronte.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

Deno.serve(async (req: Request) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsH });
  const risposta = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsH, "Content-Type": "application/json" } });

  try {
    const body = await req.json().catch(() => ({}));
    const codice = String(body?.codice ?? "").toUpperCase().replace(/[^0-9A-F]/g, "");
    if (codice.length !== 12) return risposta(400, { error: "Il codice di verifica ha 12 caratteri, come XXXX-XXXX-XXXX." });
    const formattato = `${codice.slice(0, 4)}-${codice.slice(4, 8)}-${codice.slice(8, 12)}`;

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: r } = await sb.from("signature_requests")
      .select("id, company_id, status, signer_name, signed_at, tipo_documento, livello_firma, documento_hash, signed_pdf_hash, firmatario_id")
      .eq("codice_verifica", formattato).eq("status", "signed").maybeSingle();
    if (!r) return risposta(404, { trovato: false });

    const [{ data: azienda }, { data: prove }] = await Promise.all([
      sb.from("companies").select("name").eq("id", r.company_id).maybeSingle(),
      sb.from("fea_prove_conservate").select("created_at").eq("richiesta_id", r.id).maybeSingle(),
    ]);
    const tipi: Record<string, string> = {
      quote: "Preventivo", fv: "Preventivo fotovoltaico", subappalto: "Contratto di subappalto",
      sessione: "Modulo", order: "Verbale di commessa",
    };
    return risposta(200, {
      trovato: true,
      codice: formattato,
      azienda: azienda?.name ?? null,
      documento: tipi[String(r.tipo_documento)] ?? "Documento",
      firmatario: r.signer_name,
      firmato_il: r.signed_at,
      livello_firma: r.livello_firma === "avanzata" && r.firmatario_id ? "avanzata" : "semplice",
      impronta_documento: r.documento_hash,
      impronta_pdf_firmato: r.signed_pdf_hash,
      prove_conservate: !!prove,
    });
  } catch (err) {
    console.error("fea-verifica-codice error:", err);
    return risposta(500, { error: "Errore interno del server" });
  }
});
