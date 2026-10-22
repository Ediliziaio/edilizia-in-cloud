import { describe, expect, it } from "vitest";
import { abbinaProfilo, completaNomi, type ProfiloPerAbbinamento, leggiPagina, numeroIT, periodoPrevalente, raggruppaPagine, riconosciProgramma } from "@/lib/paghe/lettoreBustePaga";

// Righe come le estrae pdfjs da un Libro Unico Zucchetti (dati inventati).
const busta = (cf: string, nome: string, mese: string, conNetto = true) => [
  "CodicesAzienda | RagionesSociale",
  "009999 | EDILE PROVA S.R.L.",
  "CodicesFiscale | PosizionesInps | P.A.T.sInail | Filiale/Dipendenza",
  "12345678901 | 4995906084/02 | 097134705/28",
  "PERIODOsDIsRETRIBUZIONE",
  `TipoCosto : | ${mese}`,
  "Codicesdipendente | COGNOMEsEsNOME | CodicesFiscale | sMatricola",
  `0000001 | ${nome} | ${cf}`,
  "* * Z00001 Retribuzione | 11,83185 | 164,00000 ORE | 1.940,42",
  "* | Z00000 Contributo IVS | 1.993,00 | 9,19000 | % | 183,16",
  "* | Z00141 FIS D.Lgs.148/2015 <5 dip. Ridotto | 1.993,00 | 0,10000 | % | 1,99",
  "F03020 Ritenute IRPEF | 298,51",
  "F06020 Ritenute IRPEF | Tass.aut. | 2025 | 78,31",
  ...(conNetto ? ["RATEI | TOTALEsCOMPETENZE | 2.094,54", "TOTALEsTRATTENUTE | 484,37"] : ["RATEI | TOTALEsCOMPETENZE", "TOTALEsTRATTENUTE"]),
  "NETTOsDELsMESE",
  ...(conNetto ? ["1.611,00 €"] : []),
  "COMUNICAZIONI",
  "sModellospersprocedure sdellasZUCCHETTIsdisLodis",
];

const presenze = (cf: string) => [
  "AZIENDA", "EDILE PROVA S.R.L.",
  "PERIODO DI RIFERIMENTO | CODICE FISCALE | P.A.T. INAIL",
  `Marzo | 2025 | ${cf} | 097134705/28 | Lavoro dipendente`,
  "GIORNO | ORE | GIUSTIFICATIVI | TIMBRATURE",
  "LU | 3 | 8,00",
];

const riepilogo = ["PERIODOsDIsRETRIBUZIONE", "Marzo 2025", "***** RIEPILOGO GENERALE *****", "NETTOsDELsMESE", "NUMERO DIPENDENTI - | 2 | 2.134,00 €"];

const CF_A = "RSSMRA80A01F205X";
const CF_B = "BNCLRA85M41L219K";

