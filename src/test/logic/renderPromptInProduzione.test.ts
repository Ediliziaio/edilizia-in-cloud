/**
 * Quale costruttore di prompt gira davvero per pergole e piscine (10/11/2026).
 *
 * Nelle due cartelle `shared/render-*` convivono DUE costruttori:
 *
 *   pergole  →  pergolePromptBuilder.ts   (buildPergolePrompt)
 *               pergolaEdgePrompt.ts      (buildPergolaEdgePrompt)   ← produzione
 *   piscine  →  piscinePromptBuilder.ts   (buildPiscinePrompt)
 *               generate-pool-render/poolPrompt.ts (buildPoolPrompt) ← produzione
 *
 * I test `pergoleRenderPrompt.test.ts` (22 asserzioni) e
 * `piscineRenderPrompt.test.ts` provano i PRIMI due, che nessuna edge function
 * importa: chi cambia il comportamento del render vede i test verdi e la
 * funzione in produzione intatta. L'intestazione di `pergolaEdgePrompt.ts`
 * dice che il builder «è usato dall'anteprima della pagina»: non è più vero,
 * nessun file di `src/` lo importa.
 *
 * È la stessa trappola che CLAUDE.md descrive per `shared/` e per il PDF del
 * bagno precompilato: due copie, i controlli su quella ferma.
 *
 * Questo test non sceglie quale dei due debba vincere — è una decisione sul
 * prodotto. Fissa però ciò che è vero adesso, così il giorno in cui qualcuno
 * unifica i costruttori, o sposta l'import della edge function, il test lo
 * dice invece di lasciarlo scoprire a un cliente dal render sbagliato.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const radice = join(__dirname, "..", "..", "..");
const leggi = (p: string) => readFileSync(join(radice, p), "utf-8");

describe("render: il prompt che gira in produzione", () => {
  it("le pergole in produzione usano pergolaEdgePrompt, non pergolePromptBuilder", () => {
    const edge = leggi("supabase/functions/generate-pergola-render/index.ts");
    expect(edge).toContain("buildPergolaEdgePrompt");
    expect(edge).not.toContain("buildPergolePrompt");
  });

  it("le piscine in produzione usano poolPrompt, non piscinePromptBuilder", () => {
    const edge = leggi("supabase/functions/generate-pool-render/index.ts");
    expect(edge).toContain("buildPoolPrompt");
    expect(edge).not.toContain("buildPiscinePrompt");
  });

  it("i due costruttori di scorta non li importa nessuna edge function", () => {
    // Se un giorno una funzione li importasse, i test che li coprono
    // smetterebbero di essere a vuoto: allora questo controllo va tolto.
    for (const funzione of ["generate-pergola-render", "generate-pool-render"]) {
      const edge = leggi(`supabase/functions/${funzione}/index.ts`);
      expect(edge).not.toContain("pergolePromptBuilder");
      expect(edge).not.toContain("piscinePromptBuilder");
    }
  });
});
