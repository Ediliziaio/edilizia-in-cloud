/**
 * ai-ads-offer-builder — costruisce offerte pubblicitarie forti
 *
 * Quando l'utente apre il wizard di creazione campagna, l'AI legge il
 * profilo aziendale completo e genera 3-5 OFFERTE CANDIDATE pronte da
 * usare. Ogni offerta è costruita sui 7 parametri di un'offerta vincente
 * Meta Ads:
 *
 *   1. PROMESSA specifica e misurabile (in 48h, entro 7 giorni, +30%)
 *   2. VANTAGGIO concreto quantificabile (risparmio €, m² coperti, anni
 *      garanzia)
 *   3. RIDUZIONE RISCHIO (gratuito, senza impegno, soddisfatto o rimborso)
 *   4. URGENZA reale (bonus fiscale 2026, posti limitati per la stagione)
 *   5. PROVA SOCIALE verificabile (200+ cantieri dal 2010 in Brianza)
 *   6. CTA chiara a basso attrito (preventivo in 2 minuti, chiama)
 *   7. LOCALIZZAZIONE esplicita (zona operativa)
 *
 * Input minimo: company_id. Tutto il resto (settore, città, anni attività,
 * dimensione team) viene letto da `companies`.
 *
 * Output JSON:
 *   {
 *     company_signals: { name, sector, city, anni_attivita, dipendenti, ... }
 *     offers: [
 *       {
 *         tier: "strong" | "medium" | "starter",
 *         headline: "Titolo accattivante",
 *         pitch: "Frase 80-180 char con i 7 parametri",
 *         parameters: { promise, advantage, risk_reversal, urgency, proof, cta, locality },
 *         missing_data: [],  // dati azienda da completare per ulteriore valore
 *         confidence: 0-100
 *       }
 *     ],
 *     missing_company_fields: [],
 *     advice: "1 frase coaching"
 *   }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { chat, InsufficientCreditsError } from "../_shared/ai-provider/index.ts";

interface BuildRequest {
  company_id: string;
  /** Eventuale focus richiesto (es. "voglio servizio premium" o "intercetto bonus fiscale") */
  user_intent?: string;
  /** Settore prevalente da considerare (override del default `vertical`) */
  segment_hint?: string;
}

interface OfferCandidate {
  tier: "strong" | "medium" | "starter";
  headline: string;
  pitch: string;
  parameters: {
    promise: string;
    advantage: string;
    risk_reversal: string;
    urgency: string;
    proof: string;
    cta: string;
    locality: string;
  };
  suggested_hook: string;
  suggested_cta: string;
  daily_budget_suggested: number;
  missing_data: string[];
  confidence: number;
}

