// src/test/logic/modelliFasi.test.ts
import { describe, expect, it } from "vitest";
import type { PhaseTemplate } from "@/hooks/useOrderWorkPhases";
import {
  assemblaModelli, bozzaDaModello, bozzaVuota, eModelloDiPartenza, fasiPerCommessa, modelliDaOffrire,
  modelliDiPartenzaMancanti, modelliPerInizializzare, modelloDiPartenza, rimuovi, sostituisci, sposta,
  totaleSottofasi, validaBozza,
  type BozzaModello, type FaseModello, type ModelloFasi,
} from "@/lib/orders/modelliFasi";

const partenza: PhaseTemplate[] = [
  { key: "bagno", label: "Bagno", hint: "Rifacimento bagno", phases: ["Demolizioni", "Impianti"] },
  { key: "tetto", label: "Tetto", hint: "Copertura", phases: ["Ponteggio"] },
];
const mio: ModelloFasi = {
  id: "m1", origine: "azienda", nome: "Impianti completi", descrizione: "",
  fasi: [
    { nome: "Elettrico", sottofasi: [{ nome: "Tracce", peso: 2 }, { nome: "Cavi", peso: 3 }] },
    { nome: "Collaudo", sottofasi: [] },
  ],
};

describe("modelli di partenza", () => {
  it("un modello di partenza è un modello senza sottofasi, con id «partenza:<chiave>»", () => {
    expect(modelloDiPartenza(partenza[0])).toEqual({
      id: "partenza:bagno", origine: "partenza", nome: "Bagno", descrizione: "Rifacimento bagno",
      fasi: [{ nome: "Demolizioni", sottofasi: [] }, { nome: "Impianti", sottofasi: [] }],
    });
    expect(eModelloDiPartenza("partenza:bagno")).toBe(true);
    expect(eModelloDiPartenza("m1")).toBe(false);
  });
  it("quello che si manda al server per darli all'azienda: nome, descrizione, fasi (senza id)", () => {
    expect(modelliPerInizializzare(partenza)).toEqual([
      { nome: "Bagno", descrizione: "Rifacimento bagno", fasi: [{ nome: "Demolizioni", sottofasi: [] }, { nome: "Impianti", sottofasi: [] }] },
      { nome: "Tetto", descrizione: "Copertura", fasi: [{ nome: "Ponteggio", sottofasi: [] }] },
    ]);
  });
});

describe("modelliDaOffrire", () => {
  it("finché l'azienda non li ha fatti suoi: quelli di partenza, uguali a quelli di sempre", () => {
    expect(modelliDaOffrire(false, [], partenza).map((m) => m.id)).toEqual(["partenza:bagno", "partenza:tetto"]);
  });
  it("se ha già salvato un modello suo prima: i suoi per primi, e quelli di partenza con lo stesso nome non si ripetono", () => {
    const suo: ModelloFasi = { ...mio, id: "a", nome: " bagno " };
    expect(modelliDaOffrire(false, [mio, suo], partenza).map((m) => m.id)).toEqual(["m1", "a", "partenza:tetto"]);
  });
  it("dopo: solo i suoi", () => {
    expect(modelliDaOffrire(true, [mio], partenza).map((m) => m.id)).toEqual(["m1"]);
  });
  it("anche se li ha tolti tutti: non tornano quelli di partenza", () => {
    expect(modelliDaOffrire(true, [], partenza)).toEqual([]);
  });
});

describe("modelliDiPartenzaMancanti", () => {
  it("conta quelli di partenza che l'azienda non ha (più), senza badare a maiuscole e spazi", () => {
    const suoi: ModelloFasi[] = [{ ...mio, id: "a", nome: " bagno " }];
    expect(modelliDiPartenzaMancanti(partenza, suoi)).toBe(1);
    expect(modelliDiPartenzaMancanti(partenza, [])).toBe(2);
    expect(modelliDiPartenzaMancanti(partenza, [{ ...mio, nome: "Bagno" }, { ...mio, id: "b", nome: "Tetto" }])).toBe(0);
  });
});

describe("totaleSottofasi", () => {
  it("somma le sottofasi di tutte le fasi", () => {
    expect(totaleSottofasi(mio)).toBe(2);
    expect(totaleSottofasi(modelloDiPartenza(partenza[0]))).toBe(0);
  });
});

describe("assemblaModelli", () => {
  it("compone l'albero dalle tre tabelle e rispetta le posizioni", () => {
    const m = assemblaModelli(
      [{ id: "m2", name: "B", hint: null, position: 1 }, { id: "m1", name: "A", hint: "uno", position: 0 }],
      [{ id: "f2", template_id: "m1", name: "Seconda", position: 1 }, { id: "f1", template_id: "m1", name: "Prima", position: 0 }],
      [{ id: "s2", template_phase_id: "f1", name: "Poi", position: 1, peso: 2 }, { id: "s1", template_phase_id: "f1", name: "Prima", position: 0, peso: 1 }],
    );
    expect(m.map((x) => x.id)).toEqual(["m1", "m2"]);
    expect(m[0]).toEqual({
      id: "m1", origine: "azienda", nome: "A", descrizione: "uno",
      fasi: [
        { nome: "Prima", sottofasi: [{ nome: "Prima", peso: 1 }, { nome: "Poi", peso: 2 }] },
        { nome: "Seconda", sottofasi: [] },
      ],
    });
    expect(m[1].fasi).toEqual([]);
    expect(m[1].descrizione).toBe("");
  });
});

