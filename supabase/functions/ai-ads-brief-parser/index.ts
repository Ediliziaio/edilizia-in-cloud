/**
 * ai-ads-brief-parser — Quick Start Campagna AI
 *
 * Input testo libero dell'utente ("voglio lead per ristrutturazioni bagno a Milano,
 * budget 30€/giorno, target famiglie con casa di proprietà") +
 * dati company profile (nome, settore, città) → output JSON con BuilderState
 * parziale popolato per Meta Ads.
 *
 * Pattern: usa Claude (haiku-4-5) con structured output JSON. Niente streaming
 * (l'utente aspetta 2-4s e poi vede il form già compilato).
 *
 * Output garantito:
 *   {
 *     name: string,
 *     objective: "OUTCOME_LEADS" | "OUTCOME_TRAFFIC" | "OUTCOME_AWARENESS" | "OUTCOME_ENGAGEMENT",
 *     offer: string,
 *     dailyBudget: number,
 *     ageMin: number,
 *     ageMax: number,
 *     gender: "all" | "men" | "women",
 *     suggestedCities: string[],   // nomi città da cercare poi su meta-targeting-search
 *     suggestedInterests: string[],// nomi interessi
 *     copy: string,                // copy primario
 *     hooks: string[],             // 3 hook alternativi
 *     cta: "GET_QUOTE" | "LEARN_MORE" | "CONTACT_US" | "MESSAGE_PAGE" | "WHATSAPP_MESSAGE",
 *     reasoning: string            // 1 frase spiegazione scelte
 *   }
 *
 * Sicurezza:
 *   • Bearer token utente
 *   • Crediti AI scalati via chargeAndLog
 *   • Cap budget 5-500€/giorno
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { gateAiPayment } from "../_shared/requirePaymentMethod.ts";
import { chat, InsufficientCreditsError } from "../_shared/ai-provider/index.ts";

interface ParseRequest {
  company_id: string;
  brief: string;
  /** Settore opzionale (override company profile). */
  hint_segment?: string;
}

interface ParseResult {
  name: string;
  objective: "OUTCOME_LEADS" | "OUTCOME_TRAFFIC" | "OUTCOME_AWARENESS" | "OUTCOME_ENGAGEMENT";
  offer: string;
  dailyBudget: number;
  ageMin: number;
  ageMax: number;
  gender: "all" | "men" | "women";
  suggestedCities: string[];
  suggestedInterests: string[];
  copy: string;
  hooks: string[];
  cta: "GET_QUOTE" | "LEARN_MORE" | "CONTACT_US" | "MESSAGE_PAGE" | "WHATSAPP_MESSAGE";
  reasoning: string;
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPT = `Sei un esperto di Meta Ads italiano specializzato in lead generation per imprese edili,
serramentisti, fotovoltaico, ristrutturazioni, impianti elettrici/idraulici, tetti, manutenzione.

Riceverai un brief libero in italiano + alcuni dati dell'azienda (nome, settore, città). Devi restituire
ESCLUSIVAMENTE JSON valido (no testo extra, no markdown code fence) con questa struttura ESATTA:

{
  "name": "Nome campagna breve e descrittivo (max 60 char). Includi servizio + zona se chiaro",
  "objective": "OUTCOME_LEADS" | "OUTCOME_TRAFFIC" | "OUTCOME_AWARENESS" | "OUTCOME_ENGAGEMENT",
  "offer": "Frase chiara su cosa offri (max 200 char). Sopralluogo, preventivo, consulenza, ecc.",
  "dailyBudget": numero intero EUR tra 10 e 100 (default 25-30 per edilizia locale),
  "ageMin": 18-65,
  "ageMax": 18-65 (>= ageMin),
  "gender": "all" | "men" | "women" (di default 'all' salvo brief specifico),
  "suggestedCities": array di 1-5 nomi città italiane (es. ["Milano", "Monza", "Bergamo"]),
  "suggestedInterests": array di 3-7 nomi di interessi Meta in italiano
    (es. ["Ristrutturazione casa", "Interior design", "Detrazioni fiscali", "Mutuo", "Casa propria"]),
  "copy": "Testo principale dell'annuncio in italiano, 100-180 caratteri, evidenzia beneficio + CTA",
  "hooks": array di 3 stringhe (hook alternativi 30-60 char, prima riga dell'ad),
  "cta": "GET_QUOTE" | "LEARN_MORE" | "CONTACT_US" | "MESSAGE_PAGE" | "WHATSAPP_MESSAGE",
  "reasoning": "1 frase in italiano (max 200 char) che spiega le scelte chiave (zone, budget, interessi)"
}

REGOLE:
- Se l'utente non specifica budget, usa 25 EUR/giorno (sweet spot lead gen edilizia IT).
- Se l'utente non specifica città, usa la città dell'azienda + 2 città grandi vicine.
- Per edilizia/serramenti/tetti l'audience tipica è 35-65 anni.
- Per fotovoltaico/risparmio energetico aggiungi interesse "Risparmio energetico".
- Per impiantistica aggiungi "Casa propria", "Manutenzione casa".
- Se l'offerta è chiara, cta = GET_QUOTE; se è messaggistica, cta = MESSAGE_PAGE o WHATSAPP_MESSAGE.
- Il "name" deve essere actionable, NON generico ("Serramenti Milano - Lead Locale" non "Campagna Test").
- Copy deve essere FORMALE-COLLOQUIALE (dare del tu/voi), evidenziare beneficio CONCRETO, finire con call to action.
- Nessun emoji nel copy a meno che il brief li richieda esplicitamente.

Restituisci SOLO il JSON. Niente preambolo, niente backtick.`;

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

