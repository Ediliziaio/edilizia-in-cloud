/**
 * email-ai-l4-draft — MP-EMAIL-AI-01 · Livello 4 (Bozze risposta Sonnet on-demand)
 *
 * On-demand: l'utente clicca "Rispondi con AI" su una email → questa edge function
 * assembla il contesto (entità CRM + ultimi N messaggi thread + doc collegati) e
 * chiama claude-sonnet-4-6 con prompt cache su brand voice + few-shot.
 *
 * RITORNA SOLO BOZZE EDITABILI. MAI INVIA AUTOMATICAMENTE.
 *
 * Endpoint POST:
 *   { email_id: uuid, mode?: "draft" | "summary_only" }
 *
 * Output:
 *   {
 *     draft_subject: string,
 *     draft_body: string,
 *     playbook_used: string,
 *     entity_context_used: boolean,
 *     anthropic_usage: { ... }
 *   }
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import type { EmailCategoria } from "../_shared/email-ai-cascade.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const SONNET_MODEL = "claude-sonnet-4-5";

// ════════════════════════════════════════════════════════════════════════════
// Brand voice (cacheable)
// ════════════════════════════════════════════════════════════════════════════

const BRAND_VOICE_SYSTEM = `Sei l'assistente che scrive BOZZE di email di risposta per un'impresa edile italiana.

═══ BRAND VOICE ═══

Stile: diretto, imprenditore-a-imprenditore. Italiano operativo, niente fronzoli.
Tono: confidenziale ma professionale. Mai aziendalese da grande azienda.
Vocabolario: edile reale (cantiere, sopralluogo, DDT, fattura, scadenza, materiale, posa, getto).
Lunghezza: 2-5 frasi. Mai più di 80 parole.
Mai usare: "cordialmente", "in attesa di un Vs. gradito riscontro", "non esiti a contattarci", emoji.
Sempre usare: "Buongiorno [nome]" se nome noto, altrimenti "Buongiorno". Chiusura: "Grazie" o "A presto".

═══ PLAYBOOK PER CATEGORIA ═══

fornitore:
  - Conferma/contesta DDT o ordine in modo SECCO
  - Chiedi data consegna precisa (giorno + finestra orario)
  - Se contestazione: stato + numero DDT + quantità errata

preventivo:
  - Riepiloga in 1 frase cosa l'utente ha capito della richiesta
  - Proponi prossimo passo concreto (sopralluogo, invio capitolato, telefonata)
  - Indica scadenza realistica (es. "ti mando un preventivo entro venerdì")

cliente:
  - Rassicura senza essere paternalistico
  - Stato lavori onesto (avanti / rallentato / fermo per X)
  - Conferma appuntamento o riproponi data
  - Se problema noto: assumiti responsabilità, indica timeline soluzione

fattura:
  - Conferma ricezione/incasso con DATA e IMPORTO esatti
  - Se discrepanza importi: scrivi i 2 numeri e proponi soluzione (nota credito, storno)

sollecito (in fattura):
  - Tono fermo ma professionale, mai aggressivo
  - Proponi piano di pagamento concreto (importo + scadenze)
  - Se è errore: spiega l'errore, scusati brevemente

supporto:
  - Risposta passo-passo (max 3 step)
  - UNA sola domanda se manca un dato critico
  - Se workaround disponibile: indicalo subito

operaio (HR):
  - Risposta empatica ma chiara
  - Date precise (inizio/fine ferie, visita medica, etc)
  - Se richiede modulo: dì dove trovarlo

opportunita:
  - Caloroso ma non aggressivo
  - Chiedi: tipologia lavoro, indirizzo cantiere, tempistica
  - Proponi sopralluogo gratuito con 2-3 date

pratica:
  - Conferma ricezione comunicazione
  - Se richiesta documenti: elencali con scadenza
  - Se è AdE/INPS: indica chi se ne occupa (commercialista, ufficio interno)

═══ FORMATO OUTPUT ═══

DEVI ritornare SOLO un oggetto JSON, niente testo aggiuntivo:

{
  "subject": "<oggetto della risposta — se è Re:, mantieni il prefisso>",
  "body": "<corpo della bozza, formattato con \\n per a-capo>"
}`;

// ════════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  if (!ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY missing" }, 500, corsHeaders);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const body = await req.json();
    const { email_id } = body as { email_id?: string };
    if (!email_id) return json({ error: "email_id required" }, 400, corsHeaders);

    // Verifica auth utente (è una azione utente)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Auth required" }, 401, corsHeaders);
    const { data: userResp } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!userResp.user) return json({ error: "Invalid token" }, 401, corsHeaders);

    // ─── Carica email ──────────────────────────────────────────────────────
    const { data: email, error } = await supabase
      .from("email_inbox")
      .select(
        "id, company_id, from_email, from_name, to_email, subject, raw_text, raw_html, " +
          "thread_id, categoria, ai_category, entita_tipo, entita_id, received_at",
      )
      .eq("id", email_id)
      .single();

    if (error || !email) return json({ error: "Email not found" }, 404, corsHeaders);

    // ─── Determina categoria (nuova → fallback legacy) ─────────────────────
    const categoria: EmailCategoria | string =
      (email.categoria as string) || (email.ai_category as string) || "altro";

    // ─── Carica contesto entità CRM ────────────────────────────────────────
    let entityContext = "";
    if (email.entita_id && email.entita_tipo) {
      entityContext = await loadEntityContext(supabase, email.entita_tipo as string, email.entita_id as string);
    }

    // ─── Carica ultimi N messaggi del thread (max 5) ───────────────────────
    let threadContext = "";
    if (email.thread_id) {
      const { data: threadMessages } = await supabase
        .from("email_inbox")
        .select("from_email, from_name, subject, raw_text, received_at")
        .eq("thread_id", email.thread_id)
        .order("received_at", { ascending: false })
        .limit(5);
      if (threadMessages && threadMessages.length > 1) {
        threadContext = "═══ MESSAGGI PRECEDENTI DEL THREAD ═══\n" +
          threadMessages.slice(1).reverse().map((m, i) =>
            `[${i + 1}] Da: ${m.from_name || m.from_email} — ${m.received_at}\nOggetto: ${m.subject || "(no subject)"}\n${(m.raw_text || "").slice(0, 600)}`
          ).join("\n\n");
      }
    }

    // ─── User message ──────────────────────────────────────────────────────
    const userPayload = `═══ EMAIL DA RISPONDERE ═══

Categoria: ${categoria}
Da: ${email.from_name || email.from_email} <${email.from_email}>
A: ${email.to_email}
Oggetto: ${email.subject || "(no subject)"}
Ricevuta: ${email.received_at}

Corpo:
${(email.raw_text || "").slice(0, 2000)}

${entityContext ? `\n═══ CONTESTO ENTITÀ CRM ═══\n${entityContext}\n` : ""}
${threadContext ? `\n${threadContext}\n` : ""}

═══ ISTRUZIONE ═══
Scrivi una bozza di risposta seguendo la playbook per la categoria "${categoria}".
Output: SOLO JSON {"subject": "...", "body": "..."}.`;

    // ─── Chiamata Sonnet ───────────────────────────────────────────────────
    const apiStart = Date.now();
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: SONNET_MODEL,
        max_tokens: 1024,
        system: [
          {
            type: "text",
            text: BRAND_VOICE_SYSTEM,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userPayload }],
        temperature: 0.4, // un po' di varietà
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return json({ error: `Anthropic API error ${response.status}: ${errText}` }, 500, corsHeaders);
    }

    const data = await response.json();
    const elapsedMs = Date.now() - apiStart;
    const content = data.content?.[0]?.text || "{}";

    // Parse JSON
    let parsed: { subject?: string; body?: string };
    try {
      const objMatch = content.match(/\{[\s\S]*\}/);
      parsed = objMatch ? JSON.parse(objMatch[0]) : {};
    } catch {
      parsed = { subject: `Re: ${email.subject || ""}`, body: content };
    }

    const subject = parsed.subject || `Re: ${email.subject || ""}`;
    const draftBody = parsed.body || "";

    return json({
      ok: true,
      email_id,
      categoria,
      draft_subject: subject,
      draft_body: draftBody,
      playbook_used: categoria,
      entity_context_used: !!entityContext,
      thread_context_used: !!threadContext,
      anthropic_usage: data.usage,
      elapsed_ms: elapsedMs,
      model: SONNET_MODEL,
    }, 200, corsHeaders);
  } catch (e) {
    console.error("[email-ai-l4-draft] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500, corsHeaders);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadEntityContext(supabase: any, tipo: string, id: string): Promise<string> {
  switch (tipo) {
    case "fornitore": {
      const { data } = await supabase
        .from("suppliers")
        .select("name, email, phone, product_category, address, city")
        .eq("id", id)
        .maybeSingle();
      if (!data) return "";
      return `Fornitore: ${data.name}\nCategoria: ${data.product_category || "n.d."}\nIndirizzo: ${data.address || "n.d."}, ${data.city || ""}\nTelefono: ${data.phone || "n.d."}`;
    }
    case "operaio": {
      const { data } = await supabase
        .from("employees")
        .select("first_name, last_name, email, phone, area, ccnl_applicato")
        .eq("id", id)
        .maybeSingle();
      if (!data) return "";
      const name = [data.first_name, data.last_name].filter(Boolean).join(" ");
      return `Operaio: ${name}\nArea: ${data.area || "n.d."}\nCCNL: ${data.ccnl_applicato || "n.d."}`;
    }
    case "cliente": {
      // Tabella customers non esiste — nessun contesto CRM disponibile per ora.
      return "";
    }
    default:
      return "";
  }
}

function json(payload: any, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
