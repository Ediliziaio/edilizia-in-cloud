import { describe, expect, it } from "vitest";
import {
  andamentoMese, feriali, filtraRapportini, giorniDelMese, intensita, mappaMese, meseValido, nomeCantiere, oreDi,
  perCantiere, perGiorno, perPersona, personeDi, righeCsv, spostaMese, totaliRapportini, type RapportinoRiga,
} from "@/lib/orders/rapportiniMese";

const riga = (r: Partial<RapportinoRiga> & { id: string }): RapportinoRiga => ({
  order_id: "o1", data_lavoro: "2026-09-02", stato: "approvato", order: { client_name: "Rossi", order_code: "ORD-1" }, ...r,
});

const squadra = [
  { employee_id: "a", nome: "Anna", ore: 8 },
  { employee_id: "b", nome: "Bruno", ore: 6 },
  { subappaltatore_id: "d", nome: "Ditta Tetti", ore: 8 },
];

describe("le ore di un rapportino", () => {
  it("con le presenze contano i dipendenti, non la ditta né la colonna dell'autore", () => {
    expect(oreDi(riga({ id: "1", ore_lavorate: 8, presenze: squadra }))).toBe(14);
  });
  it("senza presenze contano le ore dell'autore, straordinario compreso", () => {
    expect(oreDi(riga({ id: "1", ore_lavorate: 7.5, ore_straordinario: 1, presenze: null }))).toBe(8.5);
  });
  it("una ditta è presente ma senza ore, e chi compila senza presenze è la persona", () => {
    const persone = personeDi(riga({ id: "1", presenze: squadra }));
    expect(persone.find((p) => p.nome === "Ditta Tetti")).toMatchObject({ ditta: true, ore: 0 });
    expect(personeDi(riga({ id: "2", ore_lavorate: 5, operaio: { first_name: "Marco", last_name: "Neri" } }))[0]).toMatchObject({ nome: "Marco Neri", ore: 5 });
    expect(personeDi(riga({ id: "3", ore_lavorate: 5 }))[0].nome).toBe("Non indicato");
  });
});

describe("il nome del cantiere", () => {
  it("il cliente, poi il lavoro, poi il codice", () => {
    expect(nomeCantiere({ order: { client_name: " Rossi ", description: "Tetto", order_code: "X" } })).toBe("Rossi");
    expect(nomeCantiere({ order: { client_name: null, description: "Tetto", order_code: "X" } })).toBe("Tetto");
    expect(nomeCantiere({ order: { order_code: "X" } })).toBe("X");
    expect(nomeCantiere({ order: null })).toBe("Commessa non disponibile");
  });
});

describe("i numeri del mese", () => {
  const righe = [
    riga({ id: "1", presenze: squadra, costo_manodopera: 300, foto_urls: ["a", "b"] }),
    riga({ id: "2", order_id: "o2", order: { client_name: "Verdi" }, stato: "inviato", data_lavoro: "2026-09-03", presenze: [{ employee_id: "a", nome: "Anna", ore: 4 }] }),
    riga({ id: "3", order_id: "o3", order: { client_name: "Bianchi" }, stato: "rifiutato", data_lavoro: "2026-09-04", presenze: [{ employee_id: "c", nome: "Carlo", ore: 8 }], foto_urls: ["c"] }),
    riga({ id: "4", order_id: "o3", stato: "bozza", data_lavoro: "2026-09-05", ore_lavorate: 8 }),
  ];

  it("rifiutati e bozze restano in elenco ma non contano", () => {
    expect(totaliRapportini(righe)).toEqual({
      rapportini: 2, ore: 18, cantieri: 2, persone: 2, giorni: 2, daApprovare: 1, rifiutati: 1, foto: 2, costo: 300, conCosto: 1,
    });
  });
  it("«Non indicato» tiene le ore ma non fa numero fra le persone", () => {
    const t = totaliRapportini([riga({ id: "1", ore_lavorate: 8 }), riga({ id: "2", ore_lavorate: 8, operaio: { first_name: "Marco" } })]);
    expect(t).toMatchObject({ persone: 1, ore: 16 });
    const senzaNome = totaliRapportini([riga({ id: "3", presenze: [{ employee_id: "a", nome: "", ore: 8 }] })]);
    expect(senzaNome).toMatchObject({ persone: 1, ore: 8 });
  });
  it("le divisioni tornano fra loro anche con i quarti d'ora", () => {
    const quarti = [1, 2].map((n) => riga({ id: String(n), presenze: [{ employee_id: "a", nome: "Anna", ore: 7.25 }] }));
    expect(totaliRapportini(quarti).ore).toBe(14.5);
    expect(perCantiere(quarti)[0].ore).toBe(14.5);
    expect(perPersona(quarti)[0].ore).toBe(14.5);
    const { righe: mappa } = mappaMese(quarti);
    expect(mappa[0].ore).toBe(14.5);
    expect(mappa[0].celle["2026-09-02"].ore).toBe(14.5);
  });
  it("per giorno: dal più recente, con tutte le righe e i totali di quelle buone", () => {
    const giorni = perGiorno(righe);
    expect(giorni.map((g) => g.data)).toEqual(["2026-09-05", "2026-09-04", "2026-09-03", "2026-09-02"]);
    expect(giorni[1]).toMatchObject({ ore: 0, contati: 0, cantieri: 0 });
    expect(giorni[1].righe).toHaveLength(1);
    expect(giorni[3]).toMatchObject({ ore: 14, contati: 1, cantieri: 1 });
  });
  it("per cantiere: prima chi ha più ore; da approvare e ultimo giorno", () => {
    const cantieri = perCantiere(righe);
    expect(cantieri[0]).toMatchObject({ orderId: "o1", nome: "Rossi", codice: "ORD-1", ore: 14, rapportini: 1, persone: 2, costo: 300, ultimo: "2026-09-02" });
    expect(cantieri[1]).toMatchObject({ orderId: "o2", ore: 4, daApprovare: 1 });
    expect(cantieri.find((c) => c.orderId === "o3")).toMatchObject({ ore: 0, rapportini: 0, ultimo: null });
  });
  it("per persona: i giorni e i cantieri di ognuno, senza i rifiutati", () => {
    const persone = perPersona(righe);
    expect(persone[0]).toMatchObject({ nome: "Anna", ore: 12, giorni: 2, cantieri: 2, ultimo: "2026-09-03" });
    expect(persone.find((p) => p.nome === "Ditta Tetti")).toMatchObject({ ditta: true, ore: 0, giorni: 1 });
    expect(persone.some((p) => p.nome === "Carlo")).toBe(false);
  });
  it("la mappa: ore per cantiere e giorno, col massimo per la scala", () => {
    const { righe: mappa, massimo } = mappaMese(righe);
    expect(mappa.map((r) => r.orderId)).toEqual(["o1", "o2"]);
    expect(mappa[0].celle["2026-09-02"]).toEqual({ ore: 14, rapportini: 1 });
    expect(massimo).toBe(14);
    expect([intensita(0, 14), intensita(3, 14), intensita(7, 14), intensita(10, 14), intensita(14, 14)]).toEqual([0, 1, 2, 3, 4]);
    expect(intensita(0, 0)).toBe(0);
  });
  it("l'andamento ha tutti i giorni del mese, anche quelli vuoti", () => {
    const punti = andamentoMese(righe, "2026-09");
    expect(punti).toHaveLength(30);
    expect(punti[1]).toMatchObject({ data: "2026-09-02", ore: 14, rapportini: 1, feriale: true });
    expect(punti[3]).toMatchObject({ data: "2026-09-04", ore: 0 });
    expect(punti[4]).toMatchObject({ data: "2026-09-05", feriale: false });
  });
});

