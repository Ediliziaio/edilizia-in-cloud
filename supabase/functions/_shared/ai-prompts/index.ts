// FASE 8.5 — Selettore di system prompt in base al vertical della company.

import { SERRAMENTISTA_SYSTEM_PROMPT } from "./serramentista.ts";
import { GENERICO_SYSTEM_PROMPT } from "./generico.ts";

const PROMPTS_BY_VERTICAL: Record<string, string> = {
  serramentista: SERRAMENTISTA_SYSTEM_PROMPT,
  generico: GENERICO_SYSTEM_PROMPT,
};

export function getSystemPromptForVertical(vertical: string | null | undefined): string {
  if (!vertical) return GENERICO_SYSTEM_PROMPT;
  return PROMPTS_BY_VERTICAL[vertical] ?? GENERICO_SYSTEM_PROMPT;
}

export { SERRAMENTISTA_SYSTEM_PROMPT, GENERICO_SYSTEM_PROMPT };
