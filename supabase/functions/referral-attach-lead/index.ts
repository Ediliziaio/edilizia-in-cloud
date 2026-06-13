// referral-attach-lead — aggancia un lead del sito al partner referral.
//
// Perché esiste come funzione dedicata: la cattura del referral DOVREBBE
// avvenire dentro public-lead-submit (vedi codice lì), ma quella funzione ha
// 8 dipendenze _shared sull'invio email e non è ridistribuibile in modo
// affidabile da questo ambiente. Questa funzione è invece autonoma (CORS
// inline, nessuna _shared) e fa SOLO la cattura referral, così è deployabile
// in sicurezza senza toccare il percorso email.
//
// Flusso: ReferralLanding salva localStorage['ref_code'] → Demo.tsx, dopo
// l'invio del lead, chiama questa funzione con { email, referral_code }.
// La funzione risolve il partner, e se valido annota il contatto lead già
// creato (note + tag 'referral-partner' + attività) così l'admin sa a chi
// attribuire la conversione quando crea l'azienda.
//
// Sicurezza: endpoint pubblico (verify_jwt=false) ma a basso rischio —
// aggiorna SOLO un contatto-lead già esistente del platform-admin, matchato
// per email, e non restituisce alcun dato del contatto (solo un booleano).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PLATFORM_ADMIN_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

// CORS inline (whitelist piattaforma + dev) per non dipendere da _shared.
const STATIC_ORIGINS = [
  "https://app.ediliziaincloud.com",
  "https://www.ediliziaincloud.com",
  "https://clienti.ediliziaincloud.com",
  "https://admin.ediliziaincloud.com",
  "https://lavori.ediliziaincloud.com",
  "https://app.ediliziaincloud.it",
  "https://www.ediliziaincloud.it",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:3000",
];
const PLATFORM_SUFFIXES = [".ediliziaincloud.it", ".ediliziaincloud.com"];
const DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  let allowed = STATIC_ORIGINS.includes(origin);
  if (!allowed && origin) {
    try {
      const host = new URL(origin).hostname;
      if (DEV_HOSTS.has(host)) allowed = true;
      else allowed = PLATFORM_SUFFIXES.some((s) => host.endsWith(s));
    } catch { /* origin malformato → non ammesso */ }
  }
  return {
    "Access-Control-Allow-Origin": allowed ? origin : STATIC_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown, max = 254): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      referral_code?: string | null;
    };
    const email = cleanText(body.email, 254).toLowerCase();
    const referralCode = cleanText(body.referral_code, 40)
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "");

    // Niente codice o niente email → nulla da attribuire (non è un errore).
    if (!email || !referralCode) {
      return json(req, { ok: true, attributed: false, reason: "missing_input" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // 1. Risolvi il partner dal codice (solo partner attivi).
    const { data: ref, error: refErr } = await supabase
      .from("referrers")
      .select("id, name, referral_code, is_active")
      .eq("referral_code", referralCode)
      .maybeSingle();

    if (refErr) {
      console.warn("[referral-attach-lead] referrer lookup error:", refErr.message);
      return json(req, { ok: true, attributed: false, reason: "lookup_error" });
    }
    if (!ref?.id || ref.is_active === false) {
      return json(req, { ok: true, attributed: false, reason: "unknown_or_inactive" });
    }
    const partnerName = (ref.name as string) || referralCode;

    // 2. Trova il contatto-lead già creato (platform-admin, match per email).
    const { data: contact, error: contactErr } = await supabase
      .from("marketing_contacts")
      .select("id, tags, notes")
      .eq("company_id", PLATFORM_ADMIN_COMPANY_ID)
      .eq("email", email)
      .maybeSingle();

    if (contactErr) {
      console.warn("[referral-attach-lead] contact lookup error:", contactErr.message);
      return json(req, { ok: true, attributed: false, reason: "contact_lookup_error" });
    }
    if (!contact?.id) {
      // Il lead potrebbe non essere ancora stato scritto (race) → non blocchiamo.
      return json(req, { ok: true, attributed: false, reason: "contact_not_found" });
    }

    // Idempotenza: se già attribuito a questo partner, non duplicare.
    const existingTags: string[] = Array.isArray(contact.tags) ? contact.tags : [];
    const noteMarker = `Referral partner: ${partnerName} (codice ${ref.referral_code})`;
    const alreadyAttributed =
      typeof contact.notes === "string" && contact.notes.includes(noteMarker);

    if (alreadyAttributed) {
      return json(req, { ok: true, attributed: true, reason: "already_attributed" });
    }

    // 3. Annota il contatto: tag + nota.
    const tags = Array.from(new Set([...existingTags, "referral-partner"]));
    const newNote = `🤝 ${noteMarker}`;
    const mergedNotes = [contact.notes, newNote].filter(Boolean).join("\n");

    const { error: updErr } = await supabase
      .from("marketing_contacts")
      .update({ tags, notes: mergedNotes })
      .eq("id", contact.id);

    if (updErr) {
      console.error("[referral-attach-lead] contact update error:", updErr.message);
      return json(req, { ok: false, attributed: false, reason: "update_failed" }, 500);
    }

    // 4. Traccia l'attività (best-effort).
    await supabase.from("marketing_contact_activities").insert({
      company_id: PLATFORM_ADMIN_COMPANY_ID,
      contact_id: contact.id,
      activity_type: "referral_attributed",
      description: `Lead attribuito al partner referral ${partnerName}`,
      metadata: {
        referral_code: ref.referral_code,
        referrer_id: ref.id,
        referrer_name: partnerName,
      },
    });

    return json(req, { ok: true, attributed: true, referrer_id: ref.id });
  } catch (error) {
    console.error("[referral-attach-lead] unexpected error:", error);
    return json(req, { error: "Errore interno" }, 500);
  }
});
