/** POST { rapportino_id }. Operational report, private assets, immutable editions. */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { dayBounds, reportAsset, rows, text, type RecordData } from "./model.ts";
import { renderRapportino } from "./render.ts";

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("Metodo non consentito", 405, cors);
  try {
    const { userId, supabaseAdmin: admin } = await requireAuth(req, cors);
    const { rapportino_id: id } = await req.json();
    if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return errorResponse("Identificativo rapportino non valido", 400, cors);
    const baseUrl = Deno.env.get("SUPABASE_URL")!;
    // Company membership alone must not let a worker export a colleague's report.
    const caller = createClient(baseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: allowed, error: accessError } = await caller.from("campo_rapportini").select("id").eq("id", id).maybeSingle();
    if (accessError || !allowed) return errorResponse("Rapportino non disponibile o non autorizzato", 403, cors);
    const { data: rap, error: reportError } = await admin.from("campo_rapportini")
      .select("*, autore:profiles!campo_rapportini_user_id_fkey(first_name, last_name), ordine:orders!campo_rapportini_order_id_fkey(order_code, description, client_name, work_address, indirizzo_lavori)")
      .eq("id", id).single();
    if (reportError || !rap) return errorResponse("Rapportino non trovato", 404, cors);
    const { data: profile } = await admin.from("profiles").select("company_id").eq("id", userId).single();
    // Preserve the existing tenant boundary; do not introduce new role exceptions.
    if (!profile || profile.company_id !== rap.company_id) return errorResponse("Non autorizzato", 403, cors);
    const [{ data: company, error: companyError }, branding] = await Promise.all([
      admin.from("companies").select("name, legal_address, legal_city, email, phone, vat_number").eq("id", rap.company_id).single(),
      getBrandingForCompany(admin, rap.company_id),
    ]);
    if (companyError || !company) return errorResponse("Dati azienda non disponibili", 500, cors);
    const warnings: string[] = [];
    let phases: RecordData[] = [];
    const phaseIds = rows(rap.fasi_lavorate).map(p => text(p.phase_id)).filter(Boolean);
    if (phaseIds.length && rap.order_id) {
      const { data, error } = await admin.from("order_work_phases").select("id, name").eq("order_id", rap.order_id).in("id", phaseIds);
      if (error) warnings.push("Nomi delle lavorazioni non disponibili: sono riportati i riferimenti registrati.");
      else phases = data ?? [];
    }
    let punches: RecordData[] = [];
    const bounds = dayBounds(text(rap.data_lavoro));
    if (bounds && rap.user_id && rap.order_id) {
      // Read events under caller RLS. This adds no new privilege for time records.
      const { data, error } = await caller.from("campo_timbrature").select("tipo, timestamp_evento")
        .eq("company_id", rap.company_id).eq("user_id", rap.user_id).eq("order_id", rap.order_id)
        .gte("timestamp_evento", bounds.start).lt("timestamp_evento", bounds.end)
        .order("timestamp_evento", { ascending: true });
      if (error) warnings.push("Timbrature non disponibili in questa edizione: le ore restano dichiarate.");
      else punches = data ?? [];
    }
    const loadImage = async (ref: string, kind: "photo" | "signature" | "logo") => {
      const asset = reportAsset(ref, rap.company_id, baseUrl);
      if (asset) {
        const { data, error } = await admin.storage.from(asset.bucket).download(asset.path);
        if (error || !data || data.size > 12 * 1024 * 1024) return null;
        return new Uint8Array(await data.arrayBuffer());
      }
      // Work photos/signatures must be tenant-scoped storage objects. No arbitrary fetch.
      if (kind !== "logo") return null;
      try {
        const url = new URL(ref);
        if (url.protocol !== "https:" || ![new URL(baseUrl).origin, "https://app.ediliziaincloud.com"].includes(url.origin)) return null;
        const response = await fetchWithTimeout(ref, { timeoutMs: 8000, redirect: "error" });
        if (!response.ok || Number(response.headers.get("content-length")) > 2 * 1024 * 1024) return null;
        const data = new Uint8Array(await response.arrayBuffer());
        return data.length <= 2 * 1024 * 1024 ? data : null;
      } catch { return null; }
    };
    const generatedAt = new Date().toISOString();
    const revision = Date.now().toString(36) + "-" + crypto.randomUUID().slice(0, 8);
    const result = await renderRapportino({ report: rap, company, branding, phases, punches, warnings, revision, generatedAt }, loadImage);
    // Every edition has its own object; previous exports are never overwritten.
    const path = rap.company_id + "/" + id + "/rapportino-v2-" + revision + ".pdf";
    const { error: uploadError } = await admin.storage.from("campo-rapportini").upload(path, result.bytes, { contentType: "application/pdf", upsert: false });
    if (uploadError) return errorResponse("Impossibile salvare il PDF. Il rapportino rimane salvato: riprova.", 500, cors);
    // Canonical legacy-compatible locator; opening still requires a signed URL.
    const { data: urlData } = admin.storage.from("campo-rapportini").getPublicUrl(path);
    const pdfUrl = urlData.publicUrl;
    if (!rap.updated_at) return errorResponse("Versione del rapportino non disponibile", 409, cors);
    const { data: updated, error: updateError } = await admin.from("campo_rapportini").update({ pdf_url: pdfUrl })
      .eq("id", id).eq("company_id", rap.company_id).eq("updated_at", rap.updated_at).select("id").maybeSingle();
    if (updateError) return errorResponse("PDF creato ma non collegato al rapportino. Riprova.", 500, cors);
    if (!updated) return errorResponse("Il rapportino è cambiato durante la generazione. Rigenera il PDF aggiornato.", 409, cors);
    return jsonResponse({ pdf_url: pdfUrl, revision, warnings: result.warnings, page_count: result.pageCount }, 200, cors);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("genera-pdf-rapportino:", error);
    return errorResponse("Generazione PDF non riuscita. Il rapportino rimane salvato: riprova.", 500, cors);
  }
});
