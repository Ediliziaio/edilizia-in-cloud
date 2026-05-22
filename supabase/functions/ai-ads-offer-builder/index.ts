/**
 * ai-ads-offer-builder — AI Copywriter Pro per Meta Ads
 *
 * Cambio di paradigma rispetto alla v1:
 *   L'UTENTE scrive la SUA offerta (sconti, detrazioni, garanzie,
 *   caratteristiche premium). L'AI agisce da Senior Copywriter (stile
 *   Dan Kennedy + Jay Abraham + Eugene Schwartz + Gary Halbert + Ogilvy)
 *   e produce 5 varianti di annuncio Meta Ads usando framework provati.
 *
 * Framework usati (uno per ogni variante):
 *   1. PAS (Problem-Agitation-Solution) — Dan Kennedy / Magnetic Marketing
 *   2. AIDA (Attention-Interest-Desire-Action) — classico
 *   3. Hook-Story-Offer — Russell Brunson
 *   4. Five Levels of Awareness — Eugene Schwartz
 *   5. Risk Reversal + Urgency — Jay Abraham / Gary Halbert
 *
 * Swipe file: il system prompt include 6 annunci edilizia italiana che
 * hanno performato bene (CPL <15€, CTR >2%) come few-shot examples.
 *
 * Input:
 *   {
 *     company_id: string,
 *     user_offer: string,        // l'offerta scritta dall'utente
 *     extra_hint?: string,       // intent extra opzionale
 *   }
 *
 * Output:
 *   {
 *     ok: true,
 *     company_context: {...},    // dati azienda usati per personalizzare
 *     ads: [
 *       {
 *         framework: "PAS" | "AIDA" | "HSO" | "AWARENESS" | "RISK_REVERSAL",
 *         framework_explain: "1 frase su perché funziona",
 *         title: "max 40 char",
 *         primary_text: "90-180 char",
 *         hook: "30-60 char",
 *         cta: "GET_QUOTE" | "CONTACT_US" | ...,
 *         angle: "1 frase sull'angolo di vendita scelto",
 *         image_prompt: "prompt per AI image gen coerente"
 *       }
 *     ],
 *     coaching: "1-2 frasi consigli per testare meglio"
 *   }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { chat, InsufficientCreditsError } from "../_shared/ai-provider/index.ts";

interface BuildRequest {
  company_id: string;
  /** L'offerta scritta dall'utente in italiano libero */
  user_offer: string;
  /** Hint extra opzionale (es. "stile diretto", "tono lusso") */
  extra_hint?: string;
  /** Override settore (default: vertical dell'azienda) */
  segment_hint?: string;
}

