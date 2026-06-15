// ============================================================================
// telnyx-requirement-group
// White-label: ogni AZIENDA invia i propri dati normativi + documenti. Qui li
// inoltriamo a Telnyx creando un "requirement group" intestato a quell'azienda,
// così la titolarità/responsabilità del numero è dell'azienda, non della piattaforma.
//
// Robusto per design: se l'integrazione Telnyx fallisce (API/documenti), la
// submission resta registrata (stato "in_revisione") e l'errore viene salvato in
// note_revisione per gestione manuale — il flusso dell'azienda non si rompe mai.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";
import { decryptMaybeEncrypted, getEncryptionKey } from "../_shared/encryption.ts";

const TELNYX_API = "https://api.telnyx.com/v2";

async function resolveTelnyxKey(admin: ReturnType<typeof createClient>): Promise<string> {
  const { data: s } = await admin.from("telnyx_settings").select("api_key_encrypted").eq("is_active", true).limit(1).maybeSingle();
  if (s?.api_key_encrypted) {
    try { return await decryptMaybeEncrypted(s.api_key_encrypted as string, getEncryptionKey()); } catch { /* fallthrough */ }
  }
  return Deno.env.get("TELNYX_API_KEY") ?? "";
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, cors);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // ── Auth: l'utente può inviare solo per la PROPRIA azienda ──
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!token) return errorResponse("Unauthorized", 401, cors);
    const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anon.auth.getUser(token);
    if (!user) return errorResponse("Unauthorized", 401, cors);
    const { data: profile } = await admin.from("profiles").select("company_id").eq("id", user.id).single();
    const companyId = profile?.company_id;
    if (!companyId) return errorResponse("Azienda non trovata", 400, cors);

    const { data: c } = await admin
      .from("company_telephony_compliance").select("*").eq("company_id", companyId).maybeSingle();
    if (!c) return errorResponse("Compila prima i dati normativi", 400, cors);

    // Validazione minima server-side.
    const missing: string[] = [];
    if (!c.ragione_sociale) missing.push("ragione sociale");
    if (!c.partita_iva) missing.push("partita IVA");
    if (!c.indirizzo || !c.citta || !c.cap) missing.push("indirizzo");
    if (!c.doc_identita_path) missing.push("documento identità");
    if (!c.doc_indirizzo_path) missing.push("prova indirizzo");
    if (missing.length) return errorResponse("Mancano: " + missing.join(", "), 400, cors);

    // Stato → in_revisione (idempotente).
    await admin.from("company_telephony_compliance")
      .update({ stato: "in_revisione", inviato_il: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("company_id", companyId);

    // ── Tentativo integrazione Telnyx (best-effort, non blocca l'azienda) ──
    let requirementGroupId: string | null = c.telnyx_requirement_group_id ?? null;
    let warning: string | null = null;
    try {
      const apiKey = await resolveTelnyxKey(admin);
      if (!apiKey) throw new Error("Telnyx API key non configurata");
      const tHeaders = { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" };

      // 1) Indirizzo dell'azienda su Telnyx
      const addrRes = await fetch(`${TELNYX_API}/addresses`, {
        method: "POST", headers: tHeaders,
        body: JSON.stringify({
          business_name: c.ragione_sociale,
          first_name: c.ragione_sociale, last_name: ".",
          country_code: c.paese || "IT",
          street_address: `${c.indirizzo} ${c.civico ?? ""}`.trim(),
          locality: c.citta, postal_code: c.cap,
          administrative_area: c.provincia ?? undefined,
          phone_number: c.telefono_contatto ?? undefined,
        }),
      });
      const addrJson = await addrRes.json().catch(() => ({}));
      if (!addrRes.ok) throw new Error(addrJson?.errors?.[0]?.detail || "Errore creazione indirizzo Telnyx");
      const addressId = addrJson?.data?.id;

      // 2) Upload documenti a Telnyx
      const uploadDoc = async (path: string | null): Promise<string | null> => {
        if (!path) return null;
        const { data: signed } = await admin.storage.from("telephony-compliance").createSignedUrl(path, 120);
        if (!signed?.signedUrl) return null;
        const fileRes = await fetch(signed.signedUrl);
        const blob = await fileRes.blob();
        const fd = new FormData();
        fd.append("file", blob, path.split("/").pop() || "document");
        fd.append("customer_reference", String(companyId));
        const docRes = await fetch(`${TELNYX_API}/documents`, {
          method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: fd,
        });
        const docJson = await docRes.json().catch(() => ({}));
        return docRes.ok ? (docJson?.data?.id ?? null) : null;
      };
      const docIdentita = await uploadDoc(c.doc_identita_path);
      const docIndirizzo = await uploadDoc(c.doc_indirizzo_path);

      // 3) Requisiti richiesti per IT/local/ordering
      const reqRes = await fetch(
        `${TELNYX_API}/regulatory_requirements?filter[country_code]=${c.paese || "IT"}&filter[phone_number_type]=local&filter[action]=ordering`,
        { headers: tHeaders },
      );
      const reqJson = await reqRes.json().catch(() => ({}));
      const requirements: Array<{ id: string; acceptance_criteria?: { acceptable_value_type?: string }; field_type?: string; name?: string }> =
        reqJson?.data?.[0]?.requirements_data ?? reqJson?.data ?? [];

      // 4) Mappa best-effort requirement → valore
      const regulatory = requirements.map((r) => {
        const type = (r.acceptance_criteria?.acceptable_value_type || r.field_type || "").toLowerCase();
        const name = (r.name || "").toLowerCase();
        let value: string | undefined;
        if (type.includes("document") || name.includes("identity") || name.includes("document")) {
          value = name.includes("address") ? (docIndirizzo ?? undefined) : (docIdentita ?? docIndirizzo ?? undefined);
        } else if (type.includes("address") || name.includes("address")) {
          value = addressId;
        } else if (name.includes("vat") || name.includes("tax") || name.includes("fiscal")) {
          value = c.partita_iva ?? undefined;
        } else if (name.includes("business") || name.includes("company") || name.includes("name")) {
          value = c.ragione_sociale ?? undefined;
        }
        return value ? { requirement_id: r.id, field_value: value } : null;
      }).filter(Boolean);

      // 5) Crea il requirement group intestato all'azienda
      const rgRes = await fetch(`${TELNYX_API}/requirement_groups`, {
        method: "POST", headers: tHeaders,
        body: JSON.stringify({
          country_code: c.paese || "IT",
          phone_number_type: "local",
          action: "ordering",
          customer_reference: String(companyId),
          regulatory_requirements: regulatory,
        }),
      });
      const rgJson = await rgRes.json().catch(() => ({}));
      if (!rgRes.ok) throw new Error(rgJson?.errors?.[0]?.detail || "Errore creazione requirement group");
      requirementGroupId = rgJson?.data?.id ?? requirementGroupId;

      // 6) Invia per approvazione (se l'endpoint è disponibile)
      if (requirementGroupId) {
        await fetch(`${TELNYX_API}/requirement_groups/${requirementGroupId}/submit_for_approval`, {
          method: "POST", headers: tHeaders,
        }).catch(() => undefined);
      }
    } catch (e) {
      warning = e instanceof Error ? e.message : "Integrazione Telnyx non completata: gestione manuale richiesta.";
      console.error("[telnyx-requirement-group] telnyx flow:", warning);
    }

    await admin.from("company_telephony_compliance")
      .update({
        telnyx_requirement_group_id: requirementGroupId,
        note_revisione: warning,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId);

    return jsonResponse({ ok: true, requirement_group_id: requirementGroupId, warning }, 200, cors);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore interno";
    console.error("[telnyx-requirement-group] error:", message);
    return errorResponse(message, 500, cors);
  }
});
