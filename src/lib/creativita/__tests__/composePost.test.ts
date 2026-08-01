/**
 * Test dell'impaginazione del testo nel compositore post.
 *
 * `composePost` nel suo insieme richiede un Canvas reale (jsdom non lo
 * implementa), ma la parte che può davvero rompersi — mandare a capo una
 * headline dentro la larghezza disponibile — è pura e si testa con un
 * contesto simulato: qui ogni carattere "misura" 10px.
 */
import { describe, it, expect } from "vitest";
import { spezzaRighe } from "../composePost";

/** Finto CanvasRenderingContext2D: larghezza = 10px per carattere. */
function ctxFinto(pxPerCarattere = 10): CanvasRenderingContext2D {
  return {
    measureText: (t: string) => ({ width: t.length * pxPerCarattere }),
  } as unknown as CanvasRenderingContext2D;
}

describe("spezzaRighe", () => {
  it("tiene su una riga il testo che ci sta", () => {
    // "Bagno nuovo" = 11 caratteri = 110px, entra in 200px
    expect(spezzaRighe(ctxFinto(), "Bagno nuovo", 200)).toEqual(["Bagno nuovo"]);
  });

  it("manda a capo quando la riga sfora", () => {
    const righe = spezzaRighe(ctxFinto(), "Bagno chiavi in mano in 10 giorni", 150);
    expect(righe.length).toBeGreaterThan(1);
    // nessuna riga deve superare la larghezza, tranne le parole singole troppo lunghe
    for (const r of righe) {
      if (r.includes(" ")) expect(r.length * 10).toBeLessThanOrEqual(150);
    }
  });

  it("non perde nessuna parola", () => {
    const testo = "Ristrutturazione completa del bagno chiavi in mano";
    const righe = spezzaRighe(ctxFinto(), testo, 120);
    expect(righe.join(" ")).toBe(testo);
  });

  it("non spezza a metà una parola più lunga della riga", () => {
    const righe = spezzaRighe(ctxFinto(), "Impermeabilizzazione", 50);
    expect(righe).toEqual(["Impermeabilizzazione"]);
  });

  it("ignora spazi multipli e testo vuoto", () => {
    expect(spezzaRighe(ctxFinto(), "   ", 200)).toEqual([]);
    expect(spezzaRighe(ctxFinto(), "", 200)).toEqual([]);
    expect(spezzaRighe(ctxFinto(), "Due    spazi", 500)).toEqual(["Due spazi"]);
  });

  it("con larghezza molto piccola mette una parola per riga", () => {
    const righe = spezzaRighe(ctxFinto(), "uno due tre", 5);
    expect(righe).toEqual(["uno", "due", "tre"]);
  });
});
