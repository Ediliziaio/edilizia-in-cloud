/**
 * Leggere un PDF non è una domanda a Silvio: ha bisogno di più di 25 secondi (16/11/2026).
 *
 * `DEFAULT_TIMEOUT_MS` del provider OpenRouter è 25 secondi, giusto per una risposta in chat.
 * Sulla lettura degli allegati delle email quei 25 secondi hanno ucciso sedici documenti di
 * quattro aziende («Timeout dopo 25000ms»), e dopo sei tentativi il dispatcher non li ha più
 * ripresi: le fatture arrivate per email non sono mai diventate documenti.
 *
 * Adesso la singola chiamata può chiedere più tempo (`timeoutMs`), senza allungarlo a tutte.
 * Il tetto vero è di chi chiama: `silvio_email_dispatch_fatture` aspetta 120 secondi.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const leggi = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("l'attesa della lettura di un allegato", () => {
  it("il provider accetta un'attesa per chiamata e la rispetta", () => {
    const src = leggi("supabase/functions/_shared/ai-provider/openrouter.ts");
    expect(src).toMatch(/timeoutMs\?: number;/);
    // Si usa quella chiesta, se c'è, senza mai superare il tempo che resta al giro.
    expect(src).toMatch(/const chiesto = params\.timeoutMs && params\.timeoutMs > 0 \? params\.timeoutMs : DEFAULT_TIMEOUT_MS;/);
    expect(src).toMatch(/Math\.min\(chiesto, metadata\.turnControl\?\.remainingMs\(\) \?\? chiesto\)/);
  });

  it("la lettura dell'allegato chiede 90 secondi, dentro i 120 di chi la lancia", () => {
    const src = leggi("supabase/functions/email-ai-estrai-allegato/index.ts");
    const m = src.match(/timeoutMs:\s*([0-9_]+)/);
    expect(m, "l'estrazione deve chiedere la sua attesa").not.toBeNull();
    const ms = Number((m?.[1] ?? "0").replace(/_/g, ""));
    expect(ms).toBeGreaterThan(25_000);
    expect(ms).toBeLessThan(120_000);
  });
});
