// _shared/ai-provider/visionQa.ts
// Vision QA: confronta una source photo + una candidate render image
// e ritorna {pass, issues[]} secondo una regola di compliance.
//
// Usato da generate-render dopo aver generato il render per verificare,
// ad esempio, che cinghie/avvolgitori manuali siano stati effettivamente
// rimossi se l'utente ha scelto tapparella motorizzata.
//
// Passa SEMPRE via OpenRouter con chain di modelli vision-capable.

import { callOpenRouter } from "./openrouter.ts";
import type { ChatMessage } from "./types.ts";

const VISION_MODELS_CHAIN = [
  "google/gemini-2.5-flash",
  "anthropic/claude-haiku-4.5",
  "openai/gpt-4o-mini",
];

export interface VisionQaArgs {
  sourceImageDataUrl: string;
  candidateImageDataUrl: string;
  qaPrompt: string;
  metadata: {
    task_kind: string;
    company_id?: string | null;
    session_id?: string | null;
  };
  timeoutMs?: number;
}

/**
 * Issue ritornata dal vision QA. Può essere una stringa (formato legacy
 * compatibilità v8.3.6−) o un oggetto strutturato {category, detail}
 * (formato v8.3.7+ usato dal multi-criterion QA).
 */
export type VisionQaIssue = string | { category: string; detail: string };

export interface VisionQaResult {
  pass: boolean;
  issues: VisionQaIssue[];
  modelUsed: string;
  rawResponse: Record<string, unknown>;
  checked: boolean;
}

export async function callVisionQa(
  args: VisionQaArgs,
): Promise<VisionQaResult> {
  const messages: ChatMessage[] = [
    {
      role: "user",
      content: [
        { type: "text", text: args.qaPrompt },
        { type: "image_url", image_url: { url: args.sourceImageDataUrl } },
        { type: "image_url", image_url: { url: args.candidateImageDataUrl } },
      ],
    },
  ];

  let lastError: Error | null = null;
  for (const model of VISION_MODELS_CHAIN) {
    try {
      const result = await callOpenRouter(
        {
          model,
          messages: messages as unknown[],
          temperature: 0,
          max_tokens: 800,
          response_format: { type: "json_object" },
        },
        {
          task_kind: args.metadata.task_kind,
          company_id: args.metadata.company_id,
        },
      );

      const text = (result.content ?? "").trim();
      if (!text) {
        lastError = new Error(`Empty response from ${model}`);
        continue;
      }

      try {
        const parsed = JSON.parse(text) as { pass?: boolean; issues?: unknown };
        // v8.3.7 — Accetta sia stringhe che oggetti {category, detail}.
        const issues: VisionQaIssue[] = Array.isArray(parsed.issues)
          ? parsed.issues
            .map((i: unknown): VisionQaIssue | null => {
              if (typeof i === "string" && i.trim().length > 0) return i;
              if (i && typeof i === "object") {
                const obj = i as { category?: unknown; detail?: unknown };
                const category = typeof obj.category === "string"
                  ? obj.category
                  : "";
                const detail = typeof obj.detail === "string" ? obj.detail : "";
                if (category || detail) {
                  return { category, detail };
                }
              }
              return null;
            })
            .filter((x): x is VisionQaIssue => x !== null)
          : [];
        return {
          pass: parsed.pass !== false,
          issues,
          modelUsed: result.model,
          rawResponse: result as unknown as Record<string, unknown>,
          checked: true,
        };
      } catch (e) {
        lastError = new Error(`JSON parse failed on ${model}: ${String(e)}`);
        console.warn(
          JSON.stringify({
            lvl: "warn",
            fn: "visionQa",
            session_id: args.metadata.session_id,
            model,
            msg: "json_parse_failed",
            raw: text.substring(0, 200),
          }),
        );
        continue;
      }
    } catch (e) {
      lastError = e as Error;
      console.warn(
        JSON.stringify({
          lvl: "warn",
          fn: "visionQa",
          session_id: args.metadata.session_id,
          model,
          msg: "vision_qa_failed",
          detail: String(lastError.message ?? lastError),
        }),
      );
    }
  }

  // Tutti i modelli vision sono falliti: ritorna checked=false con pass=true
  // per non bloccare il flusso (la QA è opzionale).
  console.warn(
    JSON.stringify({
      lvl: "warn",
      fn: "visionQa",
      session_id: args.metadata.session_id,
      msg: "qa_skipped_all_models_failed",
      last_error: String(lastError?.message ?? ""),
    }),
  );
  return {
    pass: true,
    issues: [],
    modelUsed: "skipped",
    rawResponse: {},
    checked: false,
  };
}
