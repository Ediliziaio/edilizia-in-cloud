/**
 * email-ai-l1-classify — MP-EMAIL-AI-01 · Livello 1 (deterministico)
 *
 * Edge function che applica la cascata L1 a una o più email NON ancora
 * classificate. Costo: ZERO token AI (regole + DB lookup).
 *
 * Endpoint POST con 2 modi:
 *
 *   1. SINGOLA EMAIL (chiamato dal poller dopo download):
 *      { email_id: uuid }
 *      → ritorna { result: ClassificationResult | null, persisted: boolean }
 *
 *   2. BATCH (chiamato da cron o admin per backfill):
 *      { mode: "backfill", company_id?: uuid, limit?: number, dry_run?: boolean }
 *      → ritorna { processed, l1_hits, l1_misses, perc_l1 }
 *
 * Le regole dell'azienda (email_regole) oltre alla categoria segnano l'email come
 * letta, la contrassegnano con la stella o ne fissano la priorità: lo fa
 * applicaEffettiRegola, una volta sola per email (26/09/2026).
 *
 * Auth:
 *   - Singola: Authorization Bearer (utente loggato)
 *   - Backfill: x-cron-secret (PROACTIVE_CRON_SECRET) o super_admin JWT
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import {
  classificaConRegole,
  applicaEffettiRegola,
  persistClassification,
  learnSender,
  extractSnippet,
  extractDomain,
  normalizeEmail,
  type EmailInput,
} from "../_shared/email-ai-cascade.ts";

import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
interface SingleBody {
  email_id: string;
}

interface BackfillBody {
  mode: "backfill";
  company_id?: string;
  limit?: number;
  dry_run?: boolean;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") || "";

// A pg_net (i cron) si risponde entro pochi secondi: vedi _shared/rispostaRapidaCron.ts.
serveConMetricheRapida("email-ai-l1-classify", async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const body = await req.json();

    // ─── Mode: backfill ────────────────────────────────────────────────────
    if (body.mode === "backfill") {
      const cronAuth = req.headers.get("x-cron-secret");
      const isCron = CRON_SECRET && cronAuth === CRON_SECRET;
      if (!isCron) {
        // Fallback: richiede super_admin JWT
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
          return json({ error: "Auth required" }, 401, corsHeaders);
        }
        const token = authHeader.replace("Bearer ", "");
        const { data: user } = await supabase.auth.getUser(token);
        if (!user.user) {
          return json({ error: "Invalid token" }, 401, corsHeaders);
        }
        const { data: isAdmin } = await supabase.rpc("has_role" as any, {
          _user_id: user.user.id,
          _role: "super_admin",
        });
        if (!isAdmin) {
          return json({ error: "super_admin required" }, 403, corsHeaders);
        }
      }
      return await runBackfill(supabase, body as BackfillBody, corsHeaders);
    }

    // ─── Mode: single email ────────────────────────────────────────────────
    const { email_id } = body as SingleBody;
    if (!email_id) {
      return json({ error: "email_id required" }, 400, corsHeaders);
    }
    return await runSingle(supabase, email_id, corsHeaders);
  } catch (e) {
    console.error("[email-ai-l1-classify] error", e);
    return json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500,
      corsHeaders,
    );
  }
});

// ─── Single email mode ────────────────────────────────────────────────────────

async function runSingle(supabase: any, emailId: string, cors: Record<string, string>) {
  const { data: email, error } = await supabase
    .from("email_inbox")
    .select(
      "id, company_id, from_email, from_name, to_email, cc_emails, subject, raw_text, raw_html, headers, attachments, categoria, regola_applicata_at",
    )
    .eq("id", emailId)
    .single();

  if (error || !email) {
    return json({ error: "Email not found" }, 404, cors);
  }

  // Già classificata
  if (email.categoria) {
    return json({
      ok: true,
      already_classified: true,
      categoria: email.categoria,
    }, 200, cors);
  }

  const from = normalizeEmail(email.from_email);
  const fromDomain = extractDomain(from);
  const snippet = extractSnippet(email.raw_text, email.raw_html);
  const attachments = Array.isArray(email.attachments) ? email.attachments : [];

  const input: EmailInput = {
    from_email: from,
    fromDomain,
    from_name: email.from_name,
    subject: email.subject,
    snippet,
    headers: email.headers || null,
    to_email: email.to_email,
    cc_emails: email.cc_emails || [],
    has_attachment: attachments.length > 0,
    attachment_types: attachments.map((a: any) => String(a?.mime || a?.filename || "")),
  };

  const { risultato: result, regola } = await classificaConRegole(supabase, email.company_id, input);
  const regolaApplicata = regola && !email.regola_applicata_at
    ? await applicaEffettiRegola(supabase, email.id, regola)
    : false;

  if (result) {
    await persistClassification(supabase, email.id, result);
    // Salva mittente per future classificazioni a costo zero
    await learnSender(supabase, email.company_id, from, result);
    return json({
      ok: true,
      email_id: email.id,
      result,
      persisted: true,
      regola_applicata: regolaApplicata,
      goes_to: null,
    }, 200, cors);
  }

  // L1 miss → email va a L3 (Haiku batch)
  return json({
    ok: true,
    email_id: email.id,
    result: null,
    persisted: false,
    regola_applicata: regolaApplicata,
    goes_to: "L3",
  }, 200, cors);
}

// ─── Backfill mode ────────────────────────────────────────────────────────────

async function runBackfill(supabase: any, body: BackfillBody, cors: Record<string, string>) {
  const limit = Math.min(body.limit || 200, 1000);
  const dry = body.dry_run === true;

  // Seleziona email senza categoria (NOT NULL filtro + scope opzionale per company)
  let query = supabase
    .from("email_inbox")
    .select(
      "id, company_id, from_email, from_name, to_email, cc_emails, subject, raw_text, raw_html, headers, attachments, regola_applicata_at",
    )
    .is("categoria", null)
    .order("received_at", { ascending: false })
    .limit(limit);

  if (body.company_id) {
    query = query.eq("company_id", body.company_id);
  }

  const { data: rows, error } = await query;
  if (error) {
    return json({ error: error.message }, 500, cors);
  }
  if (!rows || rows.length === 0) {
    return json({ processed: 0, l1_hits: 0, l1_misses: 0, perc_l1: 0 }, 200, cors);
  }

  let hits = 0;
  let misses = 0;
  const miss_ids: string[] = [];

  for (const email of rows) {
    const from = normalizeEmail(email.from_email);
    const fromDomain = extractDomain(from);
    const snippet = extractSnippet(email.raw_text, email.raw_html);
    const attachments = Array.isArray(email.attachments) ? email.attachments : [];

    const input: EmailInput = {
      from_email: from,
      fromDomain,
      from_name: email.from_name,
      subject: email.subject,
      snippet,
      headers: email.headers || null,
      to_email: email.to_email,
      cc_emails: email.cc_emails || [],
      has_attachment: attachments.length > 0,
      attachment_types: attachments.map((a: any) => String(a?.mime || a?.filename || "")),
    };

    const { risultato: result, regola } = await classificaConRegole(supabase, email.company_id, input);
    if (regola && !email.regola_applicata_at && !dry) {
      await applicaEffettiRegola(supabase, email.id, regola);
    }

    if (result) {
      hits++;
      if (!dry) {
        await persistClassification(supabase, email.id, result);
        await learnSender(supabase, email.company_id, from, result);
      }
    } else {
      misses++;
      miss_ids.push(email.id);
    }
  }

  const perc_l1 = rows.length > 0 ? Math.round((hits / rows.length) * 1000) / 10 : 0;

  return json({
    processed: rows.length,
    l1_hits: hits,
    l1_misses: misses,
    perc_l1,
    dry_run: dry,
    miss_email_ids: dry ? miss_ids : undefined,
  }, 200, cors);
}

function json(payload: any, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