interface CompanySignals {
  name: string;
  business_name: string | null;
  sector: string | null;
  vertical: string | null;
  city: string | null;
  province: string | null;
  region: string | null;
  anni_attivita: number | null;
  employee_count: number | null;
  company_size: string | null;
  phone: string | null;
  website: string | null;
  annual_revenue_range: string | null;
  monthly_orders_target: number | null;
  has_website: boolean;
  has_phone: boolean;
  notes: string | null;
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPT = `Sei un Senior Performance Marketer Meta Ads esperto in lead generation per imprese edili italiane.

Devi generare 3-5 OFFERTE CANDIDATE per la campagna pubblicitaria, ognuna costruita rigorosamente sui 7 PARAMETRI di un'offerta vincente:

═══ I 7 PARAMETRI DI UN'OFFERTA FORTE ═══

1. PROMESSA SPECIFICA E MISURABILE
   - ❌ "preventivi veloci" / "lavori di qualità"
   - ✅ "preventivo serramenti chiavi in mano in 48 ore"
   - ✅ "sopralluogo tecnico + offerta firmata in 7 giorni"

2. VANTAGGIO QUANTIFICABILE
   - ❌ "risparmi energia" / "lavoro fatto bene"
   - ✅ "-30% bolletta in 12 mesi" / "+15 anni durata"
   - ✅ "rimborso 65% in detrazione fiscale"

3. RIDUZIONE DEL RISCHIO (no-risk reversal)
   - ❌ niente
   - ✅ "sopralluogo gratuito" / "preventivo senza impegno"
   - ✅ "se il preventivo non ti convince paghi solo lo studio"
   - ✅ "fattibilità gratuita prima di firmare"

4. URGENZA REALE (mai falsa)
   - ❌ "ultimi posti" (se non vero) / "scade oggi" (mai)
   - ✅ "bonus 50% valido fino al 31 dicembre 2026"
   - ✅ "agenda piena da fine novembre"
   - ✅ "in 30gg parte la stagione e i tempi raddoppiano"

5. PROVA SOCIALE VERIFICABILE
   - ❌ "i migliori" / "leader del settore"
   - ✅ "200+ cantieri completati a Brianza dal 2010" (con dati veri)
   - ✅ "12 anni di posa certificata"
   - ✅ "media 4.8/5 su Google"
   Se i dati non li hai, EVITA il parametro proof (lascia stringa vuota) e
   segnala in missing_data la mancanza.

6. CTA CHIARA A BASSO ATTRITO
   - ❌ "scopri di più" / "contattaci"
   - ✅ "richiedi preventivo (2 minuti)"
   - ✅ "calcola la tua detrazione"
   - ✅ "fissa il sopralluogo gratuito"
   - ✅ "scrivi su WhatsApp"

7. LOCALIZZAZIONE ESPLICITA
   - ❌ "in tutta Italia"
   - ✅ "per chi vive a Monza e Brianza"
   - ✅ "[Città] e provincia"

═══ TIER DELLE OFFERTE ═══

Genera 3 offerte distinte per tier:

a) STRONG (alta intensità — promessa massima, urgenza concreta, prova sociale forte):
   Per aziende con dati solidi (anni attività ≥5, recensioni, cantieri verificabili).
   Pitch più lungo (140-180 char), urgenza concreta, prova sociale.

b) MEDIUM (bilanciato — promessa chiara senza esagerare):
   Pitch ~100-140 char. Vantaggio + riduzione rischio + locality.
   Default per la maggior parte delle aziende.

c) STARTER (per chi parte — focus su rischio basso + apertura conversazione):
   Pitch corto (80-120 char). Sopralluogo gratuito + CTA messaggistica.
   Per aziende giovani senza dati di prova sociale.

═══ COMPLIANCE META ═══

- NIENTE claim invalidabili ("il migliore", "garantito al 100%", "primo")
- NIENTE prima/dopo aggressivi
- NIENTE targeting personale Meta-vietato ("hai problemi con..." / "tu che soffri di...")
- NIENTE salute/finanza prima/dopo
- Italiano naturale, dare del tu/voi

═══ OUTPUT JSON — ESATTO ═══

{
  "offers": [
    {
      "tier": "strong" | "medium" | "starter",
      "headline": "Titolo breve max 50 char",
      "pitch": "Frase 80-180 char con 7 parametri integrati",
      "parameters": {
        "promise": "estratto specifico",
        "advantage": "estratto",
        "risk_reversal": "estratto (può essere stringa vuota se non applicabile)",
        "urgency": "estratto (stringa vuota se non hai dati per supportarla)",
        "proof": "estratto (stringa vuota se mancano numeri verificabili)",
        "cta": "estratto",
        "locality": "estratto"
      },
      "suggested_hook": "Prima riga stop-scroll 30-60 char",
      "suggested_cta": "GET_QUOTE" | "CONTACT_US" | "MESSAGE_PAGE" | "WHATSAPP_MESSAGE" | "LEARN_MORE",
      "daily_budget_suggested": 15-50 (EUR/giorno),
      "missing_data": ["nome_campo_da_completare", ...],
      "confidence": 0-100 (più alto = pitch più solido basato sui dati disponibili)
    }
  ],
  "missing_company_fields": ["nome", "anno_fondazione", "recensioni", "cantieri_completati", ...],
  "advice": "1-2 frasi coaching su come potenziare le offerte completando i dati mancanti"
}

NIENTE testo fuori dal JSON. NIENTE markdown fence. SOLO il JSON.`;

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
    if (!userData?.user) return json({ error: "unauthorized" }, 401, corsHeaders);

