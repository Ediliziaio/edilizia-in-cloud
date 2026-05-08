/**
 * silvio-admin-chat — Edge function della chat di Silvio Superadmin (co-founder AI).
 *
 * Differenze vs `silvio-chat` (assistente cliente):
 *   - Auth: SOLO super_admin (verificato via user_roles)
 *   - Scope: cross-tenant (può leggere TUTTI i company_id, non solo il proprio)
 *   - Sender ID: SILVIO_ADMIN_SENDER_ID (00000000-...-000003)
 *   - Tools: Revenue/Lead/Usage/Support/Product/Ops (Step 5+, qui base senza tool)
 *   - Persistenza: anche in silvio_admin_messages oltre a internal_chat_messages
 *
 * Body: { channel_id: uuid, message: string, model?: string }
 *
 * Flusso:
 *   1. Auth check (super_admin)
 *   2. Verifica canale = silvio-admin nella platform_admin_company
 *   3. Carica history (ultimi 20 messaggi del canale)
 *   4. Costruisce system prompt + history per AI
 *   5. Invoca aiRouterComplete (task_key='silvio_admin_chat', default Claude Sonnet 4.5)
 *   6. Inserisce risposta nel canale come SILVIO_ADMIN_SENDER_ID
 *   7. Persiste anche in silvio_admin_messages per audit
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SILVIO_ADMIN_SENDER_ID = "00000000-0000-0000-0000-000000000003";
const PLATFORM_ADMIN_COMPANY = "00000000-0000-0000-0000-000000000001";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChatMessage {
  id: string;
  sender_id: string;
  content: string | null;
  created_at: string;
}

const SYSTEM_PROMPT_BASE = `Sei Silvio, il co-founder AI di Florin Andriciuc — fondatore di Edilizia in Cloud, gestionale cloud per imprese edili italiane.

NON sei l'assistente che parla con i clienti: tu parli SOLO con Florin (e team super_admin).
Sei dentro l'area /admin del sistema. Hai accesso cross-tenant a tutto: revenue, clienti, lead, ticket, errori, contabilità interna.

PERSONALITÀ:
- Diretto, founder-to-founder, vocabolario operativo (no "ehm", "forse", "mi dispiace molto")
- Proattivo: se vedi un problema, lo dici PRIMA che venga chiesto
- Numerico: ogni risposta importante ha numeri, non aggettivi
- Italiano corretto, registro professionale ma confidenziale (Florin → tu)
- Quando suggerisci un'azione, dai SEMPRE 1 prossimo passo concreto, non un papiro

REGOLE DURE:
- Non agire mai su decisioni che spostano denaro o cancellano dati senza conferma esplicita
- Se ti viene chiesto qualcosa che riguarda dati cliente, ricorda sempre il GDPR
- Se non sei sicuro di un dato, dillo. Mai inventare numeri
- Quando usi un tool, dichiaralo: "Sto leggendo la tabella X..."

CONTEXT MOMENT (sprint corrente):
- Versione: V1 base — chat senza tools (i tools arrivano nello Step 5)
- Stack: React/TS/Vite + Supabase + OpenRouter
- Founder: Florin Andriciuc — preferisce risposte brevi, dirette, con numeri

LIMITAZIONI ATTUALI (V1 base):
- Non hai ancora tool-use attivo: quando ti chiedono "quanto è il MRR?" rispondi che gli strumenti
  sono in costruzione e indicagli che li avrai disponibili nel prossimo sprint (Step 5).
- Per ora puoi: ascoltare, ragionare, suggerire, ma NON puoi leggere il DB autonomamente.
- Quando qualcosa richiede un tool, dillo onestamente.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    // 1. AUTH
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const userRes = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = userRes.data?.user?.id;
    if (!userId) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      return jsonRes({ error: "Permesso negato: solo super_admin" }, 403);
    }

    // 2. BODY
    const body = await req.json().catch(() => ({}));
    const channelId: string | undefined = body.channel_id;
    const message: string | undefined = body.message;
    const forceModel: string | undefined = body.model;

    if (!channelId || !message?.trim()) {
      return jsonRes({ error: "channel_id e message obbligatori" }, 400);
    }

    // 3. Verifica canale = silvio-admin
    const { data: channel } = await supabase
      .from("internal_chat_channels")
      .select("id, name, company_id")
      .eq("id", channelId)
      .maybeSingle();

    if (!channel) {
      return jsonRes({ error: "Canale non trovato" }, 404);
    }
    if (channel.name !== "silvio-admin") {
      return jsonRes(
        { error: "Edge function dedicata al canale silvio-admin" },
        400
      );
    }

    // 4. Carica history (ultimi 20 messaggi)
    const { data: history } = await supabase
      .from("internal_chat_messages")
      .select("id, sender_id, content, created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(20);

    const historyAsc = (history ?? []).reverse() as ChatMessage[];

    // 5. Costruisci messages per AI (system + history + user)
    const aiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT_BASE },
    ];

    // History: utente=user, Silvio Admin=assistant, altri=user (con prefix nome)
    for (const m of historyAsc) {
      if (!m.content?.trim()) continue;
      if (m.sender_id === SILVIO_ADMIN_SENDER_ID) {
        aiMessages.push({ role: "assistant", content: m.content });
      } else if (m.sender_id === userId) {
        aiMessages.push({ role: "user", content: m.content });
      } else {
        // Membro di team che ha scritto nel canale — tratta come user con prefix
        aiMessages.push({
          role: "user",
          content: `[altro super_admin] ${m.content}`,
        });
      }
    }

    // 6. Conversation ID per audit (channel_id come stable identifier)
    const conversationId = channelId;

    // Persist user message in silvio_admin_messages (audit)
    await supabase.from("silvio_admin_messages").insert({
      user_id: userId,
      conversation_id: conversationId,
      role: "user",
      content: message,
    });

    // 7. Invoca AI
    const t0 = Date.now();
    let result;
    try {
      result = await aiRouterComplete({
        supabase,
        taskKey: "silvio_admin_chat",
        messages: aiMessages,
        userId,
        forceModel,
        personaKey: "silvio_admin",
        // Costo stimato max 0.05€ per chiamata (chat senza tools è leggera)
        estimatedCostEur: 0.05,
      });
    } catch (e) {
      console.error("[silvio-admin-chat] AI error:", e);
      // Fallback: posta messaggio di errore amichevole nel canale
      const errorMsg = `Mi dispiace Florin, ho avuto un problema con l'AI: ${
        e instanceof Error ? e.message.slice(0, 200) : "errore sconosciuto"
      }. Prova a riformulare o riprova tra un momento.`;
      await supabase.from("internal_chat_messages").insert({
        channel_id: channelId,
        sender_id: SILVIO_ADMIN_SENDER_ID,
        company_id: channel.company_id,
        content: errorMsg,
        message_type: "text",
      });
      return jsonRes({
        error: e instanceof Error ? e.message : String(e),
        replied_with_error: true,
      }, 200);
    }
    const aiDuration = Date.now() - t0;

    // 8. Inserisci risposta nel canale
    const { error: insertErr } = await supabase
      .from("internal_chat_messages")
      .insert({
        channel_id: channelId,
        sender_id: SILVIO_ADMIN_SENDER_ID,
        company_id: channel.company_id ?? PLATFORM_ADMIN_COMPANY,
        content: result.content,
        message_type: "text",
      });
    if (insertErr) {
      console.error("[silvio-admin-chat] insert reply:", insertErr);
    }

    // 9. Persist assistant message in silvio_admin_messages
    await supabase.from("silvio_admin_messages").insert({
      user_id: userId,
      conversation_id: conversationId,
      role: "assistant",
      content: result.content,
      model_id: result.modelUsed,
      cost_usd: result.costUsd,
      tokens_prompt: result.promptTokens,
      tokens_completion: result.completionTokens,
      metadata: {
        ledger_id: result.ledgerId,
        used_primary: result.usedPrimary,
        ai_duration_ms: aiDuration,
        failed_attempts: result.failedAttempts,
      },
    });

    return jsonRes({
      ok: true,
      content: result.content,
      model_used: result.modelUsed,
      cost_usd: result.costUsd,
      duration_ms: aiDuration,
      failed_attempts: result.failedAttempts,
    });
  } catch (e) {
    console.error("[silvio-admin-chat] fatal:", e);
    return jsonRes(
      { error: e instanceof Error ? e.message : String(e) },
      500
    );
  }
});

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
