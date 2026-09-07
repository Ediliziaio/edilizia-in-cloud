import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

import { serveConMetriche } from "../_shared/withMetrics.ts";
/**
 * outreach-ai-email — il SUPER_ADMIN genera oggetto + corpo di una cold email
 * PERSONALIZZATA dai dati del lead (azienda, città, tag, note e segnali raccolti
 * dallo scraping/arricchimento AI). Riusa aiRouterPrompt (routing+gate+ledger+
 * fallback gestiti internamente). Il prompt di sistema è istruito per il cold
 * B2B edilizia: breve, specifico, 1 CTA soft, niente spam, conforme.
 */

const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";

const SYSTEM_PROMPT = `Sei un copywriter esperto di cold email B2B in italiano per il mercato dell'edilizia.
Scrivi per conto di "Edilizia in Cloud", il gestionale cloud per imprese edili italiane
(fatturazione elettronica, gestione cantieri, DDT, preventivi, controllo costi e margini).

Obiettivo: una PRIMA email a freddo che apra una conversazione, non che venda subito.

REGOLE FERREE:
- Italiano, tono professionale ma umano e diretto. Niente "Spettabile" né formule da circolare; niente piaggeria.
- Corpo: 50-90 parole. Brevissimo. Ogni parola conta.
- Personalizza con i dati REALI del lead (azienda, città, settore, segnali). Cita qualcosa di specifico se disponibile; non inventare MAI dati, numeri o fatti.
- UNA sola call-to-action, soft: una domanda che invita a rispondere (es. "ha senso sentirci 10 minuti questa settimana?"). Niente link, niente allegati.
- Oggetto: 3-6 parole, rilevanza o curiosità concreta, stile umano in minuscolo; vietate spam words (gratis, offerta, sconto, promozione, !!!) e il nome del mittente.
- Niente claim esagerati o percentuali inventate. Niente emoji. Niente markdown. Niente grassetti.
- Niente firma finale (la aggiunge il sistema): chiudi con la CTA.
- Il valore per un'impresa edile è concreto: meno tempo perso su fatturazione/cantieri/burocrazia, numeri e margini sotto controllo.
- È un contatto B2B a freddo (legittimo interesse): resta rispettoso, nessuna pressione, nessuna urgenza finta.

Restituisci SOLO un oggetto JSON valido, senza testo attorno, con esattamente questi campi:
{"subject": "...", "body": "..."}
Nel body puoi usare la variabile {{first_name}} se il nome è noto; altrimenti apri con un saluto generico ("Ciao,").`;

interface LeadCtx {
  first_name?: string | null; last_name?: string | null; company_name?: string | null;
  city?: string | null; tags?: string[] | null; notes?: string | null;
  ai_intent_signals?: unknown; source?: string | null;
}

function buildUserPrompt(c: LeadCtx, opts: { angle?: string; tone?: string }): string {
  const signals = c.ai_intent_signals
    ? (typeof c.ai_intent_signals === "string" ? c.ai_intent_signals : JSON.stringify(c.ai_intent_signals)).slice(0, 400)
    : "";
  return [
    "Genera l'email per questo lead. Personalizza con ciò che è specifico; usa solo i dati presenti.",
    "",
    `Azienda: ${c.company_name || "—"}`,
    `Referente: ${[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}`,
    `Città: ${c.city || "—"}`,
    `Settore/Tag: ${(c.tags && c.tags.length ? c.tags.join(", ") : "—")}`,
    `Note raccolte: ${c.notes || "—"}`,
    signals ? `Segnali AI dallo scraping: ${signals}` : "",
    `Provenienza lead: ${c.source || "—"}`,
    "",
    `Angle richiesto: ${opts.angle?.trim() || "apertura generica al valore del gestionale per un'impresa edile"}`,
    `Tono: ${opts.tone?.trim() || "diretto e umano"}`,
  ].filter(Boolean).join("\n");
}

function parseEmail(content: string): { subject: string; body: string } {
  const cleaned = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const o = JSON.parse(cleaned);
    if (o && typeof o === "object") return { subject: String(o.subject ?? "").trim(), body: String(o.body ?? "").trim() };
  } catch { /* fallback sotto */ }
  // fallback: prima riga come oggetto, resto come corpo
  const lines = cleaned.split(/\r?\n/).filter(Boolean);
  return { subject: (lines[0] ?? "").replace(/^oggetto:\s*/i, "").slice(0, 120), body: lines.slice(1).join("\n").trim() || cleaned };
}

serveConMetriche("outreach-ai-email", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin: admin } = await requireAuth(req, corsH);
    await requireRole(admin, userId, ["super_admin"], corsH);

    const body = await req.json().catch(() => ({}));
    const angle = typeof body?.angle === "string" ? body.angle : "";
    const tone = typeof body?.tone === "string" ? body.tone : "";

    let lead: LeadCtx | null = (body?.contact && typeof body.contact === "object") ? body.contact : null;
    if (!lead && body?.contact_id) {
      const { data } = await admin
        .from("marketing_contacts")
        .select("first_name,last_name,company_name,city,tags,notes,ai_intent_signals,source")
        .eq("id", String(body.contact_id)).maybeSingle();
      lead = data as LeadCtx | null;
    }
    lead = lead ?? {};

    const result = await aiRouterComplete({
      supabase: admin,
      taskKey: "outreach_ai_email",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(lead, { angle, tone }) },
      ],
      params: { temperature: 0.8, max_tokens: 700 },
      responseFormat: { type: "json_object" },
      companyId: PLATFORM_COMPANY,
      userId,
      // Strumento interno di piattaforma: nessun gate carta / precheck credito
      // per-tenant (la "Platform Admin CRM" non ha metodo di pagamento). Il
      // costo OpenRouter è assorbito dalla piattaforma; resta il log d'uso e
      // una riga ledger status='skipped' per audit, attribuiti alla company.
      skipCharge: true,
    });

    if (result.chargeSkipped && result.prechargeReason) {
      return errorResponse(`AI non disponibile: ${result.prechargeReason}`, 402, corsH);
    }
    const { subject, body: emailBody } = parseEmail(result.content || "");
    if (!emailBody) return errorResponse("L'AI non ha prodotto un'email valida, riprova", 502, corsH);

    return jsonResponse({ subject, body: emailBody, model: result.modelUsed }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("outreach-ai-email error:", e);
    return errorResponse("Errore nella generazione dell'email", 500, corsH);
  }
});
