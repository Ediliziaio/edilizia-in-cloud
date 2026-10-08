import { isProviderCreditError } from "./aiRequestGuard.ts";

/** One batch uses deterministic alerts after the first provider 402.
 * The router's persistent cooldown protects subsequent worker invocations.
 */
export class BriefingAiGate {
  private paused = false;
  get providerPaused(): boolean { return this.paused; }
  async compose(ai: () => Promise<string>, fallback: () => string): Promise<string> {
    if (this.paused) return fallback();
    try { return await ai(); }
    catch (error) {
      if (isProviderCreditError(error)) this.paused = true;
      console.warn("[silvio-briefing] deterministic fallback:", error instanceof Error ? error.name : "unknown");
      return fallback();
    }
  }
}
