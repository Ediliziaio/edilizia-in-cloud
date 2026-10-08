import { aiRequestHash } from "./aiRequestGuard.ts";

/** Stable instructions first. Dynamic time/triage/catalog are current context,
 * never cached business answers. No process-wide or cross-company state. */
export function whatsappPromptContext(stableInstructions: string, currentContext: string) {
  return [
    { role: "system" as const, content: stableInstructions },
    { role: "system" as const, content: `[CONTESTO ATTUALE DEL TURNO]\n${currentContext}` },
  ];
}
export function whatsappAiSessionKey(company: string, user: string | null, number: string, session: string | null, role: string, message: string) {
  return aiRequestHash(["whatsapp-ai-v1", company, user, number, session ?? message, role]);
}