describe("bozze", () => {
  it("una copia è una bozza nuova, «Copia di …», con fasi e sottofasi che non sono condivise", () => {
    const copia = bozzaDaModello(mio, true);
    expect(copia.id).toBeNull();
    expect(copia.nome).toBe("Copia di Impianti completi");
    copia.fasi[0].sottofasi[0].nome = "cambiato";
    expect(mio.fasi[0].sottofasi[0].nome).toBe("Tracce");
  });
  it("il nome di una copia non supera i 80 caratteri", () => {
    expect(bozzaDaModello({ ...mio, nome: "x".repeat(80) }, true).nome).toHaveLength(80);
  });
  it("modificare un modello esistente ne tiene l'id", () => {
    expect(bozzaDaModello(mio, false)).toMatchObject({ id: "m1", nome: "Impianti completi" });
  });
  it("la bozza vuota ha una fase vuota da riempire", () => {
    expect(bozzaVuota()).toEqual({ id: null, nome: "", descrizione: "", fasi: [{ nome: "", sottofasi: [] }] });
  });
});

describe("validaBozza", () => {
  const ok = (patch: Partial<BozzaModello> = {}): BozzaModello => ({
    id: null, nome: "Mio", descrizione: "", fasi: [{ nome: "Demolizioni", sottofasi: [] }], ...patch,
  });
  it("senza nome non passa", () => {
    expect(validaBozza(ok({ nome: "   " }))).toEqual({ ok: false, errore: "Dai un nome al modello." });
  });
  it("senza nemmeno una fase con un nome non passa", () => {
    expect(validaBozza(ok({ fasi: [{ nome: "  ", sottofasi: [] }] }))).toEqual({ ok: false, errore: "Un modello ha almeno una fase, con un nome." });
  });
  it("ripulisce: spazi, voci vuote, peso intero tra 1 e 100, descrizione vuota → null", () => {
    const esito = validaBozza(ok({
      nome: "  Mio  ", descrizione: "   ",
      fasi: [
        { nome: " Elettrico ", sottofasi: [{ nome: " Tracce ", peso: 2.6 }, { nome: " ", peso: 5 }, { nome: "Cavi", peso: 0 }, { nome: "Quadro", peso: 500 }] },
        { nome: "", sottofasi: [{ nome: "orfana", peso: 1 }] },
      ],
    }));
    expect(esito).toEqual({
      ok: true,
      payload: {
        id: null, nome: "Mio", descrizione: null,
        fasi: [{ nome: "Elettrico", sottofasi: [{ nome: "Tracce", peso: 3 }, { nome: "Cavi", peso: 1 }, { nome: "Quadro", peso: 100 }] }],
      },
    });
  });
  it("rifiuta nomi troppo lunghi e troppe fasi o sottofasi", () => {
    expect(validaBozza(ok({ nome: "x".repeat(81) })).ok).toBe(false);
    expect(validaBozza(ok({ fasi: [{ nome: "y".repeat(161), sottofasi: [] }] })).ok).toBe(false);
    expect(validaBozza(ok({ fasi: Array.from({ length: 61 }, (_, i): FaseModello => ({ nome: `F${i}`, sottofasi: [] })) })).ok).toBe(false);
    expect(validaBozza(ok({ fasi: [{ nome: "F", sottofasi: Array.from({ length: 41 }, (_, i) => ({ nome: `S${i}`, peso: 1 })) }] })).ok).toBe(false);
  });
  it("tiene l'id di un modello che si sta modificando", () => {
    const esito = validaBozza(ok({ id: "m1" }));
    expect(esito.ok && esito.payload.id).toBe("m1");
  });
});

describe("fasiPerCommessa", () => {
  it("è quello che arriva a «aggiungi_fasi_commessa»: nomi e pesi interi, senza i campi del modello", () => {
    expect(fasiPerCommessa(mio)).toEqual([
      { nome: "Elettrico", sottofasi: [{ nome: "Tracce", peso: 2 }, { nome: "Cavi", peso: 3 }] },
      { nome: "Collaudo", sottofasi: [] },
    ]);
  });
});

describe("riordino", () => {
  it("sposta su e giù senza uscire dai bordi e senza toccare l'originale", () => {
    const l = ["a", "b", "c"];
    expect(sposta(l, 1, -1)).toEqual(["b", "a", "c"]);
    expect(sposta(l, 1, 1)).toEqual(["a", "c", "b"]);
    expect(sposta(l, 0, -1)).toEqual(["a", "b", "c"]);
    expect(sposta(l, 2, 1)).toEqual(["a", "b", "c"]);
    expect(l).toEqual(["a", "b", "c"]);
  });
  it("sostituisce e rimuove senza toccare l'originale", () => {
    const l = [{ n: "a" }, { n: "b" }];
    expect(sostituisci(l, 1, { n: "z" })).toEqual([{ n: "a" }, { n: "z" }]);
    expect(rimuovi(l, 0)).toEqual([{ n: "b" }]);
    expect(l).toEqual([{ n: "a" }, { n: "b" }]);
  });
});