describe("i filtri", () => {
  const righe = [
    riga({ id: "1", presenze: squadra, descrizione_lavori: "Posa guaina" }),
    riga({ id: "2", order_id: "o2", order: { client_name: "Verdi" }, stato: "inviato", data_lavoro: "2026-09-03", presenze: [{ employee_id: "c", nome: "Carla", ore: 4 }] }),
  ];
  const ids = (f: Parameters<typeof filtraRapportini>[1]) => filtraRapportini(righe, f).map((r) => r.id);
  it("per giorno, cantiere, stato e persona", () => {
    expect(ids({ giorno: "2026-09-03" })).toEqual(["2"]);
    expect(ids({ cantiere: "o1" })).toEqual(["1"]);
    expect(ids({ stato: "inviato" })).toEqual(["2"]);
    expect(ids({ persona: "e:a" })).toEqual(["1"]);
    expect(ids({ persona: "d:d" })).toEqual(["1"]);
  });
  it("la ricerca guarda lavoro, cantiere e persone, senza distinguere le maiuscole", () => {
    expect(ids({ testo: "GUAINA" })).toEqual(["1"]);
    expect(ids({ testo: "verdi" })).toEqual(["2"]);
    expect(ids({ testo: "carla" })).toEqual(["2"]);
    expect(ids({ testo: "niente" })).toEqual([]);
  });
});

describe("l'esportazione", () => {
  const righe = [
    riga({ id: "2", data_lavoro: "2026-09-03", stato: "rifiutato", ore_lavorate: 7.5, costo_manodopera: 1234.5, descrizione_lavori: "=SOMMA(A1)" }),
    riga({ id: "1", presenze: squadra }),
  ];
  it("dal più vecchio, con date e numeri all'italiana", () => {
    const csv = righeCsv(righe, true);
    expect(csv[0]).toMatchObject({ data: "02/09/2026", cantiere: "Rossi", codice: "ORD-1", ore: "14", stato: "Approvato", costo: "", persone: "Anna, Bruno, Ditta Tetti" });
    expect(csv[1]).toMatchObject({ data: "03/09/2026", ore: "7,5", stato: "Rifiutato", costo: "1234,5" });
  });
  it("senza il permesso sui costi il costo non c'è proprio", () => {
    expect(righeCsv(righe, false).every((r) => !("costo" in r))).toBe(true);
  });
});

describe("il mese", () => {
  it("riconosce solo un mese vero", () => {
    expect(meseValido("2026-09")).toBe(true);
    for (const v of ["2026-13", "2026-9", "x", "", null]) expect(meseValido(v)).toBe(false);
  });
  it("conta i giorni giusti, bisestili compresi, e attraversa l'anno", () => {
    expect(giorniDelMese("2028-02")).toHaveLength(29);
    expect(giorniDelMese("2026-02").at(-1)).toBe("2026-02-28");
    expect(spostaMese("2026-01", -1)).toBe("2025-12");
    expect(spostaMese("2026-12", 1)).toBe("2027-01");
  });
  it("i feriali si fermano a oggi", () => {
    expect(feriali("2026-09", "2026-09-30")).toBe(22);
    expect(feriali("2026-09", "2026-09-04")).toBe(4);
    expect(feriali("2026-09", "2026-08-31")).toBe(0);
  });
});
