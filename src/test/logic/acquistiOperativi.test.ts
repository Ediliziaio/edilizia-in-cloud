import { describe, it, expect } from "vitest";
import { attivitaOda, attivitaRdo } from "@/lib/acquisti/attivita";
import { confrontoOfferta } from "@/lib/acquisti/confronto";
import { modificheEvento, serializeProcurement } from "@/lib/acquisti/storico";
const f = {
  status: "risposta",
  totale_offerto: null as number | null,
  validita_offerta: "2026-12-01",
  trasporto_tipo: "extra" as const,
  costo_trasporto: 20,
};
const righe = { totale: 100, righeCoperte: 2 };
describe("confronto economico RDO", () => {
  it("aggiunge il trasporto alle righe quando manca il totale documento", () =>
    expect(confrontoOfferta(f, righe, 2, "2026-11-06")).toMatchObject({
      totale: 120,
      confrontabile: true,
    }));
  it("non aggiunge due volte il trasporto al totale documento", () =>
    expect(
      confrontoOfferta({ ...f, totale_offerto: 120 }, righe, 2, "2026-11-06"),
    ).toMatchObject({ totale: 120, coerente: true, confrontabile: true }));
  it("segnala totali documento incoerenti e non li premia", () =>
    expect(
      confrontoOfferta({ ...f, totale_offerto: 140 }, righe, 2, "2026-11-06"),
    ).toMatchObject({ coerente: false, confrontabile: false }));
  it.each([
    { ...f, validita_offerta: "2026-11-05" },
    { ...f, status: "rifiutata" },
    { ...f, trasporto_tipo: "da_confermare" as const },
    { ...f, costo_trasporto: null },
  ])("esclude dal miglior totale offerte non confrontabili", (offerta) =>
    expect(
      confrontoOfferta(offerta, righe, 2, "2026-11-06").confrontabile,
    ).toBe(false),
  );
  it("non confronta una fornitura incompleta con una completa", () =>
    expect(
      confrontoOfferta(f, { totale: 10, righeCoperte: 1 }, 2, "2026-11-06")
        .confrontabile,
    ).toBe(false));
  it("un’offerta a corpo include già il trasporto nel totale", () =>
    expect(
      confrontoOfferta(
        { ...f, totale_offerto: 120 },
        { totale: 120, righeCoperte: 2, daRighe: false },
        2,
        "2026-11-06",
      ),
    ).toMatchObject({ totale: 120, coerente: true, confrontabile: true }));
});
describe("attività da completare", () => {
  it("non chiama scaduta una consegna prevista per oggi", () =>
    expect(
      attivitaOda({
        status: "confermato",
        prezziPendenti: 0,
        righe: 1,
        email: "a@b.it",
        consegna: "2026-11-06",
        conferma: true,
        oggi: "2026-11-06",
      }),
    ).toEqual([]));
  it("un ordine ricevuto non chiede di inviare o sollecitare la merce", () =>
    expect(
      attivitaOda({
        status: "ricevuto",
        prezziPendenti: 0,
        righe: 1,
        consegna: "2026-01-01",
        conferma: false,
        oggi: "2026-11-06",
      }),
    ).toEqual([]));
  it("i prezzi pendenti non spariscono quando la merce è ricevuta", () =>
    expect(
      attivitaOda({
        status: "ricevuto",
        prezziPendenti: 2,
        righe: 2,
        conferma: true,
      }),
    ).toHaveLength(1));
  it("distingue richiesta non inviata, attesa e risposta incompleta", () => {
    const a = attivitaRdo({
      status: "in_valutazione",
      righe: 2,
      oggi: "2026-11-06",
      fornitori: [
        { nome: "A", status: "da_inviare", copertura: 0 },
        { nome: "B", status: "inviata", copertura: 0 },
        { nome: "C", status: "risposta", copertura: 1, scadenza: "2026-11-05" },
      ],
    });
    expect(a.map((x) => x.titolo)).toEqual([
      "Richiedi l’offerta a A",
      "In attesa di B",
      "Offerta incompleta: C",
      "Offerta scaduta: C",
    ]);
  });
  it.each(["annullata", "aggiudicata"])(
    "una RDO %s non propone solleciti",
    (status) =>
      expect(attivitaRdo({ status, righe: 0, fornitori: [] })).toEqual([]),
  );
});
it("lo storico mostra i campi modificati ed esclude timestamp e identificativi tecnici", () =>
  expect(
    modificheEvento({
      before: { unit_price: 10, id: "x", updated_at: "ieri" },
      after: { unit_price: 15, id: "x", updated_at: "oggi" },
    }),
  ).toEqual([{ campo: "Prezzo unitario", prima: 10, dopo: 15 }]));
it("il contesto assente non altera le email degli altri moduli", () =>
  expect(serializeProcurement(undefined)).toBeNull());
