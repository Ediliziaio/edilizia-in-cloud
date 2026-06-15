/**
 * ai-compose-message — genera un messaggio (SMS / WhatsApp / Email) per un
 * CONTATTO/CLIENTE esistente, a partire da un'istruzione libera + tono.
 * NON è cold outreach: il contatto ti conosce già.
 *
 * Body: { channel: "sms"|"whatsapp"|"email", instruction?, tone?, contact_name?,
 *         context?, company_id? }
 * Ritorna: email → {subject, body} · sms/whatsapp → {body}
 *
 * Riusa aiRouterComplete (routing modello + ledger costi + gate pagamento).
 */
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

Deno.serve(async (req) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsH });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsH);

  try {
    const { userId, supabaseAdmin: admin } = await requireAuth(req, corsH);
    const body = await req.json().catch(() => ({}));

    const channel: "sms" | "whatsapp" | "email" =
      ["sms", "whatsapp", "email"].includes(body?.channel) ? body.channel : "email";
    const instruction = typeof body?.instruction === "string" ? body.instruction.slice(0, 1000).trim() : "";
    const tone = typeof body?.tone === "string" && body.tone.trim() ? body.tone.slice(0, 60) : "professionale e cordiale";
    const contactName = typeof body?.contact_name === "string" ? body.contact_name.slice(0, 120).trim() : "";
    const context = typeof body?.context === "string" ? body.context.slice(0, 800).trim() : "";
    const companyId = typeof body?.company_id === "string" ? body.company_id : null;

    const channelRules =
      channel === "sms"
        ? "Scrivi UN SMS: max ~300 caratteri, 1-2 frasi, niente oggetto, niente link lunghi, al massimo 0-1 emoji."
        : channel === "whatsapp"
          ? "Scrivi UN messaggio WhatsApp: breve (2-4 frasi), diretto e amichevole, max 1 emoji se utile, niente oggetto."
          : "Scrivi UN'email: dai un oggetto (3-7 parole, concreto e non spam) + un corpo (3-8 frasi, paragrafi brevi). NON aggiungere la firma: la mette il sistema.";

    const system = `Sei l'assistente di scrittura di un'azienda italiana del settore edilizia/impiantistica che comunica con un PROPRIO contatto o cliente (relazione già esistente, NON cold outreach).
${channelRules}
Tono richiesto: ${tone}. Italiano naturale, chiaro, concreto e umano. Niente "Spettabile" né formule da circolare, niente piaggeria, niente claim o numeri inventati.
Rispondi ESCLUSIVAMENTE con JSON valido, senza testo extra:
${channel === "email" ? '{"subject":"...","body":"..."}' : '{"body":"..."}'}`;

    const user = [
      contactName ? `Destinatario: ${contactName}.` : "",
      context ? `Contesto (opportunità/cliente): ${context}.` : "",
      instruction ? `Obiettivo del messaggio: ${instruction}.` : "Scrivi un messaggio di follow-up cortese, utile e che inviti a un prossimo passo concreto.",
    ].filter(Boolean).join("\n");

    const result = await aiRouterComplete({
      supabase: admin,
      taskKey: "quick_compose_message",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      responseFormat: { type: "json_object" },
      companyId,
      userId,
      params: { temperature: 0.6, max_tokens: 700 },
    });

    let parsed: { subject?: string; body?: string } = {};
    try {
      parsed = JSON.parse(result.content);
    } catch {
      // fallback: il modello non ha rispettato il JSON → usa il testo grezzo come body
      parsed = { body: String(result.content || "").trim() };
    }

    const out =
      channel === "email"
        ? {
            subject: String(parsed.subject ?? "").slice(0, 200),
            body: String(parsed.body ?? "").slice(0, 5000),
          }
        : { body: String(parsed.body ?? "").slice(0, channel === "sms" ? 459 : 2000) };

    return jsonResponse({ ok: true, channel, ...out, model: result.modelUsed }, 200, corsH);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore generazione AI";
    console.error("[ai-compose-message]", msg);
    return errorResponse(msg, 500, corsH);
  }
});
