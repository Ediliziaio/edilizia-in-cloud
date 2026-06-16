import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

/**
 * outreach-ai-reply — il SUPER_ADMIN genera una BOZZA di risposta a un prospect
 * dentro l'inbox dell'Outreach Engine. Ricostruisce il thread (email inviate da
 * noi + risposte in arrivo, in ordine cronologico) e chiede all'AI una risposta
 * breve, umana, in italiano, che risponda davvero all'ultimo messaggio del
 * prospect e spinga gentilmente verso il prossimo passo (call/risposta).
 *
 * Strumento interno di piattaforma: usa aiRouterComplete con skipCharge:true
 * (la "Platform Admin CRM" non ha metodo di pagamento → il gate carta darebbe
 * 500). Stesso pattern di outreach-ai-email.
 *
 * Body (due modalità):
 *   A) { contact_id } → ricostruisce il thread server-side per contact_id.
 *   B) { messages } → conversazione SENZA contatto collegato: il client passa
 *      il thread già pronto (come outreach-ai-summary). Ogni voce:
 *      { direction: 'out'|'in', subject, body, intent }.
 *
 * Colonne reali (migrazioni 20270815000000 / 20270816000000):
 *   marketing_contacts:  first_name, last_name, company_name, email, tags, notes
 *   outreach_send_queue: subject, body, sent_at (status='sent', per contact_id)
 *   outreach_replies:    from_email, subject, snippet, intent, received_at
 */

const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";

const SYSTEM_PROMPT = `Sei un assistente vendite B2B in italiano per "Edilizia in Cloud", il gestionale cloud per imprese edili (fatturazione elettronica, gestione cantieri, DDT, preventivi, controllo costi e margini).

Scrivi una RISPOSTA a un prospect dentro una conversazione email a freddo già avviata. Il tuo compito è rispondere all'ULTIMO messaggio del prospect e far avanzare la trattativa verso un prossimo passo concreto (di solito una breve call).

REGOLE FERREE:
- Italiano, tono professionale ma umano e diretto. Niente "Spettabile" né formule da circolare; niente piaggeria, niente saluti formali eccessivi.
- Brevissima: 40-80 parole. Rispondi prima al punto sollevato dal prospect (domanda, obiezione, richiesta), poi proponi il passo successivo.
- UNA sola call-to-action soft, una domanda che invita a rispondere (es. "ha senso sentirci 10 minuti questa settimana?"). Niente link, niente allegati.
- Adatta il tono all'intento dell'ultima risposta: se è interessato spingi sulla call; se ha una domanda rispondi con concretezza; se è freddo/non interessato resta rispettoso e lascia la porta aperta senza insistere.
- Non inventare MAI dati, numeri, prezzi o fatti non presenti nel thread. Niente claim esagerati o percentuali inventate.
- Niente emoji. Niente markdown. Niente grassetti. Niente oggetto: scrivi SOLO il corpo della risposta.
- Niente firma finale (la aggiunge il sistema): chiudi con la CTA.
- Puoi aprire con un saluto breve ("Ciao {{first_name}}," se il nome è noto, altrimenti "Ciao,").

Restituisci SOLO il testo della risposta, senza virgolette, senza preamboli, senza spiegazioni.`;

interface ContactCtx {
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  email?: string | null;
  tags?: string[] | null;
  notes?: string | null;
}

interface SentMsg { subject: string | null; body: string | null; sent_at: string | null }
interface ReplyMsg {
  from_email: string | null; subject: string | null; snippet: string | null;
  intent: string | null; received_at: string | null;
}

/** Rimuove tag HTML dalle email inviate (corpo HTML nostro) per il prompt. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Ricostruisce il thread in ordine cronologico (più vecchio → più recente). */
function buildThread(sent: SentMsg[], replies: ReplyMsg[]): { text: string; lastIntent: string | null } {
  type Line = { at: number; who: "Noi" | "Prospect"; subject: string | null; text: string; intent: string | null };
  const lines: Line[] = [];
  for (const s of sent) {
    lines.push({
      at: s.sent_at ? new Date(s.sent_at).getTime() : 0,
      who: "Noi",
      subject: s.subject,
      text: s.body ? stripHtml(s.body) : "",
      intent: null,
    });
  }
  for (const r of replies) {
    lines.push({
      at: r.received_at ? new Date(r.received_at).getTime() : 0,
      who: "Prospect",
      subject: r.subject,
      text: (r.snippet ?? "").trim(),
      intent: r.intent,
    });
  }
  lines.sort((a, b) => a.at - b.at);
  const lastReply = [...lines].reverse().find((l) => l.who === "Prospect");
  const text = lines
    .map((l) => {
      const subj = l.subject ? ` (oggetto: ${l.subject})` : "";
      return `${l.who}${subj}:\n${l.text || "—"}`;
    })
    .join("\n\n---\n\n");
  return { text, lastIntent: lastReply?.intent ?? null };
}

/**
 * Ricostruisce il thread da messaggi già pronti passati dal client (modalità B,
 * conversazioni senza contatto collegato). Mappa direction→chi e linearizza il
 * corpo (le inviate sono HTML nostro, le risposte testo grezzo).
 */