describe("lettura del Libro Unico", () => {
  it("numeri all'italiana, anche negativi col meno in fondo", () => {
    expect(numeroIT("1.611,00")).toBe(1611);
    expect(numeroIT("0,83")).toBe(0.83);
    expect(numeroIT("14,33-")).toBe(-14.33);
    expect(numeroIT("-14,33")).toBe(-14.33);
  });

  it("un netto senza punto delle migliaia resta intero (1611,00 non è 611,00)", () => {
    const righe = busta(CF_A, "ROSSI MARIO", "Marzo 2025").map((r) => (r === "1.611,00 €" ? "1611,00 €" : r));
    expect(leggiPagina(righe, 0).netto).toBe(1611);
  });

  it("il mese è quello del periodo di retribuzione, non un altro citato prima", () => {
    const righe = ["Data assunzione | Gennaio 2024", ...busta(CF_A, "ROSSI MARIO", "Marzo 2025")];
    expect(leggiPagina(righe, 0)).toMatchObject({ mese: 3, anno: 2025 });
  });

  it("una busta: persona, mese e importi (contributi = trattenute in %, IRPEF senza la tassazione separata)", () => {
    const p = leggiPagina(busta(CF_A, "ROSSI MARIO", "Marzo 2025"), 0);
    expect(p).toMatchObject({
      tipo: "cedolino", codiceFiscale: CF_A, nome: "ROSSI MARIO", anno: 2025, mese: 3,
      netto: 1611, lordo: 2094.54, trattenute: 484.37, ritenute_irpef: 298.51, contributi_dipendente: 185.15,
    });
  });

  it("riconosce foglio presenze e riepilogo, che restano all'azienda", () => {
    expect(leggiPagina(presenze(CF_A), 0)).toMatchObject({ tipo: "presenze", codiceFiscale: CF_A, mese: 3, anno: 2025 });
    expect(leggiPagina(riepilogo, 0)).toMatchObject({ tipo: "riepilogo", codiceFiscale: null });
  });

  it("regge i PDF risalvati che spezzano le parole lettera per lettera", () => {
    const righe = busta(CF_B, "BIANCHI LAURA", "Marzo 2025").map((r) =>
      r.replace("TOTALEsCOMPETENZE", "TOTALE | COMPETENZE").replace("NETTOsDELsMESE", "N | E | T | T | O | D | E | L | M | E | S | E"));
    expect(leggiPagina(righe, 0)).toMatchObject({ tipo: "cedolino", lordo: 2094.54, netto: 1611 });
  });

  it("una busta su due pagine è un documento solo; le persone diverse no", () => {
    const pagine = [
      presenze(CF_A),
      busta(CF_A, "ROSSI MARIO", "Marzo 2025", false),
      busta(CF_A, "ROSSI MARIO", "Marzo 2025"),
      busta(CF_B, "BIANCHI LAURA", "Marzo 2025"),
      riepilogo, riepilogo,
    ].map((r, i) => leggiPagina(r, i));
    const docs = completaNomi(raggruppaPagine(pagine));
    expect(docs.map((d) => [d.tipo, d.pagine])).toEqual([
      ["presenze", [0]], ["cedolino", [1, 2]], ["cedolino", [3]], ["riepilogo", [4, 5]],
    ]);
    expect(docs[1].netto).toBe(1611);
    // Il foglio presenze prende il nome dalla busta della stessa persona.
    expect(docs[0].nome).toBe("ROSSI MARIO");
    expect(periodoPrevalente(docs)).toEqual({ anno: 2025, mese: 3 });
    expect(riconosciProgramma(pagine.length ? busta(CF_A, "X", "Marzo 2025").join("\n") : "")).toBe("Zucchetti");
  });
});

describe("a chi va il documento", () => {
  const profili: ProfiloPerAbbinamento[] = [
    { id: "p1", nome: "Mario", cognome: "Rossi", codice_fiscale: null, employee_id: "e1", user_id: "u1" },
    { id: "p2", nome: "Laura", cognome: "Bianchi", codice_fiscale: CF_B, employee_id: "e2", user_id: null },
    { id: "p3", nome: "Luca", cognome: "Verdi", codice_fiscale: null, employee_id: null, user_id: null },
    { id: "p4", nome: "Luca", cognome: "Verdi", codice_fiscale: null, employee_id: null, user_id: null },
  ];

  it("prima per codice fiscale, poi per nome e cognome in qualunque ordine", () => {
    expect(abbinaProfilo({ codiceFiscale: CF_B, nome: "NOME SBAGLIATO" }, profili)).toMatchObject({ profilo: { id: "p2" }, per: "codice_fiscale" });
    expect(abbinaProfilo({ codiceFiscale: CF_A, nome: "ROSSI MARIO" }, profili)).toMatchObject({ profilo: { id: "p1" }, per: "nome" });
  });

  it("un nome di due persone non si indovina, e un codice fiscale diverso non è la stessa persona", () => {
    expect(abbinaProfilo({ codiceFiscale: null, nome: "VERDI LUCA" }, profili)).toBeNull();
    expect(abbinaProfilo({ codiceFiscale: CF_A, nome: "BIANCHI LAURA" }, profili)).toBeNull();
  });
});
