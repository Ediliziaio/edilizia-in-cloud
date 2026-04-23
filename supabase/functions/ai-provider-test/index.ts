// MP05 — ai-provider-test
// Edge function per smoke test + A/B testing del layer AI.
// Usa il modulo _shared/ai-provider/ (stesso di whatsapp-ai-processor etc.).
//
// Body richiesta:
// {
//   "task_kind": "bot_operativo_operaio",
//   "messages": [{ "role": "user", "content": "Ciao" }],
//   "model_override": "anthropic/claude-haiku-4"   // opzionale, per A/B
// }

import { corsHeaders } from "../_shared/headers.ts";
import {
  chat,
  type ChatRequest,
  type TaskKind,
} from "../_shared/ai-provider/index.ts";

function extractJwtRole(authHeader: string): string | null {
  if (!authHeader.startsWith("Bearer ")) return null;
  const parts = authHeader.substring(7).split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const auth = req.headers.get("Authorization") ?? "";
  const role = extractJwtRole(auth);
  // Solo service_role (per smoke test interni) o utenti authenticated (ma
  // in produzione UI dovrebbe usare SDK supabase.functions.invoke).
  if (role !== "service_role" && role !== "authenticated") {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
