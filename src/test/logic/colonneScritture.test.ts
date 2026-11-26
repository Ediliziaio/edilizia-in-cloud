/**
 * Le colonne dell'elenco scritture di Contabilità generale (26/11/2026).
 *
 * Nota sul valore di questo test: è più debole di quelli di Scadenzario e Prima nota, che
 * disegnano la tabella e contano le celle. Qui non si può: `Scritture` non è esportato e
 * porta sei hook fra query e mutation, quindi disegnarlo costerebbe più di quello che
 * proverebbe. Si controlla allora il guasto che conta — una colonna dichiarata che non ha
 * la sua cella, e che in pagina si vedrebbe come una colonna vuota senza che nulla
 * protesti — leggendo il sorgente. Se un giorno `Scritture` viene esportato, questo test
 * va sostituito con uno vero.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DEF_SCRITTURE, SCRITTURE_A_DESTRA, SCRITTURE_TITOLI } from "@/lib/contabilita/colonneScritture";
import { colonneVisibili, siPuoNascondere } from "@/lib/tabelle/colonneTabella";

const sorgente = readFileSync("src/components/contabilita/ContabilitaGenerale.tsx", "utf8");

describe("le colonne delle scritture", () => {
  it("ogni colonna dichiarata ha la sua cella", () => {
    for (const c of DEF_SCRITTURE) {
      expect(sorgente, `manca la cella di ${c.chiave}`).toContain(`${c.chiave}: {`);
    }
  });

  it("testata e celle le disegna la stessa scelta, non due elenchi diversi", () => {
    expect(sorgente.match(/colonneScritture\.colonne\.map/g)).toHaveLength(2);
  });

  it("numero, data e importo non si spengono: senza una delle tre la riga non si legge", () => {
    const fisse = DEF_SCRITTURE.filter((c) => !siPuoNascondere(c)).map((c) => c.chiave);
    expect(fisse).toEqual(["numero", "data", "importo"]);
  });

  it("di serie si vedono tutte, nell'ordine del libro giornale", () => {
    expect(colonneVisibili(DEF_SCRITTURE).map((c) => c.chiave)).toEqual([
      "numero", "data", "causale", "documento", "descrizione", "importo",
    ]);
  });

  it("le spiegazioni e l'allineamento parlano di colonne che esistono", () => {
    const chiavi = new Set(DEF_SCRITTURE.map((c) => c.chiave));
    for (const k of [...SCRITTURE_A_DESTRA, ...Object.keys(SCRITTURE_TITOLI)]) {
      expect(chiavi, `${k} non è una colonna`).toContain(k);
    }
  });
});
