// MP05 — ai-provider-test
// Edge function per smoke test + A/B testing del layer AI.
// Usa il modulo _shared/ai-provider/ (stesso di whatsapp-ai-processor etc.).
//
// Body richiesta:
// {
//   "task_kind": "bot_operativo_operaio",
//   "messages": [{ "role": "user", "content": "Ciao" }],
//   "model_override": "anthropic/claude-haiku-4.5" // opzionale, per A/B
// }

import { getCorsHeaders } from "../_shared/headers.ts";
import { isInternalRequest, requireAuth, requireRole } from "../_shared/auth.ts";
import {
  chat,
  type ChatRequest,
  type TaskKind,
} from "../_shared/ai-provider/index.ts";

const VALID_TASK_KINDS: TaskKind[] = [
  "bot_operativo_titolare",
  "bot_operativo_operaio",
  "assistenza_clienti",
  "lead_qualificazione",
  "vision_ddt",
  "vision_cantiere",
  "parse_rapportino",
  "computo_metrico",
  "bank_categorize",
  "chat_routine",
  "default",
];

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!isInternalRequest(req)) {
    try {
      const { userId, supabaseAdmin } = await requireAuth(req, corsHeaders);
      await requireRole(supabaseAdmin, userId, ["super_admin"], corsHeaders);
    } catch (err) {
      if (err instanceof Response) return err;
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.task_kind || !VALID_TASK_KINDS.includes(body.task_kind)) {
    return new Response(
      JSON.stringify({
        error: "invalid_task_kind",
        valid: VALID_TASK_KINDS,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(
      JSON.stringify({ error: "messages_required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const result = await chat(body);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return new Response(
      JSON.stringify({
        ok: false,
        error_code: err.code ?? "unknown",
        error_message: String(err.message ?? e),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
