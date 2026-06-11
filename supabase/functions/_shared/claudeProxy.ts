/**
 * claudeProxy — chiamate "Anthropic Messages API" instradate su OpenRouter.
 *
 * ARCHITETTURA (decisione 2026-06-11): la piattaforma NON ha una chiave
 * Anthropic diretta — tutto il traffico AI passa da OpenRouter. Questo
 * helper accetta il body nel formato Anthropic Messages (quello già usato
 * dalle 10 funzioni che chiamavano api.anthropic.com) e:
 *
 *   1. Se ANTHROPIC_API_KEY è presente → inoltra ad api.anthropic.com
 *      (passthrough, mantiene prompt caching nativo)
 *   2. Altrimenti → converte in formato OpenAI chat, chiama OpenRouter
 *      con model "anthropic/<model>" e riconverte la risposta nella
 *      forma Anthropic ({content:[{type:"text",text}], usage:{...}})
 *
 * Le funzioni chiamanti NON devono cambiare il parsing: il helper
 * restituisce un oggetto Response identico nei due casi.
 *
 * USO (sostituisce il fetch diretto):
 *   import { claudeMessages, hasClaudeProvider } from "../_shared/claudeProxy.ts";
 *   const response = await claudeMessages({ model, max_tokens, system, messages, temperature });
 *   // response.ok / response.json() come prima
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// ── Tipi (sottoinsieme del formato Anthropic Messages) ───────────────────────
interface AnthropicTextBlock {
  type: "text";
  text: string;
  cache_control?: { type: string };
}

interface AnthropicImageBlock {
  type: "image";
  source:
    | { type: "base64"; media_type: string; data: string }
    | { type: "url"; url: string };
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicImageBlock;

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export interface ClaudeMessagesBody {
  model: string;
  max_tokens: number;
  system?: string | AnthropicTextBlock[];
  messages: AnthropicMessage[];
  temperature?: number;
  // Campi extra (top_p, stop_sequences...) passano solo nel path Anthropic.
  [key: string]: unknown;
}

/** True se almeno un provider Claude è configurato. */
export function hasClaudeProvider(): boolean {
  return Boolean(
    Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("OPENROUTER_API_KEY"),
  );
}

// ── Model mapping Anthropic → OpenRouter ─────────────────────────────────────
// "claude-sonnet-4-5" → "anthropic/claude-sonnet-4.5"
// "claude-haiku-4-5-20251001" → "anthropic/claude-haiku-4.5"
// "claude-3-5-haiku-20241022" → "anthropic/claude-3.5-haiku"
function mapModelToOpenRouter(model: string): string {
  let m = model.trim();
  if (m.startsWith("anthropic/")) return m;
  // rimuovi suffisso data (YYYYMMDD)
  m = m.replace(/-\d{8}$/, "");
  // famiglia 3.x: claude-3-5-haiku → claude-3.5-haiku
  m = m.replace(/^claude-(\d)-(\d)-/, "claude-$1.$2-");
  // famiglia 4.x: claude-sonnet-4-5 → claude-sonnet-4.5
  m = m.replace(/-(\d)-(\d)$/, "-$1.$2");
  return `anthropic/${m}`;
}

// ── Conversione contenuti Anthropic → OpenAI ─────────────────────────────────
type OpenAiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function convertContent(
  content: string | AnthropicContentBlock[],
): string | OpenAiContentPart[] {
  if (typeof content === "string") return content;
  return content.map((block): OpenAiContentPart => {
    if (block.type === "image") {
      return {
        type: "image_url",
        image_url: {
          url: block.source.type === "url"
            ? block.source.url
            : `data:${block.source.media_type};base64,${block.source.data}`,
        },
      };
    }
    return { type: "text", text: block.text };
  });
}

function systemToString(system: string | AnthropicTextBlock[] | undefined): string | null {
  if (!system) return null;
  if (typeof system === "string") return system;
  return system.map((b) => b.text).join("\n\n");
}

// ── Chiamata principale ──────────────────────────────────────────────────────
export async function claudeMessages(body: ClaudeMessagesBody): Promise<Response> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

  // Path 1: Anthropic diretto (se mai configurata la chiave)
  if (anthropicKey) {
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  // Path 2: OpenRouter (default di piattaforma)
  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) {
    return new Response(
      JSON.stringify({
        error: {
          type: "configuration_error",
          message: "Nessun provider AI configurato (OPENROUTER_API_KEY mancante)",
        },
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const systemText = systemToString(body.system);
  const oaMessages: Array<{ role: string; content: string | OpenAiContentPart[] }> = [];
  if (systemText) oaMessages.push({ role: "system", content: systemText });
  for (const msg of body.messages) {
    oaMessages.push({ role: msg.role, content: convertContent(msg.content) });
  }

  const orResp = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openrouterKey}`,
      "content-type": "application/json",
      "HTTP-Referer": Deno.env.get("OPENROUTER_SITE_URL") ?? "https://app.ediliziaincloud.com",
      "X-Title": Deno.env.get("OPENROUTER_APP_NAME") ?? "Edilizia in Cloud",
    },
    body: JSON.stringify({
      model: mapModelToOpenRouter(body.model),
      messages: oaMessages,
      max_tokens: body.max_tokens,
      ...(body.temperature != null ? { temperature: body.temperature } : {}),
    }),
  });

  if (!orResp.ok) {
    // Propaga status + corpo errore: i chiamanti fanno response.text() su !ok
    const errText = await orResp.text();
    return new Response(errText, {
      status: orResp.status,
      headers: { "content-type": "application/json" },
    });
  }

  const data = await orResp.json() as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    model?: string;
  };

  const text = data.choices?.[0]?.message?.content ?? "";
  const finishReason = data.choices?.[0]?.finish_reason;

  // Risposta riconvertita nella forma Anthropic Messages
  const anthropicShaped = {
    id: `or-${crypto.randomUUID()}`,
    type: "message",
    role: "assistant",
    model: data.model ?? body.model,
    content: [{ type: "text", text }],
    stop_reason: finishReason === "length" ? "max_tokens" : "end_turn",
    usage: {
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
    },
  };

  return new Response(JSON.stringify(anthropicShaped), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
