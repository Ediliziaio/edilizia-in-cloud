// MP02 — Client OpenAI con retry + timeout.
// R11: MAI chiamate OpenAI senza timeout (AbortController 25s)
// R12: MAI senza retry (3 tentativi, exp backoff 500ms/2s/8s)
// R15: Temperature ≤ 0.7 (non 1.0+)

const OPENAI_BASE = "https://api.openai.com/v1";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenAIRequest {
  model: string;
  messages: ChatMessage[];
  tools?: OpenAITool[];
  tool_choice?: "auto" | "none" | "required";
  temperature?: number;
  max_tokens?: number;
}

export interface OpenAIChoice {
  index: number;
  finish_reason: string;
  message: ChatMessage;
}

export interface OpenAIResponse {
  id: string;
  model: string;
  choices: OpenAIChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function callOpenAI(req: OpenAIRequest): Promise<OpenAIResponse> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY non configurata");

  const backoffMs = [500, 2000, 8000];
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25_000);

    try {
      const resp = await fetch(`${OPENAI_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(req),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (resp.status === 429 || resp.status >= 500) {
        const body = await resp.text();
        lastErr = new Error(`OpenAI ${resp.status}: ${body.substring(0, 200)}`);
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, backoffMs[attempt]));
        }
        continue;
      }

      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`OpenAI ${resp.status}: ${body.substring(0, 300)}`);
      }

      return (await resp.json()) as OpenAIResponse;
    } catch (e) {
      clearTimeout(timeoutId);
      const err = e instanceof Error ? e : new Error(String(e));
      lastErr =
        err.name === "AbortError" ? new Error("OpenAI timeout 25s") : err;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, backoffMs[attempt]));
      }
    }
  }

  throw lastErr ?? new Error("OpenAI call failed after 3 retries");
}

export async function transcribeAudioWhisper(
  audioBytes: Uint8Array,
  filename = "audio.ogg",
): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY non configurata");

  const form = new FormData();
  form.append("file", new Blob([audioBytes]), filename);
  form.append("model", "whisper-1");
  form.append("language", "it");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25_000);

  try {
    const resp = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      throw new Error(`Whisper ${resp.status}: ${(await resp.text()).substring(0, 200)}`);
    }
    const json = (await resp.json()) as { text?: string };
    return json.text ?? "";
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}
