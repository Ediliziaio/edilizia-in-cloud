// src/test/logic/convertiAvvio.test.ts
/**
 * Le strade che creano commesse danno alla commessa nata le fasi e le rate di partenza
 * dell'azienda (commessa_avvia), senza mai bloccare la creazione.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (p: string) => readFileSync(join(__dirname, "../..", p), "utf8");
const CONVERSIONI = leggi("lib/moduli/convertiInCommessa.ts");
const SIMULATORE = leggi("components/marketing/simulatore/TrasformaDialog.tsx");

describe("conversione dei preventivi di modulo", () => {
  it("fotovoltaico e ristrutturazione avviano la commessa, una volta ciascuna, prima del legame col preventivo", () => {
    expect(CONVERSIONI.match(/await avviaCommessa\(orderId\)/g)).toHaveLength(2);
    // Il legame col preventivo (legaCommessaAlPreventivo) lo fa per entrambe: dopo l'avvio, mai prima.
    expect(CONVERSIONI.match(/await legaCommessaAlPreventivo\(\{/g)).toHaveLength(2);
    const fv = CONVERSIONI.indexOf("await avviaCommessa(orderId)");
    expect(fv).toBeGreaterThan(-1);
    expect(fv).toBeLessThan(CONVERSIONI.indexOf("await legaCommessaAlPreventivo({"));
    const rst = CONVERSIONI.lastIndexOf("await avviaCommessa(orderId)");
    expect(rst).toBeLessThan(CONVERSIONI.lastIndexOf("await legaCommessaAlPreventivo({"));
    // E ognuno dei due legami è quello giusto: la colonna della commessa è del suo modulo.
    expect(CONVERSIONI.indexOf('colonnaCommessa: "fv_progetto_id",')).toBeGreaterThan(fv);
    expect(CONVERSIONI.indexOf('colonnaCommessa: "rst_progetto_id",')).toBeGreaterThan(rst);
  });

  it("la fase per capitolo c'è solo se chi converte l'ha scelta, e viene prima delle fasi di partenza", () => {
    const capitoli = CONVERSIONI.indexOf("if (opzioni.fasiDaCapitoli) await aggiungiFasiDaCapitoli(orderId, fasiDaCapitoli(voci ?? [], totale));");
    expect(capitoli).toBeGreaterThan(-1);
    expect(capitoli).toBeLessThan(CONVERSIONI.lastIndexOf("await avviaCommessa(orderId)"));
    // Il fotovoltaico non ha capitoli: nessuna delle due chiamate è nella sua conversione.
    expect(CONVERSIONI.slice(0, CONVERSIONI.indexOf("export async function convertiRstInCommessa"))).not.toContain("aggiungiFasiDaCapitoli(orderId");
  });

  it("senza opzioni la ristrutturazione non crea fasi da capitoli (comportamento di sempre)", () => {
    expect(CONVERSIONI).toContain("opzioni: { fasiDaCapitoli?: boolean } = {}");
  });
});

describe("simulatore", () => {
  it("dopo la commessa avvia le fasi e le rate di partenza, prima di aggiornare le liste", () => {
    const avvio = SIMULATORE.indexOf("await avviaCommessa(result.id)");
    expect(avvio).toBeGreaterThan(-1);
    expect(avvio).toBeLessThan(SIMULATORE.indexOf('queryClient.invalidateQueries({ queryKey: ["orders"] })'));
  });
});
