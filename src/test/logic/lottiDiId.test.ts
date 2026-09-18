import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aLotti, perOgniLotto, raccogliALotti, sommaALotti, LOTTO_ID, LOTTO_RIGHE } from "@/lib/lottiDiId";

// «Seleziona tutti i risultati» arriva a 25.000 contatti. Da lì in poi ogni
// azione di massa deve lavorare a lotti: un `.in(...)` con 25.000 uuid non
// entra nell'URL, e PostgREST non restituisce comunque più di mille righe per
// risposta — due limiti che non danno errore, danno risultati parziali.

describe("aLotti", () => {
  it("spezza mantenendo l'ordine e senza perdere elementi", () => {
    expect(aLotti([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(aLotti([], 10)).toEqual([]);
    const venticinquemila = Array.from({ length: 25000 }, (_, i) => i);
    const lotti = aLotti(venticinquemila);
    expect(lotti).toHaveLength(Math.ceil(25000 / LOTTO_ID));
    expect(lotti.flat()).toHaveLength(25000);
    expect(lotti.flat()[24999]).toBe(24999);
  });

  it("rifiuta dimensioni che manderebbero in ciclo infinito", () => {
    expect(() => aLotti([1, 2, 3], 0)).toThrow();
    expect(() => aLotti([1, 2, 3], -5)).toThrow();
  });
});

describe("le dimensioni dei lotti", () => {
  it("stanno sotto il tetto delle mille righe di PostgREST", () => {
    expect(LOTTO_ID).toBeLessThanOrEqual(1000);
    expect(LOTTO_RIGHE).toBeLessThanOrEqual(1000);
  });

  it("tengono l'URL corto: 500 uuid sono meno di 25 kB", () => {
    const urlStimato = LOTTO_ID * 37; // uuid + separatore
    expect(urlStimato).toBeLessThan(25 * 1024);
  });
});

describe("raccogliALotti", () => {
  it("unisce i risultati nell'ordine dei lotti e li esegue in fila", async () => {
    const visti: number[][] = [];
    let contemporanei = 0;
    let massimoContemporanei = 0;
    const out = await raccogliALotti(
      [1, 2, 3, 4, 5],
      async (lotto) => {
        contemporanei++;
        massimoContemporanei = Math.max(massimoContemporanei, contemporanei);
        await Promise.resolve();
        visti.push(lotto);
        contemporanei--;
        return lotto.map((n) => n * 10);
      },
      2,
    );
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(visti).toEqual([[1, 2], [3, 4], [5]]);
    expect(massimoContemporanei).toBe(1);
  });

  it("propaga l'errore del lotto invece di restituire un risultato monco", async () => {
    await expect(
      raccogliALotti([1, 2, 3], async (lotto) => {
        if (lotto.includes(3)) throw new Error("PostgREST: URI too long");
        return lotto;
      }, 2),
    ).rejects.toThrow("URI too long");
  });
});

describe("perOgniLotto e sommaALotti", () => {
  it("passano ogni elemento una volta sola", async () => {
    const visti: number[] = [];
    await perOgniLotto([1, 2, 3, 4], async (lotto) => { visti.push(...lotto); }, 3);
    expect(visti).toEqual([1, 2, 3, 4]);
  });

  it("sommano i conteggi dei lotti", async () => {
    const totale = await sommaALotti([1, 2, 3, 4, 5], async (lotto) => lotto.length, 2);
    expect(totale).toBe(5);
  });

  it("non chiamano l'azione con un elenco vuoto", async () => {
    let chiamate = 0;
    await perOgniLotto([], async () => { chiamate++; });
    expect(chiamate).toBe(0);
  });
});

// Guardia: le azioni di massa non devono tornare a mandare l'elenco intero.
// Se qualcuno riscrive `.in("id", ids)` senza lotto, qui si accorge subito.
describe("le azioni di massa sui contatti passano dai lotti", () => {
  const file = [
    "src/pages/azienda/marketing/MarketingContacts.tsx",
    "src/components/contacts/BulkContactActions.tsx",
    "src/components/marketing/AddToListDropdown.tsx",
    "src/components/marketing/BulkEnrollAutomationDropdown.tsx",
  ];

  it.each(file)("%s usa lottiDiId", (percorso) => {
    const sorgente = readFileSync(percorso, "utf8");
    expect(sorgente).toContain("@/lib/lottiDiId");
  });

  it("l'esportazione legge i contatti selezionati a lotti", () => {
    const sorgente = readFileSync("src/pages/azienda/marketing/MarketingContacts.tsx", "utf8");
    expect(sorgente).toContain("raccogliALotti<string, any>(finalIds");
  });

  it.each(file)("%s non manda l'elenco intero dentro un .in()", (percorso) => {
    const sorgente = readFileSync(percorso, "utf8");
    // Resta fuori `.in("id", finalIds)` dell'elenco a schermo: lì gli id
    // vengono dai filtri avanzati a gruppi, che PostgREST tronca già a mille.
    const sospetti = [
      '.in("id", ids)',
      '.in("id", contactIds)',
      '.in("contact_id", ids)',
      '.in("cliente_id", ids)',
    ];
    for (const sospetto of sospetti) {
      expect(sorgente.includes(sospetto), `${percorso} contiene ${sospetto}`).toBe(false);
    }
  });
});
