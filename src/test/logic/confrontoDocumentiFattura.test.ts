import { describe, expect, it } from "vitest";
import {
  confrontaRigheDocumenti,
  numeroDocumento,
  righeFatturaConfronto,
  unitaConfronto,
  type RigaConfronto,
  type RigaBollaConfronto,
} from "@/lib/fatturazione/confrontoDocumenti";
import {
  esigiRigaSalvata,
  filtroRicercaMezzo,
  messaggioSalvataggio,
} from "@/lib/fatturazione/salvataggioFattura";
const r = (
  id: string,
  quantita: number | null,
  prezzo: number | null = 12,
): RigaConfronto => ({
  id,
  descrizione: "Malta A81",
  codice: "A81",
  um: "pz",
  quantita,
  prezzo,
  importo: null,
});
const b = (id: string, q: number | null, usata = 0): RigaBollaConfronto => ({
  ...r(id, q),
  documentoId: `d${id}`,
  giaFatturata: usata,
  residuoIncerto: false,
});
describe("confronto fattura/DDT/ordine", () => {
  it("somma due DDT e sottrae solo i confronti di altre fatture", () => {
    const [v] = confrontaRigheDocumenti(
      [r("f", 45)],
      [b("1", 40, 20), b("2", 20)],
      [r("o", 70, 11.5)],
    );
    expect(v.quantitaDisponibile).toBe(40);
    expect(v.stato).toBe("scostamento");
    expect(v.deltaPrezzo).toBe(0.5);
  });
  it("riconosce consegna parziale sufficiente e prezzo concordato", () => {
    expect(
      confrontaRigheDocumenti([r("f", 15)], [b("1", 20)], [r("o", 70)])[0]
        .stato,
    ).toBe("coerente");
  });
  it("non usa le stesse quantità per due righe della fattura", () => {
    const v = confrontaRigheDocumenti(
      [r("f1", 15), r("f2", 10)],
      [b("1", 20)],
      [r("o", 70)],
    );
    expect(v.map((x) => x.stato)).toEqual(["coerente", "scostamento"]);
    expect(v[1].quantitaDisponibile).toBe(5);
  });
  it.each([null, 0, -2])(
    "quantità mancante o non positiva %s: controllo manuale",
    (n) => {
      expect(
        confrontaRigheDocumenti([r("f", n)], [b("1", 20)], [r("o", 70)])[0]
          .stato,
      ).toBe("da_controllare");
    },
  );
  it("non converte kg, sacchi o unità assenti", () => {
    for (const um of [null, "kg", "sacchi"])
      expect(
        confrontaRigheDocumenti(
          [{ ...r("f", 2), um }],
          [b("1", 20)],
          [r("o", 70)],
        )[0].quantitaDisponibile,
      ).toBeNull();
  });
  it("normalizza solo le equivalenze di scrittura", () => {
    expect(unitaConfronto("M²")).toBe("mq");
    expect(unitaConfronto("m³")).toBe("mc");
    expect(unitaConfronto("Pezzi")).toBe("pz");
  });
  it("non segnala come gratuito il prezzo mancante", () => {
    const [v] = confrontaRigheDocumenti(
      [r("f", 10)],
      [b("1", 20)],
      [r("o", 70, null)],
    );
    expect(v.stato).toBe("da_controllare");
    expect(v.prezzoConcordato).toBeNull();
  });
  it("non sceglie un prezzo fra ordini a condizioni diverse", () => {
    expect(
      confrontaRigheDocumenti(
        [r("f", 10)],
        [b("1", 20)],
        [r("o1", 70, 10), r("o2", 70, 12)],
      )[0].prezzoConcordato,
    ).toBeNull();
  });
  it("una precedente fattura solo referenziata rende il residuo incerto", () => {
    expect(
      confrontaRigheDocumenti(
        [r("f", 10)],
        [{ ...b("1", 20), residuoIncerto: true }],
        [r("o", 70)],
      )[0].stato,
    ).toBe("da_controllare");
  });
  it("servizi senza DDT restano da confrontare manualmente", () => {
    expect(
      confrontaRigheDocumenti(
        [{ ...r("f", 1), descrizione: "Trasporto", codice: null }],
        [],
        [r("o", 70)],
      )[0].stato,
    ).toBe("senza_riferimento");
  });
  it("codici diversi non si uniscono con una descrizione generica uguale", () => {
    expect(
      confrontaRigheDocumenti(
        [r("f", 10)],
        [{ ...b("1", 20), codice: "A82" }],
        [r("o", 70)],
      )[0].stato,
    ).toBe("senza_riferimento");
  });
  it("normalizza le righe importate senza trasformare null in zero", () => {
    expect(
      righeFatturaConfronto([
        {
          numero_linea: 3,
          descrizione: "Nuovo articolo",
          quantita: 2,
          prezzo_unitario: null,
          unita_misura: "pz",
          codice_articolo: "X",
        },
      ])[0],
    ).toMatchObject({
      id: "3",
      quantita: 2,
      prezzo: null,
      um: "pz",
      codice: "X",
    });
    expect(numeroDocumento("1.234,56")).toBe(1234.56);
    expect(numeroDocumento(null)).toBeNull();
  });
  it("confronta il prezzo netto dopo gli sconti presenti nella fattura", () => {
    const righe = righeFatturaConfronto([
      {
        descrizione: "Malta A81",
        codice_articolo: "A81",
        unita_misura: "pz",
        quantita: 10,
        prezzo_unitario: 100,
        imponibile: 900,
      },
    ]);
    expect(righe[0].prezzo).toBe(90);
    expect(
      confrontaRigheDocumenti(righe, [b("1", 10)], [r("o", 10, 90)])[0].stato,
    ).toBe("coerente");
  });
});
describe("salvataggio e ricerca", () => {
  it("un aggiornamento a zero righe non è un successo", () => {
    expect(() => esigiRigaSalvata({ data: null, error: null })).toThrow(
      /non è stata salvata/,
    );
  });
  it("mantiene gli errori PostgREST e li mostra in forma leggibile", () => {
    const e = { code: "42501", message: "denied" };
    expect(() => esigiRigaSalvata({ data: null, error: e })).toThrow();
    expect(messaggioSalvataggio(e)).toContain("Acquisti");
    expect(messaggioSalvataggio({ message: "DDT non trovato" })).toBe(
      "DDT non trovato",
    );
  });
  it("cerca la targa con e senza spazi e impedisce l’iniezione di filtri", () => {
    expect(filtroRicercaMezzo("AB123CD")).toBe(
      "nome.ilike.%AB123CD%,targa.ilike.%A%B%1%2%3%C%D%",
    );
    expect(filtroRicercaMezzo("AB 123 CD")).toContain(
      "targa.ilike.%A%B%1%2%3%C%D%",
    );
    expect(filtroRicercaMezzo("(x),id.eq.a")).not.toContain("id.eq");
    expect(filtroRicercaMezzo(" % ")).toBeNull();
  });
});
