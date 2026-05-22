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
  /** Backward-compat: ridondante con descriptions, mantenuto per chiamate esistenti */
  copy_variants: string[];
  /** Titoli brevi punchy (max 40 char) — appaiono in headline ad */
  titles: string[];
  /** Descrizioni complete del corpo testo (90-180 char) — Meta primary text */
  descriptions: string[];
  /** Hook prime righe attentioncatcher (30-60 char) */
  hooks: string[];
  /** CTA Meta valide */
  cta_suggestions: string[];
  /** Prompt immagine per ai-ads-image-generate */
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

    const variants = Math.min(Math.max(body.variants ?? 5, 1), 5);
    const tone = body.tone ?? "professionale";

    // ════════════════════════════════════════════════════════════════════
    // MASTERPROMPT — Sistema 3 blocchi separati (Titoli, Descrizioni, Hook)
    //
    // Differenze chiave tra blocchi (le persone sbagliano spesso):
    //   • TITOLO     = max 40 char, sotto l'immagine in Meta UI. Promessa atomica.
    //   • DESCRIZIONE = primary text, 90-180 char. Beneficio + CTA. Mobile-first.
    //   • HOOK       = prime 5-8 parole. Stop-scroll trigger. Apertura emotiva.
    //
    // Ogni blocco varia per ANGOLO DI VENDITA:
    //   1. Beneficio concreto (cosa migliora per il cliente)
    //   2. Riduzione attrito (rapidità, garanzia, processo chiaro)
    //   3. Prova sociale (X clienti, anni esperienza, certificazioni)
    //   4. Urgenza/scarcità (incentivo fiscale, finestra temporale)
    //   5. Specifico/locale (zona, materiali, made in Italy)
    // ════════════════════════════════════════════════════════════════════
    const systemPrompt = `Sei un Senior Copywriter Meta Ads italiano specializzato in lead generation per imprese edili, serramentisti, fotovoltaico, ristrutturazioni e impiantistica.

Devi generare copy per annunci Facebook/Instagram con 3 BLOCCHI DISTINTI, ciascuno con esattamente ${variants} varianti.

═══ MASTERPROMPT — REGOLE TASSATIVE ═══

PRINCIPI EDITORIAL:
1. Italiano naturale, ZERO inglesismi forzati ("smart", "easy", "engagement" → NO)
2. Dare del tu/voi sempre (no "Lei" formale)
3. Una frase = un'idea. Frasi corte, taglio diretto.
4. Numero concreto > superlativo ("+12 finestre montate in 2 giorni" > "tantissime finestre")
5. Beneficio per il cliente > caratteristica del prodotto
6. ZERO claim non verificabili ("migliore", "il primo", "garantito al 100%", "leader")
7. ZERO promesse esagerate ("zero spese", "gratis per sempre")
8. ZERO targeting personale Meta-vietato ("hai problemi con...", "tu che sei stanco di...")
9. ZERO emoji eccessivi (max 1-2 per copy, solo se brief lo richiede)
10. Compliance Meta: no salute/finanza/dimagrimento. No prima/dopo aggressivi.

ANGOLI DI VENDITA DA RUOTARE TRA LE ${variants} VARIANTI:
- variante 1: BENEFICIO CONCRETO (cosa cambia in casa del cliente)
- variante 2: PROCESSO TRASPARENTE (rapidità, chiarezza, no sorprese)
- variante 3: PROVA SOCIALE (numero clienti/anni/zone servite, NO claim invalidabili)
- variante 4: INCENTIVO/MOMENTUM (detrazioni fiscali, stagionalità, finestra)
- variante 5: LOCALITÀ/SPECIFICITÀ (zona operativa, materiali, expertise)

═══ DEFINIZIONI BLOCCHI ═══

▸ TITOLI (max 40 caratteri ciascuno)
  - Promessa atomica, leggibile in 0.5s
  - Posizione Meta UI: sotto l'immagine, font medio
  - Pattern vincenti:
    • "[Servizio] + [Zona] in [Tempo]" → "Infissi Milano in 7 giorni"
    • "[Numero] + [Beneficio]" → "3 step per il tuo bagno nuovo"
    • "[Domanda concreta]" → "Vuoi cambiare gli infissi?"
  - Mai più lunghi di 40 char (Meta tronca!)

▸ DESCRIZIONI / PRIMARY TEXT (90-180 caratteri ciascuna)
  - Corpo del copy che convince
  - Apertura HOOK (1 frase stop-scroll) + valore concreto + CTA implicita
  - Pattern vincenti:
    • "Vuoi [risultato]? Noi [cosa fai]. [Beneficio specifico]. [CTA]"
    • "[Anno/Numero] famiglie [zona] hanno [risultato]. [Come]. [CTA]"
    • "[Problema concreto] → [Soluzione tua]. [Tempo]. [CTA]"
  - Mobile first (frasi corte). Niente listoni.

▸ HOOK (30-60 caratteri ciascuno)
  - Prime 5-8 parole dell'annuncio
  - Lavoro: fermare lo scroll
  - Pattern vincenti:
    • Domanda diretta: "Spifferi sulle vecchie finestre?"
    • Numero impatto: "+ 35% comfort, - 40% bolletta"
    • Tempo concreto: "30 minuti, capiamo le tue misure"
    • Localismo: "Per chi vive a [zona]:"
  - NIENTE "Scopri", "Ciao a tutti", "Sapevi che" (banalizzanti)

═══ OUTPUT — SOLO JSON VALIDO ═══

{
  "titles": [array di ${variants} stringhe max 40 char],
  "descriptions": [array di ${variants} stringhe 90-180 char],
  "hooks": [array di ${variants} stringhe 30-60 char],
  "cta_suggestions": [3 valori da: GET_QUOTE, CONTACT_US, LEARN_MORE, MESSAGE_PAGE, WHATSAPP_MESSAGE],
  "image_prompts": [3 prompt per generare immagini coerenti, formato 4:5 mobile],
  "warnings": [array di eventuali alert compliance/Meta policy/claim invalidabili]
}

TONO: ${tone}
NIENTE TESTO FUORI DAL JSON. NIENTE \`\`\`json fence. SOLO il JSON.`;

    const userPrompt = `BRIEF UTENTE: ${body.brief}
${body.segment ? `SETTORE: ${body.segment}` : ""}
${body.zone ? `ZONA OPERATIVA: ${body.zone}` : ""}
${body.offer ? `OFFERTA CONCRETA: ${body.offer}` : ""}

Genera ${variants} titoli + ${variants} descrizioni + ${variants} hook che differiscono per angolo di vendita come definito sopra. Ogni angolo deve essere chiaramente diverso dagli altri (no parafrasi).`;

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

    // Sanitize: cap lengths e filter empty/non-string
    const cleanArr = (arr: unknown, maxLen: number, max: number): string[] =>
      Array.isArray(arr)
        ? (arr as unknown[])
            .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
            .map((s) => s.trim().slice(0, maxLen))
            .slice(0, max)
        : [];

    const titles = cleanArr(parsed.titles, 40, variants);
    const descriptions = cleanArr(parsed.descriptions, 220, variants);
    const hooks = cleanArr(parsed.hooks, 80, variants);

    const result: CopyGenResponse = {
      success: true,
      // Backward-compat: copy_variants = descriptions (era il legacy "body")
      copy_variants: descriptions,
      titles,
      descriptions,
      hooks,
      cta_suggestions: cleanArr(parsed.cta_suggestions, 32, 5),
      image_prompts: cleanArr(parsed.image_prompts, 500, 5),
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter((w) => typeof w === "string") : [],
      model_used: aiResp.model_used,
      cost_eur_cents: Math.round((aiResp.cost_usd ?? 0) * 92),
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