    const body = (await req.json()) as BuildRequest;
    if (!body.company_id) return json({ error: "missing_company_id" }, 400, corsHeaders);

    // Cross-tenant guard
    const [profileRes, rolesRes] = await Promise.all([
      admin.from("profiles").select("company_id").eq("id", userData.user.id).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", userData.user.id),
    ]);
    const isSA = (rolesRes.data ?? []).some((r: { role: string }) => r.role === "super_admin");
    if (!isSA && profileRes.data?.company_id !== body.company_id) {
      return json({ error: "forbidden" }, 403, corsHeaders);
    }

    // Carica profilo azienda
    const { data: company, error: companyErr } = await admin
      .from("companies")
      .select("name, business_name, sector, vertical, verticals_secondari, legal_city, legal_province, operational_city, operational_province, region, anno_fondazione, employee_count, company_size, phone, website, annual_revenue_range, monthly_orders_target, notes")
      .eq("id", body.company_id)
      .maybeSingle();

    if (companyErr || !company) {
      return json({ error: "company_not_found" }, 404, corsHeaders);
    }

    // Costruisci signals
    const currentYear = new Date().getFullYear();
    const anniAttivita = company.anno_fondazione ? Math.max(0, currentYear - company.anno_fondazione) : null;
    const city = company.operational_city ?? company.legal_city ?? null;
    const province = company.operational_province ?? company.legal_province ?? null;

    const signals: CompanySignals = {
      name: company.name ?? "Azienda",
      business_name: company.business_name,
      sector: company.sector,
      vertical: body.segment_hint ?? company.vertical,
      city,
      province,
      region: company.region,
      anni_attivita: anniAttivita,
      employee_count: company.employee_count,
      company_size: company.company_size,
      phone: company.phone,
      website: company.website,
      annual_revenue_range: company.annual_revenue_range,
      monthly_orders_target: company.monthly_orders_target,
      has_website: !!company.website,
      has_phone: !!company.phone,
      notes: company.notes,
    };

    // Componi user prompt con i dati azienda
    const dataLines: string[] = [];
    dataLines.push(`Nome azienda: ${signals.name}`);
    if (signals.vertical) dataLines.push(`Settore principale: ${signals.vertical}`);
    if (signals.sector) dataLines.push(`Categoria: ${signals.sector}`);
    if (signals.city) dataLines.push(`Città operativa: ${signals.city}${signals.province ? ` (${signals.province})` : ""}`);
    if (signals.region) dataLines.push(`Regione: ${signals.region}`);
    if (signals.anni_attivita !== null) dataLines.push(`Anni di attività: ${signals.anni_attivita}`);
    if (signals.employee_count) dataLines.push(`Dipendenti: ${signals.employee_count}`);
    if (signals.company_size) dataLines.push(`Dimensione: ${signals.company_size}`);
    if (signals.has_website) dataLines.push(`Sito web: SÌ (${signals.website})`);
    if (signals.has_phone) dataLines.push(`Telefono diretto: SÌ`);
    if (signals.annual_revenue_range) dataLines.push(`Fascia fatturato: ${signals.annual_revenue_range}`);
    if (signals.monthly_orders_target) dataLines.push(`Target ordini/mese: ${signals.monthly_orders_target}`);
    if (signals.notes) dataLines.push(`Note interne: ${signals.notes.slice(0, 200)}`);