interface ClientMsg { direction?: string | null; subject?: string | null; body?: string | null; intent?: string | null }
function buildThreadFromClient(messages: ClientMsg[]): { text: string; lastIntent: string | null } {
  type Line = { who: "Noi" | "Prospect"; subject: string | null; text: string; intent: string | null };
  const lines: Line[] = messages.map((m) => {
    const out = m.direction === "out";
    return {
      who: out ? "Noi" : "Prospect",
      subject: m.subject ?? null,
      text: m.body ? stripHtml(m.body) : "",
      intent: out ? null : (m.intent ?? null),
    };
  });
  const lastReply = [...lines].reverse().find((l) => l.who === "Prospect");
  const text = lines
    .map((l) => {
      const subj = l.subject ? ` (oggetto: ${l.subject})` : "";
      return `${l.who}${subj}:\n${l.text || "—"}`;
    })
    .join("\n\n---\n\n");
  return { text, lastIntent: lastReply?.intent ?? null };
}

function buildUserPrompt(c: ContactCtx, thread: { text: string; lastIntent: string | null }): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
  return [
    "Ecco la conversazione finora con il prospect, in ordine cronologico (la più recente in fondo).",
    "Scrivi la prossima risposta da inviare al prospect, rispondendo all'ultimo suo messaggio.",
    "",
    `Referente: ${name || "—"}`,
    `Azienda: ${c.company_name || "—"}`,
    `Settore/Tag: ${(c.tags && c.tags.length ? c.tags.join(", ") : "—")}`,
    c.notes ? `Note sul contatto: ${c.notes}` : "",
    thread.lastIntent ? `Intento rilevato sull'ultima risposta del prospect: ${thread.lastIntent}` : "",
    "",
    "=== CONVERSAZIONE ===",
    thread.text || "(nessun messaggio precedente)",
    "=== FINE CONVERSAZIONE ===",
  ].filter(Boolean).join("\n");
}

/** Pulisce la bozza: toglie eventuali virgolette/fence che il modello aggiunge. */
function cleanDraft(content: string): string {
  let t = content.trim();
  t = t.replace(/^```(?:\w+)?/i, "").replace(/```$/, "").trim();
  // toglie virgolette di apertura/chiusura che racchiudono l'intero testo
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("«") && t.endsWith("»"))) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin: admin } = await requireAuth(req, corsH);
    await requireRole(admin, userId, ["super_admin"], corsH);

    const body = await req.json().catch(() => ({}));
    const contactId = body?.contact_id ? String(body.contact_id) : "";
    const clientMessages = Array.isArray(body?.messages) ? (body.messages as ClientMsg[]) : null;
    if (!contactId && !clientMessages) {
      return errorResponse("contact_id o messages mancanti", 400, corsH);
    }

    let contact: ContactCtx;
    let thread: { text: string; lastIntent: string | null };

    if (contactId) {
      // Modalità A: contatto collegato → thread ricostruito server-side.
      const { data: c } = await admin
        .from("marketing_contacts")
        .select("first_name,last_name,company_name,email,tags,notes")
        .eq("id", contactId)
        .maybeSingle();
      if (!c) return errorResponse("Contatto non trovato", 404, corsH);
      contact = c as ContactCtx;

      const [{ data: sentRows }, { data: replyRows }] = await Promise.all([
        admin
          .from("outreach_send_queue")
          .select("subject,body,sent_at")
          .eq("contact_id", contactId)
          .eq("status", "sent")
          .order("sent_at", { ascending: false })
          .limit(5),
        admin
          .from("outreach_replies")
          .select("from_email,subject,snippet,intent,received_at")
          .eq("contact_id", contactId)
          .order("received_at", { ascending: false })
          .limit(5),
      ]);
      thread = buildThread(
        (sentRows ?? []) as SentMsg[],
        (replyRows ?? []) as ReplyMsg[],
      );
    } else {
      // Modalità B: conversazione sciolta → thread dal client, nessun contatto noto.
      contact = {};
      thread = buildThreadFromClient(clientMessages ?? []);
    }

    const result = await aiRouterComplete({
      supabase: admin,
      taskKey: "outreach_ai_reply",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(contact, thread) },
      ],
      params: { temperature: 0.7, max_tokens: 500 },
      companyId: PLATFORM_COMPANY,
      userId,
      // Strumento interno di piattaforma: nessun gate carta / precheck credito
      // per-tenant (la "Platform Admin CRM" non ha metodo di pagamento). Vedi
      // outreach-ai-email per il razionale completo.
      skipCharge: true,
    });

    if (result.chargeSkipped && result.prechargeReason) {
      return errorResponse(`AI non disponibile: ${result.prechargeReason}`, 402, corsH);
    }
    const draft = cleanDraft(result.content || "");
    if (!draft) return errorResponse("L'AI non ha prodotto una bozza valida, riprova", 502, corsH);

    return jsonResponse({ draft, model: result.modelUsed }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("outreach-ai-reply error:", e);
    return errorResponse("Errore nella generazione della bozza", 500, corsH);
  }
});