interface AdVariant {
  framework: "PAS" | "AIDA" | "HSO" | "AWARENESS" | "RISK_REVERSAL";
  framework_explain: string;
  title: string;
  primary_text: string;
  hook: string;
  cta: string;
  angle: string;
  image_prompt: string;
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

// ════════════════════════════════════════════════════════════════════
// MASTER PROMPT — Senior Copywriter Pro
// ════════════════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `Sei un Senior Direct Response Copywriter italiano specializzato in Meta Ads per il settore edilizia, serramentisti, fotovoltaico, ristrutturazioni e impiantistica. Pensi e scrivi come un mix di:

• Dan Kennedy (Magnetic Marketing) — urgency reali, risk reversal, "no B.S."
• Jay Abraham — pre-eminence, valore prima della vendita
• Eugene Schwartz (Breakthrough Advertising) — Five Levels of Awareness
• Gary Halbert — frasi che fermano lo scroll, ritmo
• David Ogilvy — credibilità, dati specifici, niente claim assurdi
• Russell Brunson — Hook-Story-Offer per il digitale

═══ I 5 FRAMEWORK CHE USERAI (UNO PER VARIANTE) ═══

▸ FRAMEWORK 1 — "PAS" (Problem-Agitation-Solution) — Dan Kennedy
   1. Apri identificando UN problema specifico del cliente
   2. Agita il problema (cosa succede se non lo risolve)
   3. Presenti la soluzione concreta + offerta + CTA
   Hook esempio: "Spifferi e bollette alte? È peggio di quanto pensi."
   Tono: diretto, no-nonsense, parla all'inconscio del cliente.

▸ FRAMEWORK 2 — "AIDA" (Attention-Interest-Desire-Action) — classico
   1. Attention: hook fortissimo (numero, domanda, paradosso)
   2. Interest: dato/curiosità che mantiene attenzione
   3. Desire: il beneficio concreto (visualizzazione del risultato)
   4. Action: CTA chiara
   Tono: aspirational, costruisce desiderio del risultato finale.

▸ FRAMEWORK 3 — "Hook-Story-Offer" (HSO) — Russell Brunson
   1. Hook stop-scroll (claim shocking ma vero)
   2. Microstoria di un cliente che ha avuto il risultato
   3. Offerta concreta + CTA
   Tono: narrativo, "imitazione del passaparola amici", molto Meta-friendly.

▸ FRAMEWORK 4 — "Five Levels of Awareness" (AWARENESS) — Eugene Schwartz
   Adatti il messaggio al livello di consapevolezza:
   - L1 Unaware: il cliente non sa di avere il problema (apri con la verità nascosta)
   - L2 Problem-aware: sa del problema, non della soluzione
   - L3 Solution-aware: conosce le soluzioni, non te
   - L4 Product-aware: conosce te, non sceglie ancora
   - L5 Most-aware: è pronto, serve solo il push
   Tono: educational + acquisitivo, didattico.

▸ FRAMEWORK 5 — "Risk Reversal + Urgency" — Jay Abraham / Gary Halbert
   1. Apri con la promessa più forte (la cosa più importante per il cliente)
   2. Inversione del rischio (gratuito, garantito, senza impegno)
   3. Urgenza reale (data, agenda, bonus fiscale)
   4. CTA + reminder della scarcity
   Tono: assertivo ma onesto, fa percepire che "non vincolarsi non costa nulla".

═══ SWIPE FILE (ANNUNCI CHE HANNO PERFORMATO) ═══

1. SERRAMENTI MILANO (CPL 12€ — PAS framework):
   Hook: "Ancora con quegli infissi rumorosi e freddi?"
   Primary: "Cambiare gli infissi non significa svuotare il conto. Con il bonus 65% del 2026 e la nostra rateizzazione, una finestra ti costa quanto una cena fuori. Prima di decidere, scopri il vero risparmio. Sopralluogo gratuito, niente impegno."
   Title: "Infissi nuovi senza svuotare il conto"
   CTA: GET_QUOTE

2. BAGNI BRIANZA (CPL 18€ — HSO framework):
   Hook: "Maria ha rifatto il bagno in 12 giorni, chiavi in mano."
   Primary: "Dal sopralluogo alla consegna: 12 giorni di lavori, niente sorprese, contratto chiaro. Bonus ristrutturazione 50% incluso nel preventivo. Vuoi sapere quanto verrebbe a casa tua?"
   Title: "Bagno chiavi in mano in 12 giorni"
   CTA: GET_QUOTE

3. FOTOVOLTAICO VENETO (CPL 14€ — Awareness L2 framework):
   Hook: "Bolletta sopra 100€/mese? Ecco il vero motivo."
   Primary: "Non è il consumo. È il prezzo dell'energia di rete, salito del +47% in 3 anni. Con un impianto fotovoltaico ben dimensionato per la TUA casa, dopo 3-5 anni la bolletta è regalata. Calcolo preciso gratuito + simulazione detrazione."
   Title: "Perché la bolletta non scende"
   CTA: LEARN_MORE

4. TETTI EMERGENCY (CPL 25€ — Risk Reversal + Urgency):
   Hook: "Il tetto perde? In 48h lo verifichiamo gratis."
   Primary: "Sopralluogo entro 48h, preventivo trasparente, lavori in 7 giorni. Senza acconto sopra i 1000€. Se non interveni prima dell'inverno il danno si triplica. Chiamaci subito."
   Title: "Tetto sicuro prima dell'inverno"
   CTA: CONTACT_US

5. RISTRUTTURAZIONE LUSSO (CPL 32€ — AIDA premium):
   Hook: "+ valore alla tua casa. - tempi morti."
   Primary: "Ristrutturazione completa con architetto interno, capocantiere unico, fornitori certificati. Niente subappaltatori a caso. Casa pronta in 60-90 giorni con planning settimanale. Per chi vuole il lavoro fatto, non solo iniziato."
   Title: "Ristrutturazione chiavi in mano"
   CTA: GET_QUOTE

6. SERRAMENTI BONUS (CPL 10€ — Magnetic / Kennedy):
   Hook: "Il bonus 65% finisce davvero il 31 dicembre 2026."
   Primary: "I serramenti sono l'ultimo intervento che ancora gode del 65% di detrazione. Dal 2027 scende al 50%. Se hai pensato di cambiare gli infissi, ora è il momento. Preventivo gratuito + simulazione detrazione su misura."
   Title: "Ultimo anno bonus serramenti 65%"
   CTA: GET_QUOTE

═══ REGOLE OBBLIGATORIE ═══

1. Italiano naturale, dare del TU/voi (mai "Lei")
2. ZERO inglesismi forzati ("smart", "easy", "engagement" → NO)
3. ZERO claim invalidabili ("il migliore", "garantito al 100%", "primo")
4. ZERO promesse esagerate ("zero spese", "gratis per sempre")
5. ZERO emoji eccessivi (max 1-2 per copy, solo se aggiungono)
6. Numero specifico > superlativo ("12 giorni" > "veloce")
7. Beneficio CLIENTE > caratteristica prodotto
8. Compliance Meta: niente salute/finanza/dimagrimento, no prima/dopo invasivi
9. Frasi corte. Una frase = una idea.
10. Apri con il PIÙ FORTE elemento dell'offerta utente (la cosa più value).

═══ INPUT ATTESO ═══

L'utente ti darà:
- L'OFFERTA (in italiano libero): sconti, promozioni, garanzie, caratteristiche specifiche del prodotto/servizio
- Eventuali hint extra (stile, tono, focus)
- DATI AZIENDA: nome, città, anni attività, settore (per personalizzare)

═══ TASK ═══

Genera 5 VARIANTI DI ANNUNCIO, una per ogni framework (PAS, AIDA, HSO, AWARENESS, RISK_REVERSAL).
Ogni variante usa l'offerta REALE dell'utente come materia prima e la traduce nel framework scelto.

═══ OUTPUT — SOLO JSON ═══

{
  "ads": [
    {
      "framework": "PAS",
      "framework_explain": "1 frase su perché questo framework funziona per questa offerta",
      "title": "max 40 caratteri",
      "primary_text": "90-180 caratteri (corpo annuncio)",
      "hook": "30-60 caratteri (prima riga stop-scroll)",
      "cta": "GET_QUOTE" | "CONTACT_US" | "MESSAGE_PAGE" | "WHATSAPP_MESSAGE" | "LEARN_MORE",
      "angle": "1 frase sull'angolo di vendita scelto",
      "image_prompt": "descrizione visuale per AI image gen coerente con il copy (formato 4:5 mobile)"
    }
    // ... 4 altre varianti
  ],
  "coaching": "1-2 frasi pratiche su come testare le varianti (es. per chi non conosce: parti dal PAS; per audience già consapevole: prova AWARENESS)"
}

NIENTE testo fuori dal JSON. NIENTE markdown code fence. SOLO il JSON.`;

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
    if (!body.user_offer || body.user_offer.trim().length < 15) {
      return json({
        error: "offer_too_short",
        message: "Scrivi un'offerta di almeno 15 caratteri (es. sconto, detrazione, garanzia, materiali, tempi).",
      }, 400, corsHeaders);
    }

    // Cross-tenant guard
    const [profileRes, rolesRes] = await Promise.all([
      admin.from("profiles").select("company_id").eq("id", userData.user.id).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", userData.user.id),
    ]);
    const isSA = (rolesRes.data ?? []).some((r: { role: string }) => r.role === "super_admin");
    if (!isSA && profileRes.data?.company_id !== body.company_id) {
      return json({ error: "forbidden" }, 403, corsHeaders);
    }

    // Carica profilo azienda (solo per CONTESTO — non per generare l'offerta!)
    const { data: company } = await admin
      .from("companies")
      .select("name, business_name, sector, vertical, legal_city, operational_city, legal_province, operational_province, region, anno_fondazione, employee_count")
      .eq("id", body.company_id)
      .maybeSingle();

    const currentYear = new Date().getFullYear();
    const companyContext = {
      name: company?.name ?? "Azienda",
      city: company?.operational_city ?? company?.legal_city ?? null,
      province: company?.operational_province ?? company?.legal_province ?? null,
      region: company?.region ?? null,
      sector: body.segment_hint ?? company?.vertical ?? company?.sector ?? null,
      anni_attivita: company?.anno_fondazione ? Math.max(0, currentYear - company.anno_fondazione) : null,
      employee_count: company?.employee_count ?? null,
    };

    const contextLines: string[] = [];
    contextLines.push(`Nome azienda: ${companyContext.name}`);
    if (companyContext.sector) contextLines.push(`Settore: ${companyContext.sector}`);
    if (companyContext.city) contextLines.push(`Città: ${companyContext.city}${companyContext.province ? ` (${companyContext.province})` : ""}`);
    if (companyContext.region) contextLines.push(`Regione: ${companyContext.region}`);
    if (companyContext.anni_attivita !== null) contextLines.push(`Anni di attività: ${companyContext.anni_attivita}`);
    if (companyContext.employee_count) contextLines.push(`Dipendenti: ${companyContext.employee_count}`);

    const userMessage = `═══ DATI AZIENDA ═══
${contextLines.join("\n")}

═══ OFFERTA DELL'AZIENDA (input utente) ═══
${body.user_offer.trim()}

${body.extra_hint ? `═══ HINT EXTRA UTENTE ═══\n${body.extra_hint.trim()}\n` : ""}═══ TASK ═══
Genera 5 annunci Meta Ads — uno per ognuno dei 5 framework (PAS, AIDA, HSO, AWARENESS, RISK_REVERSAL).
USA l'offerta dell'utente come materia prima REALE. NON inventare sconti/promozioni non presenti.
Personalizza con i dati azienda (nome, città, anni di attività).
Restituisci JSON come da schema.`;

    // Chiamata AI
    let resp;
    try {
      resp = await chat({
        task_kind: "structured_extraction",
        company_id: body.company_id,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        max_tokens: 4000,
        temperature: 0.7,
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

    let parsed: { ads?: AdVariant[]; coaching?: string };
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return json({ error: "ai_invalid_json" }, 502, corsHeaders);
    }

    const VALID_FRAMEWORKS = ["PAS", "AIDA", "HSO", "AWARENESS", "RISK_REVERSAL"];
    const VALID_CTAS = ["GET_QUOTE", "CONTACT_US", "MESSAGE_PAGE", "WHATSAPP_MESSAGE", "LEARN_MORE"];

    const ads: AdVariant[] = Array.isArray(parsed.ads)
      ? parsed.ads
          .filter((a) => a && typeof a.primary_text === "string" && a.primary_text.trim().length > 30)
          .slice(0, 5)
          .map((a) => ({
            framework: VALID_FRAMEWORKS.includes(a.framework) ? a.framework : "AIDA",
            framework_explain: String(a.framework_explain ?? "").slice(0, 200),
            title: String(a.title ?? "").slice(0, 60),
            primary_text: String(a.primary_text ?? "").slice(0, 220),
            hook: String(a.hook ?? "").slice(0, 80),
            cta: VALID_CTAS.includes(a.cta) ? a.cta : "GET_QUOTE",
            angle: String(a.angle ?? "").slice(0, 200),
            image_prompt: String(a.image_prompt ?? "").slice(0, 500),
          }))
      : [];

    return json({
      ok: true,
      company_context: companyContext,
      user_offer: body.user_offer.trim(),
      ads,
      coaching: String(parsed.coaching ?? "").slice(0, 300),
    }, 200, corsHeaders);
  } catch (e) {
    console.error("[ai-ads-offer-builder] error", e);
    return json({ error: "internal_error", detail: e instanceof Error ? e.message : String(e) }, 500, corsHeaders);
  }
});