    const userPrompt = `═══ DATI AZIENDA ═══
${dataLines.join("\n")}

${body.user_intent ? `═══ INTENT UTENTE ═══\n${body.user_intent}\n` : ""}═══ TASK ═══
Genera 3 offerte (1 starter, 1 medium, 1 strong) costruite sui 7 parametri.
- Usa i dati azienda VERI: città reale, anni reali, dimensione reale.
- Se mancano dati per "proof" o "urgency" (es. recensioni, anno fondazione, cantieri),
  lascia STRINGA VUOTA in quel parametro e segnala il dato mancante in missing_data.
- "missing_company_fields" deve elencare i campi del profilo aziendale che, se completati,
  migliorerebbero TUTTE le offerte (es. "anno_fondazione", "recensioni_google", "cantieri_anno", "tagline").
- "advice" deve dare 1-2 frasi pratiche su come potenziare le offerte.`;

    // Chiamata AI
    let resp;
    try {
      resp = await chat({
        task_kind: "structured_extraction",
        company_id: body.company_id,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 3000,
        temperature: 0.5,
        json_mode: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return json({ error: "insufficient_credits", message: e.user_message_it }, 402, corsHeaders);
      }
      throw e;
    }

    const rawText = resp?.content ?? "";
    const match = String(rawText).match(/\{[\s\S]*\}/);
    if (!match) {
      return json({ error: "ai_invalid_output", raw: String(rawText).slice(0, 300) }, 502, corsHeaders);
    }

    let parsed: { offers?: OfferCandidate[]; missing_company_fields?: string[]; advice?: string };
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return json({ error: "ai_invalid_json" }, 502, corsHeaders);
    }

    // Sanitize
    const offers: OfferCandidate[] = Array.isArray(parsed.offers)
      ? parsed.offers
          .filter((o) => o && typeof o.pitch === "string" && o.pitch.trim().length > 20)
          .slice(0, 5)
          .map((o) => ({
            tier: ["strong", "medium", "starter"].includes(o.tier) ? o.tier : "medium",
            headline: String(o.headline ?? "").slice(0, 60),
            pitch: String(o.pitch ?? "").slice(0, 220),
            parameters: {
              promise: String(o.parameters?.promise ?? "").slice(0, 180),
              advantage: String(o.parameters?.advantage ?? "").slice(0, 180),
              risk_reversal: String(o.parameters?.risk_reversal ?? "").slice(0, 180),
              urgency: String(o.parameters?.urgency ?? "").slice(0, 180),
              proof: String(o.parameters?.proof ?? "").slice(0, 180),
              cta: String(o.parameters?.cta ?? "").slice(0, 60),
              locality: String(o.parameters?.locality ?? "").slice(0, 100),
            },
            suggested_hook: String(o.suggested_hook ?? "").slice(0, 100),
            suggested_cta: ["GET_QUOTE", "CONTACT_US", "MESSAGE_PAGE", "WHATSAPP_MESSAGE", "LEARN_MORE"].includes(o.suggested_cta)
              ? o.suggested_cta
              : "GET_QUOTE",
            daily_budget_suggested: Math.max(10, Math.min(100, Number(o.daily_budget_suggested) || 25)),
            missing_data: Array.isArray(o.missing_data) ? o.missing_data.filter((m: unknown) => typeof m === "string").slice(0, 8) : [],
            confidence: Math.max(0, Math.min(100, Number(o.confidence) || 50)),
          }))
      : [];

    return json({
      ok: true,
      company_signals: signals,
      offers,
      missing_company_fields: Array.isArray(parsed.missing_company_fields)
        ? parsed.missing_company_fields.filter((f: unknown) => typeof f === "string").slice(0, 10)
        : [],
      advice: String(parsed.advice ?? "").slice(0, 300),
    }, 200, corsHeaders);
  } catch (e) {
    console.error("[ai-ads-offer-builder] error", e);
    return json({ error: "internal_error", detail: e instanceof Error ? e.message : String(e) }, 500, corsHeaders);
  }
});
