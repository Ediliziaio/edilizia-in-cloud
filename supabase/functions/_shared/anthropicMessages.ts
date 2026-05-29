/**
 * anthropicMessages — shim drop-in per le edge function che chiamavano
 * direttamente l'API Anthropic Messages (`/v1/messages`).
 *
 * Il progetto ha configurato OpenRouter (OPENROUTER_API_KEY), NON Anthropic
 * diretto → quelle funzioni fallivano con "ANTHROPIC_API_KEY missing".
 * Questo shim accetta lo STESSO payload Anthropic (model/system/messages/
 * max_tokens/temperature) e ritorna una risposta con la STESSA forma
 * ({ content:[{type:"text",text}], usage:{input_tokens,output_tokens}, model }),
 * così il codice chiamante resta quasi identico. Internamente instrada su
 * OpenRouter (formato OpenAI). Fallback: Anthropic diretto SE la key è presente.
 *
 * Converte i content block Anthropic (text / image base64 / document PDF) nel
 * formato OpenAI/OpenRouter (image_url / file).
 */

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// deno-lint-ignore no-explicit-any
type Any = any;

/** Mappa i nomi modello "app" (Anthropic) → id OpenRouter. */
export function toOpenRouterModel(m: string): string {
  if (!m) return "anthropic/claude-haiku-4.5";
  if (m.includes("/")) return m; // già un id OpenRouter (es. anthropic/...)
  const MAP: Record<string, string> = {
    "claude-haiku-4-5": "anthropic/claude-haiku-4.5",
    "claude-sonnet-4-5": "anthropic/claude-sonnet-4.5",
    "claude-opus-4-5": "anthropic/claude-opus-4.5",
    "claude-sonnet-4-20250514": "anthropic/claude-sonnet-4",
    "claude-3-5-haiku-latest": "anthropic/claude-3.5-haiku",
    "claude-3-5-sonnet-latest": "anthropic/claude-3.5-sonnet",
    "claude-3-5-haiku-20241022": "anthropic/claude-3.5-haiku",
    "claude-3-5-sonnet-20241022": "anthropic/claude-3.5-sonnet",
  };
  if (MAP[m]) return MAP[m];
  // fallback generico: "claude-haiku-4-5" → "anthropic/claude-haiku-4.5"
  const generic = m.replace(/^(claude-[a-z]+-\d+)-(\d+)$/, "$1.$2");
  return `anthropic/${generic}`;
}

interface AnthropicBlock { type: string; text?: string; source?: { type: string; media_type?: string; data?: string; url?: string }; [k: string]: Any; }

/** Converte un content Anthropic (string | block[]) in content OpenAI. */
function toOpenAIContent(content: string | AnthropicBlock[]): string | Any[] {
  if (typeof content === "string") return content;
  const out: Any[] = [];
  for (const b of content) {
    if (b.type === "text" && typeof b.text === "string") {
      out.push({ type: "text", text: b.text });
    } else if (b.type === "image" && b.source?.type === "url" && b.source?.url) {
      out.push({ type: "image_url", image_url: { url: b.source.url } });
    } else if (b.type === "image" && b.source?.data) {
      const mt = b.source.media_type ?? "image/jpeg";
      out.push({ type: "image_url", image_url: { url: `data:${mt};base64,${b.source.data}` } });
    } else if (b.type === "document" && b.source?.data) {
      // PDF → formato file OpenRouter (modelli con capacità PDF)
      const mt = b.source.media_type ?? "application/pdf";
      out.push({ type: "file", file: { filename: "document.pdf", file_data: `data:${mt};base64,${b.source.data}` } });
    }
  }
  // se è un singolo blocco di testo, ritorna stringa (più compatibile)
  if (out.length === 1 && out[0].type === "text") return out[0].text;
  return out;
}

/** Estrae il testo di system (string | block[]) in una stringa unica. */
function systemToString(system: string | AnthropicBlock[] | undefined): string | null {
  if (!system) return null;
  if (typeof system === "string") return system;
  return system.map((b) => b.text ?? "").filter(Boolean).join("\n\n");
}

export interface AnthropicLikeResponse {
  content: { type: "text"; text: string }[];
  usage: { input_tokens: number; output_tokens: number };
  model: string;
  stop_reason: string | null;
  _provider: "openrouter" | "anthropic";
}

export interface AnthropicMessagesInput {
  model: string;
  max_tokens: number;
  // deno-lint-ignore no-explicit-any
  system?: string | any[];
  // deno-lint-ignore no-explicit-any
  messages: { role: string; content: string | any[] }[];
  temperature?: number;
  // deno-lint-ignore no-explicit-any
  response_format?: any;
}

/**
 * Chiama il provider AI con un payload in stile Anthropic Messages.
 * Primario: OpenRouter (formato OpenAI). Fallback: Anthropic diretto.
 */
export async function anthropicMessages(input: AnthropicMessagesInput): Promise<AnthropicLikeResponse> {
  // ── Primario: OpenRouter ───────────────────────────────────────────────
  if (OPENROUTER_API_KEY) {
    const messages: Any[] = [];
    const sys = systemToString(input.system);
    if (sys) messages.push({ role: "system", content: sys });
    for (const m of input.messages) {
      messages.push({ role: m.role, content: toOpenAIContent(m.content) });
    }
    const body: Record<string, Any> = {
      model: toOpenRouterModel(input.model),
      messages,
      max_tokens: input.max_tokens,
    };
    if (typeof input.temperature === "number") body.temperature = input.temperature;
    if (input.response_format) body.response_format = input.response_format;

    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://www.ediliziaincloud.com",
        "X-Title": "Edilizia in Cloud",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${t.slice(0, 400)}`);
    }
    const d = await res.json();
    if (d.error) throw new Error(`OpenRouter error: ${d.error.message ?? JSON.stringify(d.error)}`);
    const text = d.choices?.[0]?.message?.content ?? "";
    return {
      content: [{ type: "text", text: typeof text === "string" ? text : JSON.stringify(text) }],
      usage: { input_tokens: d.usage?.prompt_tokens ?? 0, output_tokens: d.usage?.completion_tokens ?? 0 },
      model: body.model,
      stop_reason: d.choices?.[0]?.finish_reason ?? null,
      _provider: "openrouter",
    };
  }

  // ── Fallback: Anthropic diretto (solo se la key è configurata) ─────────
  if (ANTHROPIC_API_KEY) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: input.max_tokens,
        system: input.system,
        messages: input.messages,
        temperature: input.temperature,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Anthropic ${res.status}: ${t.slice(0, 400)}`);
    }
    const d = await res.json();
    return {
      content: Array.isArray(d.content) ? d.content : [{ type: "text", text: "" }],
      usage: { input_tokens: d.usage?.input_tokens ?? 0, output_tokens: d.usage?.output_tokens ?? 0 },
      model: d.model ?? input.model,
      stop_reason: d.stop_reason ?? null,
      _provider: "anthropic",
    };
  }

  throw new Error("Nessun provider AI configurato (manca OPENROUTER_API_KEY)");
}

/** True se almeno un provider AI è configurato. */
export function hasAiProvider(): boolean {
  return !!OPENROUTER_API_KEY || !!ANTHROPIC_API_KEY;
}
