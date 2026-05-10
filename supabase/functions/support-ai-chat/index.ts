/**
 * support-ai-chat — AI Assistant per assistenza piattaforma EdiliziaInCloud
 *
 * Flow:
 *   1. L'azienda apre il dialog "Assistenza" e sceglie "Silvio Assistente AI"
 *   2. Chatta con l'AI che cerca di risolvere il problema usando la knowledge
 *      base della piattaforma (feature, FAQ, troubleshooting)
 *   3. Se l'AI non riesce o l'utente preferisce parlare con il team, chiede
 *      escalation → questo edge function inserisce un "ticket" formattato
 *      come support_message visibile al SuperAdmin
 *
 * Endpoint:
 *   POST /functions/v1/support-ai-chat
 *
 * Body:
 *   { action: "chat", conversation: [{ role: "user"|"assistant", content }] }
 *     → ritorna { reply, suggest_escalation, suggested_title?, suggested_priority? }
 *
 *   { action: "escalate", conversation: [...], titolo, priorita, descrizione }
 *     → crea support_message formattato come ticket, ritorna { ticket_id }
 *
 * Auth: richiede JWT azienda valida (verify_jwt=true).
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
// 🛡️ Anti chain-of-thought leak — coerente con altre edge AI-facing.
import { sanitizeAnswer } from "../_shared/structuredOutput.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatBody {
  action: "chat";
  conversation: Message[];
}

interface EscalateBody {
  action: "escalate";
  conversation: Message[];
  titolo: string;
  priorita: "bassa" | "normale" | "alta" | "urgente";
  descrizione: string;
}

type Body = ChatBody | EscalateBody;

const SUPPORT_AI_SYSTEM_PROMPT = `Sei "Silvio Assistente Supporto", l'AI di assistenza ufficiale di EdiliziaInCloud (EiC).
Aiuti gli imprenditori edili che usano la piattaforma EiC a risolvere problemi d'uso, dubbi su funzionalità, configurazioni.

# CONTESTO PIATTAFORMA EiC
EiC è il gestionale cloud per imprese edili italiane con questi moduli principali:
- **Cantieri & Lavori**: commesse, magazzino, clienti, subappaltatori, firma elettronica, manutenzione, calendario, sicurezza
- **Marketing & Vendita**: preventivi, CRM, WhatsApp/email/SMS marketing, automazioni, lead form
- **Finanza**: fatturazione elettronica SDI, prima nota, tesoreria, scadenzario, conserva digitale, finanziamenti
- **Persone**: HR, presenze GPS, cedolini, ferie/permessi
- **AI & Automazioni**: Silvio AI assistant interno, OCR fatture/DDT, computo metrico AI, render AI infissi/bagni/pavimenti
- **Mobile**: app cantiere iOS/Android per operai

# TUO RUOLO
1. **Capisci il problema**: chiedi 1-2 chiarimenti se serve (modulo, schermata, errore visto)
2. **Prova a risolvere**: guida step-by-step se è un problema noto. Esempi:
   - Fatturazione SDI rifiutata → controllare partita IVA cliente, codice destinatario
   - OCR fattura sbagliato → verificare PDF qualità, retry "Estrai di nuovo"
   - Preventivo non genera PDF → controllare template attivo, browser PDF blocker
   - WhatsApp non invia → token Meta scaduto, riautorizzare in Integrazioni
   - Rendering app mobile lenta → svuotare cache, accendere "modalità leggera" in profilo
3. **Sii sintetico**: imprenditori edili sono in cantiere, vogliono soluzione veloce
4. **Italiano colloquiale**: "tu" o "lei" coerente con come l'utente scrive

# COSA NON FARE (CRITICO)
❌ NON inventare procedure che non conosci → meglio escalation
❌ NON nominare tool/RPC/edge functions interni
❌ NON dire "Ho i dati dai tool" o frasi di narrazione interna
❌ NON dare risposte generiche tipo "controlla la documentazione"

# QUANDO ESCALARE AL TEAM
Suggerisci escalation (senza forzare) se:
- Bug evidente (errore "500", "401" persistente, pagina bianca, dati sparsi)
- Problema fiscale specifico (compilazione XML SDI custom, ritenute strane)
- Richiesta nuova feature
- L'utente ha già provato la tua soluzione e non funziona
- Domanda fuori scope (es. consulenza commercialista)

Per suggerire escalation di' chiaro: "Posso aprirti un ticket al supporto? Il team risponde in 24h."

# FORMATO RISPOSTA
- Markdown leggero (bold, liste con -)
- Max 200 parole per turno
- Se step-by-step: numerali (1. 2. 3.)
- Se serve link interno: usa formato \`/azienda/...\` (es. /azienda/integrazioni)
`;

async function handleChat(conversation: Message[]): Promise<{
  reply: string;
  suggest_escalation: boolean;
  suggested_title?: string;
  suggested_priority?: "bassa" | "normale" | "alta" | "urgente";
}> {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Costruisci messaggi: system + conversation history
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    { role: "system", content: SUPPORT_AI_SYSTEM_PROMPT },
    ...conversation.map((m) => ({ role: m.role, content: m.content })),
  ];

  let aiContent = "";
  try {
    const result = await aiRouterComplete({
      supabase,
      taskKey: "support_ai_chat",
      messages,
      params: { temperature: 0.4, max_tokens: 600 },
      personaKey: "silvio_support",
      estimatedCostEur: 0.005,
    });
    aiContent = result.content ?? "";
  } catch (e) {
    console.error("[support-ai-chat] aiRouterComplete fallito:", e instanceof Error ? e.message : e);
    aiContent =
      "Mi dispiace, in questo momento ho un problema tecnico. Vuoi aprire un ticket diretto al supporto? Risposta entro 24h.";
  }

  // 🛡️ Sanitize anti chain-of-thought leak (coerente con altre AI edge fn).
  const sanitized = sanitizeAnswer(aiContent);
  const cleanReply = sanitized.isFullyChainOfThought
    ? "Mi sembra una richiesta complessa. Posso aprirti un ticket al supporto? Il team risponde in 24h."
    : (sanitized.cleaned || aiContent);

  // Heuristica: l'AI suggerisce escalation se la sua risposta contiene marker
  const lower = cleanReply.toLowerCase();
  const escalationMarkers = [
    "aprirti un ticket",
    "aprire un ticket",
    "ticket al supporto",
    "team risponde",
    "team del supporto",
    "supporto può",
    "supporto potrebbe",
  ];
  const suggestEscalation = escalationMarkers.some((m) => lower.includes(m));

  // Suggerisci titolo basato sull'ultimo messaggio utente
  const lastUserMsg = [...conversation].reverse().find((m) => m.role === "user")?.content ?? "";
  const suggestedTitle = lastUserMsg.length > 80
    ? lastUserMsg.slice(0, 77) + "..."
    : (lastUserMsg || "Richiesta supporto");

  // Suggerisci priorità basata su keyword
  const urgentKeywords = ["urgent", "bloccat", "non funziona", "errore 500", "perso dati", "non riesc"];
  const highKeywords = ["importante", "subito", "oggi", "domani", "scadenz"];
  let suggestedPriority: "bassa" | "normale" | "alta" | "urgente" = "normale";
  const lastUserLower = lastUserMsg.toLowerCase();
  if (urgentKeywords.some((k) => lastUserLower.includes(k))) suggestedPriority = "urgente";
  else if (highKeywords.some((k) => lastUserLower.includes(k))) suggestedPriority = "alta";

  return {
    reply: cleanReply,
    suggest_escalation: suggestEscalation,
    suggested_title: suggestedTitle,
    suggested_priority: suggestedPriority,
  };
}

async function handleEscalate(
  body: EscalateBody,
  userId: string,
  companyId: string,
  userName: string,
): Promise<{ ticket_id: string }> {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Genera shortId per il "ticket"
  const shortId = crypto.randomUUID().slice(0, 8).toUpperCase();

  // Costruisci il messaggio formattato come ticket
  const priorityEmoji = {
    bassa: "🟢",
    normale: "🟡",
    alta: "🟠",
    urgente: "🔴",
  }[body.priorita] ?? "🟡";

  const conversationMd = body.conversation.length > 0
    ? body.conversation
        .map((m) => `**${m.role === "user" ? userName : "🤖 Silvio Assistente"}**: ${m.content}`)
        .join("\n\n")
    : "_Nessuna conversazione precedente._";

  const formattedMessage = `## 🎫 Ticket #${shortId} — ${body.titolo}

${priorityEmoji} **Priorità**: ${body.priorita.toUpperCase()}
**Aperto da**: ${userName}
**Data**: ${new Date().toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}

### 📝 Descrizione
${body.descrizione}

### 🤖 Conversazione con Silvio Assistente (per contesto)
${conversationMd}

---
_Ticket aperto via AI Assistant. Rispondi qui per gestirlo._`;

  // Insert in support_messages con sender_role='company'
  const { data, error } = await supabase
    .from("support_messages")
    .insert({
      company_id: companyId,
      sender_id: userId,
      sender_role: "company",
      message: formattedMessage,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[support-ai-chat] insert ticket fallito:", error);
    throw new Error("Impossibile aprire il ticket. Riprova o usa la chat diretta.");
  }

  console.log(JSON.stringify({
    level: "info", fn: "support-ai-chat", action: "escalate",
    ticket_short_id: shortId, support_message_id: data.id,
    company_id: companyId, user_id: userId,
    priorita: body.priorita,
  }));

  return { ticket_id: shortId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Auth: estrai user dal JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

  // Carica profile per company_id + nome
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: profile } = await adminClient
    .from("profiles")
    .select("company_id, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.company_id) {
    return new Response(JSON.stringify({ error: "company_not_found" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const companyId = profile.company_id;
  const userName = profile.full_name || userData.user.email || "Utente";

  // Parse body
  let body: Body;
  try {
    body = await req.json() as Body;
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    if (body.action === "chat") {
      if (!Array.isArray(body.conversation) || body.conversation.length === 0) {
        return new Response(JSON.stringify({ error: "conversation_required" }), {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const result = await handleChat(body.conversation);
      return new Response(JSON.stringify(result), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (body.action === "escalate") {
      if (!body.titolo?.trim() || !body.descrizione?.trim()) {
        return new Response(JSON.stringify({ error: "titolo_descrizione_required" }), {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const validPriorities = ["bassa", "normale", "alta", "urgente"];
      if (!validPriorities.includes(body.priorita)) {
        return new Response(JSON.stringify({ error: "priorita_invalid" }), {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const result = await handleEscalate(body, userId, companyId, userName);
      return new Response(JSON.stringify(result), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown_action" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[support-ai-chat] uncaught:", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
