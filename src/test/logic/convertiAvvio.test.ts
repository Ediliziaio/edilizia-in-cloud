// src/test/logic/convertiAvvio.test.ts
/**
 * Le strade che creano commesse danno alla commessa nata le fasi e le rate di partenza
 * dell'azienda (commessa_avvia), senza mai bloccare la creazione.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (p: string) => readFileSync(join(__dirname, "../..", p), "utf8");
const SIMULATORE = leggi("components/marketing/simulatore/TrasformaDialog.tsx");

describe("simulatore", () => {
  it("dopo la commessa avvia le fasi e le rate di partenza, prima di aggiornare le liste", () => {
    const avvio = SIMULATORE.indexOf("await avviaCommessa(result.id)");
    expect(avvio).toBeGreaterThan(-1);
    expect(avvio).toBeLessThan(SIMULATORE.indexOf('queryClient.invalidateQueries({ queryKey: ["orders"] })'));
  });
});
