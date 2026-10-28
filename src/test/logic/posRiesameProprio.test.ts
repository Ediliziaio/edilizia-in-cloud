import { describe, it, expect } from "vitest";
import { leggiRiesameProprioPos } from "@/lib/sicurezza/posRiesameProprio";
import { id, fontePropria } from "../fixtures/riesameProprioPos";
const leggi = (v: unknown) => leggiRiesameProprioPos(v, id(1), id(2), id(3));
describe("proiezione propria per POS", () => {
  it("non estende il periodo assegnato della persona a tutto il periodo della lavorazione", () => {
    const f = fontePropria();
    expect(leggi(f).persone[0].periodi[0].al).toBe("2026-11-11");
    expect(leggi(f).al).toBe("2026-11-15");
  });
  it("rifiuta periodi assegnati incoerenti con il riesame", () => {
    const f = fontePropria();
    f.persone[0].periodi[0].al = "2026-11-16";
    expect(() => leggi(f)).toThrow();
  });
  it("accetta il riscontro nominativo pertinente senza assegnarlo al POS", () => {
    const f = fontePropria();
    expect(leggi(f)).toEqual(f);
  });
  it.each(["company_id", "order_id", "id"])(
    "rifiuta contesto diverso: %s",
    (key) => {
      expect(() => leggi({ ...fontePropria(), [key]: id(99) })).toThrow(
        /non pertinenti/,
      );
    },
  );
  it("rifiuta identità esterna, anche con nome uguale", () => {
    const f = fontePropria();
    f.persone[0].tipo = "esterno";
    expect(() => leggi(f)).toThrow();
  });
  it("rifiuta evidenza di altro addetto e fonte non più corrente", () => {
    const f = fontePropria();
    f.riscontri[0].qualifica.persona_id = id(99);
    expect(() => leggi(f)).toThrow();
    f.riscontri[0].qualifica.persona_id = id(4);
    f.riscontri[0].qualifica.fonte_corrente = false;
    expect(() => leggi(f)).toThrow();
  });
  it("non trasforma un riscontro aperto o una revoca in evidenza riesaminata", () => {
    const f = fontePropria();
    f.riscontri[0].esito = "mancante";
    expect(() => leggi(f)).toThrow();
    f.riscontri[0].esito = "riesaminata";
    f.riscontri[0].qualifica.stato = "revocata";
    expect(() => leggi(f)).toThrow();
  });
  it("accetta non applicabilità motivata esclusivamente senza evidenza", () => {
    const f = fontePropria();
    f.riscontri[0].esito = "non_applicabile";
    expect(() => leggi(f)).toThrow();
    const v = { ...f, riscontri: [{ ...f.riscontri[0], qualifica: null as null }] };
    expect(leggi(v).riscontri[0].esito).toBe("non_applicabile");
    expect(() =>
      leggi({ ...v, riscontri: [{ ...v.riscontri[0], motivazione: " " }] }),
    ).toThrow();
  });
  it("rifiuta omissioni, duplicati, risposta vuota e impronta incompleta", () => {
    const f = fontePropria();
    expect(() => leggi({ ...f, riscontri: [] })).toThrow();
    expect(() =>
      leggi({ ...f, riscontri: [...f.riscontri, ...f.riscontri] }),
    ).toThrow();
    expect(() =>
      leggi({ ...f, persone: [...f.persone, { ...f.persone[0], id: id(99) }] }),
    ).toThrow();
    expect(() => leggi({ ...f, impronta: "a" })).toThrow();
    expect(() =>
      leggi({
        ...f,
        criteri: [
          ...f.criteri,
          { profilo_id: id(5), requisito: { id: id(99) } },
        ],
      }),
    ).toThrow();
  });
});