    const { data: userData } = await userClient.auth.getUser();
    const authUser = userData?.user;
    if (!authUser) return json({ error: "unauthorized" }, 401, corsHeaders);

    const body = (await req.json()) as ParseRequest;
    if (!body.company_id || !body.brief || body.brief.trim().length < 10) {
      return json({ error: "brief_too_short", min: 10 }, 400, corsHeaders);
    }

    // Cross-tenant guard
    const [profileRes, rolesRes] = await Promise.all([
      admin.from("profiles").select("company_id").eq("id", authUser.id).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", authUser.id),
    ]);
    const isSuperAdmin = (rolesRes.data ?? []).some((r: { role: string }) => r.role === "super_admin");
    if (!isSuperAdmin && profileRes.data?.company_id !== body.company_id) {
      return json({ error: "forbidden" }, 403, corsHeaders);
    }

    // Gate carta (audit AI 2026-06): strumento a costo senza controllo pagamento.
    const paymentBlock = await gateAiPayment(admin, body.company_id, corsHeaders);
    if (paymentBlock) return paymentBlock;

    // Carica company profile per dare contesto all'AI
    const { data: company } = await admin
      .from("companies")
      .select("name, city, vat_number, business_sector, description")
      .eq("id", body.company_id)
      .maybeSingle();

    const companyContext = company
      ? `DATI AZIENDA:\n- Nome: ${company.name ?? "—"}\n- Città: ${company.city ?? "—"}\n- Settore: ${body.hint_segment ?? company.business_sector ?? "edilizia generica"}\n- Descrizione: ${company.description ?? "—"}`
      : "DATI AZIENDA: non disponibili (usa default ragionevoli per edilizia IT)";

    const userMessage = `${companyContext}\n\nBRIEF UTENTE:\n${body.brief.trim()}`;

    // Chiama AI provider con structured output
    let resp;
    try {
      resp = await chat({
        task_kind: "structured_extraction",
        company_id: body.company_id,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        max_tokens: 1500,
        temperature: 0.3,
        json_mode: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return json({ error: "insufficient_credits", message: e.message }, 402, corsHeaders);
      }
      throw e;
    }

    const rawText = resp?.content ?? "";
    if (!rawText) {
      return json({ error: "ai_no_output" }, 502, corsHeaders);
    }

    // Parse JSON tollerante (rimuovi eventuale ```json ... ```)
    const jsonMatch = String(rawText).match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return json({ error: "ai_invalid_json", raw: String(rawText).slice(0, 300) }, 502, corsHeaders);
    }

    let parsed: ParseResult;
    try {
      parsed = JSON.parse(jsonMatch[0]) as ParseResult;
    } catch {
      return json({ error: "ai_invalid_json", raw: jsonMatch[0].slice(0, 300) }, 502, corsHeaders);
    }

    // Sanitize + cap valori
    const safe: ParseResult = {
      name: String(parsed.name ?? "Campagna Lead").slice(0, 60),
      objective: ["OUTCOME_LEADS", "OUTCOME_TRAFFIC", "OUTCOME_AWARENESS", "OUTCOME_ENGAGEMENT"].includes(parsed.objective)
        ? parsed.objective
        : "OUTCOME_LEADS",
      offer: String(parsed.offer ?? "").slice(0, 220),
      dailyBudget: Math.max(10, Math.min(100, Number(parsed.dailyBudget) || 25)),
      ageMin: Math.max(18, Math.min(65, Number(parsed.ageMin) || 28)),
      ageMax: Math.max(18, Math.min(65, Number(parsed.ageMax) || 60)),
      gender: ["all", "men", "women"].includes(parsed.gender) ? parsed.gender : "all",
      suggestedCities: Array.isArray(parsed.suggestedCities)
        ? parsed.suggestedCities.filter((c) => typeof c === "string").slice(0, 5)
        : [],
      suggestedInterests: Array.isArray(parsed.suggestedInterests)
        ? parsed.suggestedInterests.filter((i) => typeof i === "string").slice(0, 8)
        : [],
      copy: String(parsed.copy ?? "").slice(0, 250),
      hooks: Array.isArray(parsed.hooks) ? parsed.hooks.filter((h) => typeof h === "string").slice(0, 3) : [],
      cta: ["GET_QUOTE", "LEARN_MORE", "CONTACT_US", "MESSAGE_PAGE", "WHATSAPP_MESSAGE"].includes(parsed.cta)
        ? parsed.cta
        : "GET_QUOTE",
      reasoning: String(parsed.reasoning ?? "").slice(0, 220),
    };

    // Coerenza età: se ageMin > ageMax swap
    if (safe.ageMin > safe.ageMax) {
      const t = safe.ageMin;
      safe.ageMin = safe.ageMax;
      safe.ageMax = t;
    }

    return json({ ok: true, result: safe }, 200, corsHeaders);
  } catch (e) {
    console.error("[ai-ads-brief-parser] error", e);
    return json({ error: "internal_error", detail: e instanceof Error ? e.message : String(e) }, 500, corsHeaders);
  }
});
