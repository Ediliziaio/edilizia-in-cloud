// _shared/ai-provider/sceneAnalysis.ts
// Scene analysis (vision JSON) via OpenRouter con chain di fallback.
// Sostituisce le chiamate vision dirette nei vari analyzer foto.

import { callOpenRouter } from "./openrouter.ts";
import { makeAIError } from "./types.ts";
import type { ChatMessage } from "./types.ts";

// v8.6.32 — Gemini eliminato. Chain: Claude Haiku + OpenAI Vision.
const SCENE_MODELS_CHAIN = [
  "anthropic/claude-haiku-4.5",
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
];

export interface SceneAnalysisArgs {
  systemPrompt: string;
  userPrompt: string;
  imageDataUrl: string;
  metadata: {
    task_kind: string;
    company_id?: string | null;
    session_id?: string | null;
  };
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface SceneAnalysisResult {
  jsonRaw: string;
  parsed: Record<string, unknown>;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costIsEstimated: boolean;
  latencyMs: number;
}

export async function analyzeScene(
  args: SceneAnalysisArgs,
): Promise<SceneAnalysisResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: args.systemPrompt },
    {
      role: "user",
      content: [
        { type: "text", text: args.userPrompt },
        { type: "image_url", image_url: { url: args.imageDataUrl } },
      ],
    },
  ];

  let lastError: Error | null = null;

  for (const model of SCENE_MODELS_CHAIN) {
    try {
      const result = await callOpenRouter(
        {
          model,
          messages: messages as unknown[],
          temperature: 0.1,
          max_tokens: args.maxOutputTokens ?? 4096,
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

      // Estrai JSON anche se c'è testo extra o markdown code block
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        lastError = new Error(`No JSON found in response from ${model}`);
        continue;
      }

      try {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        return {
          jsonRaw: text,
          parsed,
          modelUsed: result.model,
          inputTokens: result.usage.prompt_tokens,
          outputTokens: result.usage.completion_tokens,
          costUsd: result.cost_usd,
          costIsEstimated: result.cost_is_estimated,
          latencyMs: result.latency_ms,
        };
      } catch (e) {
        lastError = new Error(`JSON parse error from ${model}: ${String(e)}`);
        console.warn(
          JSON.stringify({
            lvl: "warn",
            fn: "sceneAnalysis",
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
          fn: "sceneAnalysis",
          session_id: args.metadata.session_id,
          model,
          msg: "scene_analysis_failed",
          detail: String(lastError.message ?? lastError),
        }),
      );
    }
  }

  throw makeAIError(
    "unknown",
    `Scene analysis failed on all models. Last error: ${
      String(
        lastError?.message ?? "unknown",
      )
    }`,
    false,
  );
}
