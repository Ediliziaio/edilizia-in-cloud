// supabase/functions/ai-ads-copy-generate/index.ts
//
// Genera copy varianti per Meta Ads usando AIProvider esistente.
// Input: brief, settore, zona, offerta. Output: 5 varianti copy + 3 hook + suggerimenti.
//
// SICUREZZA:
//   • Bearer token utente
//   • Validazione company ownership
//   • Conteggio crediti AI (via precallCheck/chargeAndLog)
//
// COSTI: ~0.001-0.01€ per generazione (dipende dal modello)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { chat, InsufficientCreditsError } from "../_shared/ai-provider/index.ts";

interface CopyGenRequest {
  company_id: string;
  /** Brief libero dell'utente (cosa vuole comunicare) */
  brief: string;
  /** Tipo intervento: serramenti, bagni, ristrutturazione, etc. */
  segment?: string;
  /** Zona operativa */
  zone?: string;
  /** Offerta concreta */
  offer?: string;
  /** Tono: professionale | familiare | tecnico | urgenza */
  tone?: "professionale" | "familiare" | "tecnico" | "urgenza";
  /** Numero varianti richieste (default 5, max 10) */
  variants?: number;
  /** Lingua output (default it) */
  locale?: "it" | "en";
}

interface CopyGenResponse {
  success: boolean;
  copy_variants: string[];
  hooks: string[];
  cta_suggestions: string[];
  image_prompts: string[];
  warnings: string[];
  model_used?: string;
  cost_eur_cents?: number;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, corsHeaders);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401, corsHeaders);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user } } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "unauthorized" }, 401, corsHeaders);

    let body: CopyGenRequest;
    try {
      body = (await req.json()) as CopyGenRequest;
    } catch {
      return json({ error: "invalid_json" }, 400, corsHeaders);
    }

    if (!body.company_id || !body.brief || body.brief.length < 10) {
      return json({ error: "brief_too_short" }, 400, corsHeaders);
    }

    // AUTHZ company
    const { data: profile } = await admin
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.company_id !== body.company_id) {
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
      const isSA = (roles ?? []).some((r) => r.role === "super_admin");
      if (!isSA) return json({ error: "forbidden" }, 403, corsHeaders);
    }

    const variants = Math.min(Math.max(body.variants ?? 5, 1), 10);
    const tone = body.tone ?? "professionale";

    // PROMPT
    const systemPrompt = `Sei un copywriter Meta Ads esperto in edilizia italiana.
Devi generare copy per annunci Facebook/Instagram che convertono in lead qualificati.

REGOLE OBBLIGATORIE:
- Italiano perfetto, ZERO inglesismi inutili
- Mai claim non verificabili ("migliore", "garantito", "il più", "primo")
- Mai promesse esagerate o falsi miti
- Niente testo sull'immagine > 20% (regola Meta)
- Ogni copy: hook nelle prime 5 parole + valore concreto + CTA
- Tono: ${tone}
- Lunghezza: 80-160 caratteri per copy (mobile-first)
- Conforme alle policy Meta (no salute/finanza prima/dopo aggressivi)

OUTPUT JSON con:
- copy_variants: array di ${variants} stringhe copy
- hooks: array di 3 hook brevi (5-10 parole)
- cta_suggestions: array di 3 CTA Meta valide (GET_QUOTE, LEARN_MORE, CONTACT_US, etc.)
- image_prompts: array di 3 prompt immagine (DALL-E style, formato 1:1 4:5 9:16)
- warnings: array di eventuali avvertimenti compliance/tono

NIENTE altro fuori dal JSON.`;

    const userPrompt = `BRIEF: ${body.brief}
${body.segment ? `SETTORE: ${body.segment}` : ""}
${body.zone ? `ZONA: ${body.zone}` : ""}
${body.offer ? `OFFERTA: ${body.offer}` : ""}

Genera ${variants} varianti copy che differiscono per angolo di vendita (prezzo, tempi, prova sociale, urgenza, qualità).`;

    // CHIAMATA AI — usa task_kind "chat_routine" (più generico, marketing_copy_generation non è in enum)
    let aiResp;
    try {
      aiResp = await chat({
        company_id: body.company_id,
        task_kind: "chat_routine",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 1500,
        json_mode: true,
      });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return json({
          error: "insufficient_credits",
          user_message: e.user_message_it,
        }, 402, corsHeaders);
      }
      throw e;
    }

    // PARSE
    const raw = aiResp.content ?? "{}";
    let parsed: Partial<CopyGenResponse> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Tentativo recovery: estrai JSON da risposta
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          // Fallback hardcoded
        }
      }
    }

    const result: CopyGenResponse = {
      success: true,
      copy_variants: Array.isArray(parsed.copy_variants) ? parsed.copy_variants.slice(0, variants) : [],
      hooks: Array.isArray(parsed.hooks) ? parsed.hooks.slice(0, 5) : [],
      cta_suggestions: Array.isArray(parsed.cta_suggestions) ? parsed.cta_suggestions.slice(0, 5) : [],
      image_prompts: Array.isArray(parsed.image_prompts) ? parsed.image_prompts.slice(0, 5) : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      model_used: aiResp.model_used,
      cost_eur_cents: Math.round((aiResp.cost_usd ?? 0) * 92), // USD→EUR cents rough
    };

    return json(result, 200, corsHeaders);
  } catch (e) {
    console.error("[ai-ads-copy-generate] uncaught", e);
    return json({ error: "internal_error", detail: String(e) }, 500, corsHeaders);
  }
});

function json(payload: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
