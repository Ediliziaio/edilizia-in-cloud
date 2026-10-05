import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * I punti in cui un provider AI risponde devono segnalare l'errore: se uno
 * viene tolto (o ne nasce uno nuovo senza segnalazione) il credito finito torna
 * a passare in silenzio da lì, come il 02/10/2026. Controlli sul sorgente, come
 * funzioniChiamateSenzaJwt: le funzioni edge girano su Deno e qui non si
 * eseguono.
 */
const sorgente = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");

describe("I punti in cui il provider risponde sono agganciati all'allarme", () => {
  it("il router segnala dentro il catch di ogni tentativo, col task e il modello", () => {
    const s = sorgente("supabase/functions/_shared/aiRouter.ts");
    expect(s).toContain('import { segnalaErroreAI } from "./allarmeAI.ts"');
    expect(s).toMatch(/attempts\.push\(\{ model, error: errMsg \}\);\s*(\/\/[^\n]*\n\s*)*segnalaErroreAI\(errMsg, \{ funzione: opts\.taskKey, modello: model/);
  });

  it("il client OpenRouter dei provider segnala, e rilancia l'errore com'era", () => {
    const s = sorgente("supabase/functions/_shared/ai-provider/openrouter.ts");
    expect(s).toMatch(/export async function callOpenRouter\([\s\S]*?catch \(e\) \{[\s\S]*?segnalaErroreAI\(e,[\s\S]*?throw e;/);
    expect(s).toMatch(/\nasync function chiamaOpenRouter\(/);
  });

  it("il proxy Claude segnala la risposta non riuscita di OpenRouter", () => {
    const s = sorgente("supabase/functions/_shared/claudeProxy.ts");
    expect(s).toMatch(/if \(!orResp\.ok\) \{[\s\S]*?segnalaErroreAI\(\s*\{ provider: "openrouter", stato: orResp\.status/);
  });

  it("i render segnalano dove registrano l'errore del tentativo", () => {
    const s = sorgente("supabase/functions/_shared/ai-provider/image.ts");
    expect(s).toMatch(/function logImageError\([\s\S]*?segnalaErroreAI\(args\.msg,/);
  });

  it("la funzione dei PDF non avvisa più per conto suo: lo fa il sistema degli allarmi", () => {
    const s = sorgente("supabase/functions/email-ai-estrai-allegato/index.ts");
    expect(s).not.toContain("alertOutreach");
  });
});
