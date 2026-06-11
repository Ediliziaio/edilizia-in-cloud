/**
 * email-ai-l4-draft — MP-EMAIL-AI-02 · Livello 4 (Motore Bozze Risposte)
 *
 * On-demand: l'utente clicca "Rispondi con AI" su un thread → questa edge function
 * assembla il contesto (entità CRM + ultimi N messaggi thread + doc collegati),
 * sceglie la playbook per categoria e chiama claude-sonnet-4-5 con prompt cache
 * sul blocco statico (voce + regole + formato).
 *
 * RITORNA SOLO BOZZE EDITABILI. MAI INVIA AUTOMATICAMENTE. MAI INVENTA DATI.
 *
 * Output (MP-02 §7):
 *   {
 *     ok, email_id, categoria,
 *     oggetto: string,
 *     varianti: [{ etichetta: "Secca"|"Diplomatica"|"Operativa", corpo: string }],
 *     dati_mancanti: string[],   // es ["numero DDT", "data consegna"]
 *     no_reply?: boolean,        // true per newsletter/social/notifica/spam
 *     anthropic_usage, elapsed_ms, model
 *   }
 *
 * Endpoint POST: { email_id: uuid }
 * Auth: Bearer (utente loggato).
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { claudeMessages, hasClaudeProvider } from "../_shared/claudeProxy.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SONNET_MODEL = "claude-sonnet-4-5";

// Categorie che NON richiedono risposta → no chiamata Sonnet (scelta di costo MP-02 §6)
const NO_REPLY_CATEGORIE = new Set(["newsletter", "social", "notifica", "spam"]);

// ════════════════════════════════════════════════════════════════════════════
// BLOCCO STATICO (cache_control ephemeral) — voce + regole ferree + formato output
// ════════════════════════════════════════════════════════════════════════════

const BLOCCO_STATICO = `Sei l'assistente email di un'impresa edile italiana. Scrivi BOZZE di risposta che l'utente rivedrà e invierà MANUALMENTE.

VOCE (la voce operativa di Edilizia in Cloud):
- Diretta, imprenditore a imprenditore. Frasi corte. Vai al punto: cos'è successo, cosa serve, cosa fai tu.
- Lessico concreto del cantiere. Parole vere, niente paroloni.
- Professionale e rispettosa, MAI aggressiva o saccente. Diretto ≠ sgarbato.
- VIETATO usare: "con la presente", "in riferimento alla Vs.", "resto in attesa di un cortese riscontro", "porgo distinti saluti", "La contatto per".

REGOLE FERREE (anti-allucinazione):
- NON inventare MAI importi, date, numeri di documento, nomi, indirizzi. Usa SOLO i dati presenti nel CONTESTO.
- Se manca un dato necessario: metti un placeholder nel formato [DA VERIFICARE: descrizione] e aggiungi quella descrizione all'array dati_mancanti.
- Rispondi nella LINGUA dell'email originale (email in inglese → bozza in inglese).
- Rispecchia la formalità del mittente: commercialista/ente = un filo più formale; fornitore abituale = confidenziale.
- Lunghezza della bozza PARI O INFERIORE all'email ricevuta. Mai allungare per riempire.
- NON promettere sconti, tempi o impegni non presenti nel contesto.
- Firma con [Nome] (placeholder) se il nome di chi scrive non è nel contesto.

OUTPUT: restituisci SOLO un oggetto JSON valido, nessun testo intorno, nessun markdown:
{
  "oggetto": "Re: <oggetto coerente>",
  "varianti": [
    { "etichetta": "Secca", "corpo": "<bozza minima, operativa>" },
    { "etichetta": "Diplomatica", "corpo": "<bozza un filo più morbida>" }
  ],
  "dati_mancanti": ["<descrizione dato 1>", "..."]
}

Per email puramente operative (operaio, coordinamento interno) basta UNA variante "Operativa".
Le varianti devono differire nel TONO, non nei FATTI: stessi dati, registro diverso.`;

// ════════════════════════════════════════════════════════════════════════════
// LIBRERIA PLAYBOOK (MP-02 §6) — blocco variabile per categoria
// ════════════════════════════════════════════════════════════════════════════

const PLAYBOOKS: Record<string, string> = {
  cliente: `CATEGORIA: cliente
OBIETTIVO: Rassicurare, dare stato lavori/cantiere, confermare il prossimo passo.
STRUTTURA: Saluto breve → risposta diretta alla domanda → stato/azione → chiusura con prossimo passo.
DATI DA PESCARE DAL CONTESTO: cantiere collegato, scadenze, ultimo aggiornamento, eventuale preventivo accettato.`,

  fornitore: `CATEGORIA: fornitore
OBIETTIVO: Confermare o contestare DDT/ordine, chiedere date di consegna, chiarire discrepanze.
STRUTTURA: Riferimento al documento → punto concreto (conferma o problema) → richiesta secca → chiusura.
DATI DA PESCARE DAL CONTESTO: numero DDT/ordine, quantità ordinate vs consegnate, nome fornitore.`,

  preventivo: `CATEGORIA: preventivo
OBIETTIVO: Follow-up: confermare la richiesta, dare una data per il preventivo, sbloccare il dato mancante.
STRUTTURA: Conferma ricezione → cosa fai e quando → UNA domanda se serve un dato → chiusura.
DATI DA PESCARE DAL CONTESTO: tipo di lavoro richiesto, eventuale sopralluogo, preventivo in bozza collegato.`,

  fattura: `CATEGORIA: fattura
OBIETTIVO: Confermare ricezione/incasso o segnalare discrepanze sugli importi.
STRUTTURA: Riferimento alla fattura → conferma o segnalazione → eventuale azione → chiusura.
DATI DA PESCARE DAL CONTESTO: numero e data fattura, importo, stato pagamento.
NOTA: se l'email è un SOLLECITO di pagamento, usa la playbook sollecito sotto.`,

  sollecito: `CATEGORIA: sollecito/amministrazione urgente
OBIETTIVO: Recuperare un pagamento aperto con FERMEZZA, ma lasciando aperta la porta al confronto.
STRUTTURA: Riferimento alla fattura aperta → richiesta di data di pagamento → apertura ("se c'è un problema sull'importo, lo sistemiamo") → chiusura ferma.
DATI DA PESCARE DAL CONTESTO: fattura insoluta, importo, giorni di scaduto.`,

  operaio: `CATEGORIA: operaio
OBIETTIVO: Coordinamento operativo: turni, cantiere, materiali, presenze.
STRUTTURA: Risposta secca all'operativo → istruzione chiara → conferma richiesta.
DATI DA PESCARE DAL CONTESTO: cantiere assegnato, orari, comunicazioni precedenti.
NOTA: per questa categoria genera UNA SOLA variante "Operativa".`,

  opportunita: `CATEGORIA: opportunità
OBIETTIVO: Far avanzare un potenziale lavoro/cliente verso un sopralluogo o una call.
STRUTTURA: Interesse genuino → proposta concreta di prossimo passo con opzioni di data → chiusura.
DATI DA PESCARE DAL CONTESTO: fonte del contatto, tipo di lavoro, messaggio iniziale.`,

  supporto: `CATEGORIA: supporto
OBIETTIVO: Risolvere o instradare una richiesta di assistenza in modo chiaro.
STRUTTURA: Riconosci il problema → risposta passo-passo (max 3 step) → UNA sola domanda se manca un dato → chiusura.
DATI DA PESCARE DAL CONTESTO: thread del problema, eventuale ticket/pratica collegata.`,

  pratica: `CATEGORIA: pratica amministrativa
OBIETTIVO: Confermare ricezione comunicazione, indicare chi se ne occupa, elencare documenti se richiesti.
STRUTTURA: Conferma ricezione → azione/responsabile (commercialista, ufficio) → eventuale lista documenti con scadenza → chiusura.
DATI DA PESCARE DAL CONTESTO: ente (AdE/INPS/Comune), scadenza, documenti richiesti.`,

  altro: `CATEGORIA: altro
OBIETTIVO: Rispondere in modo utile e diretto al contenuto dell'email.
STRUTTURA: Saluto → risposta al punto → prossimo passo se applicabile → chiusura.
DATI DA PESCARE DAL CONTESTO: tutto ciò che è rilevante nel thread.`,
};

/** Determina la playbook: gestisce il caso fattura→sollecito via keyword. */
function selectPlaybook(categoria: string, subject: string, body: string): { key: string; text: string } {
  const cat = (categoria || "altro").toLowerCase();
  // Sollecito: fattura + linguaggio urgente
  if (cat === "fattura") {
    const t = `${subject} ${body}`.toLowerCase();
    if (/sollecito|insoluto|scaduto|mora|pagamento\s+(scaduto|aperto)|fattura\s+aperta/.test(t)) {
      return { key: "sollecito", text: PLAYBOOKS.sollecito };
    }
  }
  return { key: cat, text: PLAYBOOKS[cat] || PLAYBOOKS.altro };
}

