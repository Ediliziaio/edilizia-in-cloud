import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

const PLATFORM_ADMIN_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

type LeadPayload = {
  nome?: string;
  email?: string;
  telefono?: string;
  azienda?: string;
  messaggio?: string | null;
  source?: string;
  marketing_consent?: boolean;
  tags?: string[];
  render_slug?: string | null;
  page_path?: string | null;
  context_label?: string | null;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value: unknown, max = 500): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function splitName(fullName: string): { first_name: string; last_name: string | null } {
  const parts = fullName.split(" ").filter(Boolean);
  if (parts.length <= 1) return { first_name: fullName || "Nuovo lead", last_name: null };
  return { first_name: parts.slice(0, -1).join(" "), last_name: parts.at(-1) || null };
}

function jsonResponse(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as LeadPayload;
    const nome = cleanText(body.nome, 180);
    const email = cleanText(body.email, 254).toLowerCase();
    const telefono = cleanText(body.telefono, 80);
    const azienda = cleanText(body.azienda, 180);
    const source = cleanText(body.source || "site_public_form", 80);
    const messaggio = cleanText(body.messaggio, 2000);
    const marketingConsent = Boolean(body.marketing_consent);
    const renderSlug = cleanText(body.render_slug, 80).toLowerCase().replace(/[^a-z0-9-]/g, "");
    const pagePath = cleanText(body.page_path, 180);
    const contextLabel = cleanText(body.context_label, 180);
    const requestedTags = Array.isArray(body.tags)
      ? body.tags.map((tag) => cleanText(tag, 80).toLowerCase()).filter(Boolean)
      : [];
    const renderTags = renderSlug.startsWith("render-")
      ? ["richiesta-render", `richiesta-${renderSlug}`, "landing-render"]
      : [];

    if (!nome || !email || !telefono || !azienda) {
      return jsonResponse(req, { error: "Campi obbligatori mancanti" }, 400);
    }
    if (!emailRegex.test(email)) {
      return jsonResponse(req, { error: "Email non valida" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    let requestId: string | null = null;
    const requestPayload = {
      nome,
      email,
      telefono,
      azienda,
      messaggio: messaggio || null,
      marketing_consent: marketingConsent,
      source,
      status: "pending",
    };

    const demoRequest = await supabase
      .from("demo_requests")
      .insert(requestPayload)
      .select("id")
      .maybeSingle();

    if (!demoRequest.error && demoRequest.data?.id) {
      requestId = demoRequest.data.id as string;
    } else if (demoRequest.error && demoRequest.error.code !== "42P01") {
      console.warn("[public-lead-submit] demo_requests insert skipped:", demoRequest.error.message);
    }

    const { first_name, last_name } = splitName(nome);
    const now = new Date().toISOString();
    const notes = [
      contextLabel ? `Modulo richiesto: ${contextLabel}` : null,
      messaggio || null,
      `Richiesta da sito: ${source}`,
      renderSlug ? `Render page: ${renderSlug}` : null,
      pagePath ? `Pagina: ${pagePath}` : null,
      `Consenso marketing: ${marketingConsent ? "si" : "no"}`,
    ].filter(Boolean).join("\n");

    const { data: existing, error: existingError } = await supabase
      .from("marketing_contacts")
      .select("id, tags, notes")
      .eq("company_id", PLATFORM_ADMIN_COMPANY_ID)
      .eq("email", email)
      .maybeSingle();

    if (existingError) {
      console.error("[public-lead-submit] contact lookup error:", existingError);
      return jsonResponse(req, { error: "CRM non disponibile" }, 500);
    }

    let contactId: string | null = null;
    const tags = Array.from(
      new Set([
        ...(existing?.tags ?? []),
        "lead-sito",
        "richiesta-demo",
        ...requestedTags,
        ...renderTags,
      ]),
    );

    if (existing?.id) {
      contactId = existing.id as string;
      const mergedNotes = [existing.notes, notes].filter(Boolean).join("\n\n---\n");
      const { error: updateError } = await supabase
        .from("marketing_contacts")
        .update({
          first_name,
          last_name,
          phone: telefono,
          company_name: azienda,
          source,
          contact_type: "lead",
          tags,
          notes: mergedNotes,
          last_activity_at: now,
        })
        .eq("id", contactId);

      if (updateError) {
        console.error("[public-lead-submit] contact update error:", updateError);
        return jsonResponse(req, { error: "Aggiornamento CRM non riuscito" }, 500);
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("marketing_contacts")
        .insert({
          company_id: PLATFORM_ADMIN_COMPANY_ID,
          first_name,
          last_name,
          email,
          phone: telefono,
          company_name: azienda,
          source,
          contact_type: "lead",
          tags,
          notes,
          last_activity_at: now,
        })
        .select("id")
        .single();

      if (insertError || !inserted?.id) {
        console.error("[public-lead-submit] contact insert error:", insertError);
        return jsonResponse(req, { error: "Creazione CRM non riuscita" }, 500);
      }
      contactId = inserted.id as string;
    }

    await supabase.from("marketing_contact_activities").insert({
      company_id: PLATFORM_ADMIN_COMPANY_ID,
      contact_id: contactId,
      activity_type: "site_lead_submitted",
      description: `Richiesta ricevuta dal sito (${source})`,
      metadata: {
        request_id: requestId,
        source,
        azienda,
        telefono,
        marketing_consent: marketingConsent,
        render_slug: renderSlug || null,
        page_path: pagePath || null,
        context_label: contextLabel || null,
        tags,
      },
    });

    return jsonResponse(req, { ok: true, contact_id: contactId, request_id: requestId });
  } catch (error) {
    console.error("[public-lead-submit] unexpected error:", error);
    return jsonResponse(req, { error: "Errore interno" }, 500);
  }
});