// ════════════════════════════════════════════════════════════════════════════
// Handler
// ════════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, corsHeaders);

  if (!hasClaudeProvider()) return json({ error: "AI provider missing (OPENROUTER_API_KEY)" }, 500, corsHeaders);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const body = await req.json();
    const { email_id } = body as { email_id?: string };
    if (!email_id) return json({ error: "email_id required" }, 400, corsHeaders);

    // Auth utente (azione utente)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Auth required" }, 401, corsHeaders);
    const { data: userResp } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!userResp.user) return json({ error: "Invalid token" }, 401, corsHeaders);

    // Carica email
    const { data: email, error } = await supabase
      .from("email_inbox")
      .select(
        "id, company_id, from_email, from_name, to_email, subject, raw_text, raw_html, " +
          "thread_id, categoria, ai_category, entita_tipo, entita_id, received_at",
      )
      .eq("id", email_id)
      .single();

    if (error || !email) return json({ error: "Email not found" }, 404, corsHeaders);

    const categoria: string = (email.categoria as string) || (email.ai_category as string) || "altro";

    // ─── Categorie che non richiedono risposta → niente Sonnet ──────────────
    if (NO_REPLY_CATEGORIE.has(categoria.toLowerCase())) {
      return json({
        ok: true,
        email_id,
        categoria,
        no_reply: true,
        oggetto: null,
        varianti: [],
        dati_mancanti: [],
        message: `Categoria "${categoria}" non richiede risposta.`,
      }, 200, corsHeaders);
    }

    // ─── Contesto entità CRM ────────────────────────────────────────────────
    let entityContext = "";
    if (email.entita_id && email.entita_tipo) {
      entityContext = await loadEntityContext(supabase, email.entita_tipo as string, email.entita_id as string);
    }

    // ─── Documenti collegati (preventivo/fattura aperti via matched_order_id) ─
    let docsContext = "";
    if (email.entita_tipo === "fornitore" || categoria === "fattura" || categoria === "sollecito") {
      // best-effort: nessun documento se non rintracciabile
      docsContext = "";
    }

    // ─── Thread: ultimi 5 messaggi ──────────────────────────────────────────
    let threadContext = "";
    if (email.thread_id) {
      const { data: threadMessages } = await supabase
        .from("email_inbox")
        .select("from_email, from_name, subject, raw_text, received_at")
        .eq("thread_id", email.thread_id)
        .order("received_at", { ascending: false })
        .limit(5);
      if (threadMessages && threadMessages.length > 1) {
        threadContext = threadMessages.slice(1).reverse().map((m, i) =>
          `[${i + 1}] Da: ${m.from_name || m.from_email} (${m.received_at})\nOggetto: ${m.subject || "(no subject)"}\n${(m.raw_text || "").slice(0, 500)}`
        ).join("\n\n");
      }
    }

    const playbook = selectPlaybook(categoria, email.subject || "", email.raw_text || "");
    const emailBody = stripHtml(email.raw_text, email.raw_html).slice(0, 2000);

    // ─── BLOCCO VARIABILE ───────────────────────────────────────────────────
    const bloccoVariabile = `PLAYBOOK DA SEGUIRE:
${playbook.text}

ENTITÀ CRM: ${entityContext || "sconosciuto (nessun record CRM collegato — usa placeholder per nomi/dati specifici)"}
${docsContext ? `\nDOCUMENTI COLLEGATI: ${docsContext}` : "\nDOCUMENTI COLLEGATI: nessuno"}
${threadContext ? `\n═══ MESSAGGI PRECEDENTI DEL THREAD ═══\n${threadContext}` : ""}

═══ EMAIL A CUI RISPONDERE ═══
Da: ${email.from_name || email.from_email} <${email.from_email}>
Oggetto: ${email.subject || "(senza oggetto)"}
Ricevuta: ${email.received_at}

Corpo:
${emailBody}

ISTRUZIONE: scrivi la bozza seguendo la playbook "${playbook.key}". Output SOLO JSON come da formato.`;

    // ─── Chiamata Sonnet (statico cached + variabile) ───────────────────────
    const apiStart = Date.now();
    const response = await claudeMessages({
      model: SONNET_MODEL,
      max_tokens: 1500,
      system: [
        { type: "text", text: BLOCCO_STATICO, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: bloccoVariabile }],
      temperature: 0.4,
    });

    if (!response.ok) {
      const errText = await response.text();
      return json({ error: `Anthropic API error ${response.status}: ${errText}` }, 500, corsHeaders);
    }

    const data = await response.json();
    const elapsedMs = Date.now() - apiStart;
    const content = data.content?.[0]?.text || "{}";

    // ─── Parse JSON robusto ─────────────────────────────────────────────────
    let parsed: { oggetto?: string; varianti?: Array<{ etichetta: string; corpo: string }>; dati_mancanti?: string[] };
    try {
      const objMatch = content.match(/\{[\s\S]*\}/);
      parsed = objMatch ? JSON.parse(objMatch[0]) : {};
    } catch {
      // Fallback: tratta l'intero output come variante singola
      parsed = {
        oggetto: `Re: ${email.subject || ""}`,
        varianti: [{ etichetta: "Bozza", corpo: content }],
        dati_mancanti: [],
      };
    }

    // Sanitize + difese
    const oggetto = (parsed.oggetto || `Re: ${email.subject || ""}`).slice(0, 200);
    let varianti = Array.isArray(parsed.varianti) ? parsed.varianti.filter(v => v && v.corpo) : [];
    if (varianti.length === 0) {
      varianti = [{ etichetta: "Bozza", corpo: content.slice(0, 2000) }];
    }
    // cap a 2 varianti
    varianti = varianti.slice(0, 2).map(v => ({
      etichetta: String(v.etichetta || "Bozza").slice(0, 24),
      corpo: String(v.corpo || "").slice(0, 3000),
    }));
    const dati_mancanti = Array.isArray(parsed.dati_mancanti)
      ? parsed.dati_mancanti.map(String).slice(0, 12)
      : [];

    return json({
      ok: true,
      email_id,
      categoria,
      playbook_used: playbook.key,
      oggetto,
      varianti,
      dati_mancanti,
      no_reply: false,
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

function stripHtml(raw_text?: string | null, raw_html?: string | null): string {
  let body = (raw_text || "").trim();
  if (!body && raw_html) {
    body = raw_html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&[a-z]{2,8};/gi, " ").replace(/\s+/g, " ").trim();
  }
  return body;
}

async function loadEntityContext(supabase: any, tipo: string, id: string): Promise<string> {
  switch (tipo) {
    case "fornitore": {
      const { data } = await supabase
        .from("suppliers")
        .select("name, email, phone, product_category, address, city")
        .eq("id", id)
        .maybeSingle();
      if (!data) return "";
      return `Fornitore: ${data.name}\nCategoria prodotti: ${data.product_category || "n.d."}\nIndirizzo: ${data.address || "n.d."}, ${data.city || ""}\nTelefono: ${data.phone || "n.d."}`;
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
    case "cliente":
      // Tabella customers non esiste — nessun contesto CRM cliente disponibile.
      return "";
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
