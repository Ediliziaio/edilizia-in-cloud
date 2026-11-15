// Componenti comuni del ciclo acquisti (shared/acquisti): normalizzazione,
// anagrafiche e motore a cinque esiti. Puri: niente database, niente AI.
import { describe, expect, it } from "vitest";
import {
  chiaveFiscale,
  confrontaNumeri,
  dataIso,
  fattoreConversione,
  formaSocietaria,
  identificativoFiscale,
  importo,
  indirizzoConfrontabile,
  nomeConfrontabile,
  numeroDocumento,
  pivaItalianaValida,
  codiceFiscalePersonaValido,
  unitaCanonica,
} from "../../../shared/acquisti/normalizza.ts";
import { risolviAnagrafica, type AnagraficaNota } from "../../../shared/acquisti/anagrafiche.ts";
import { decidi, decidiTraFonti } from "../../../shared/acquisti/riconciliazione.ts";
import { chiaveCollegamento, transizioneAmmessa } from "../../../shared/acquisti/traccia.ts";

describe("identificativi fiscali", () => {
  it("P.IVA italiana: controllo del carattere finale", () => {
    expect(pivaItalianaValida("00743110157")).toBe(true);
    expect(pivaItalianaValida("00743110158")).toBe(false);
    expect(pivaItalianaValida("00000000000")).toBe(false);
  });
  it("codice fiscale di persona: carattere di controllo", () => {
    expect(codiceFiscalePersonaValido("RSSMRA80A01H501U")).toBe(true);
    expect(codiceFiscalePersonaValido("RSSMRA80A01H501X")).toBe(false);
  });
  it("chiave come partner_tax_key: IT si toglie solo davanti a 11 cifre", () => {
    expect(chiaveFiscale("IT 007 431 101 57")).toBe("00743110157");
    expect(chiaveFiscale("it00743110157")).toBe("00743110157");
    expect(chiaveFiscale("DE123456789")).toBe("DE123456789");
  });
  it("secondo il paese", () => {
    expect(identificativoFiscale("00743110157")).toMatchObject({ paese: "IT", tipo: "piva", valido: true });
    expect(identificativoFiscale("DE123456789")).toMatchObject({ paese: "DE", codice: "123456789", chiave: "DE123456789", valido: true });
    expect(identificativoFiscale("123456789", "DE")).toMatchObject({ paese: "DE", chiave: "DE123456789", valido: true });
    expect(identificativoFiscale("ATU12345678")).toMatchObject({ paese: "AT", valido: true });
    expect(identificativoFiscale("12345", "US")).toMatchObject({ paese: "US", valido: null });
    expect(identificativoFiscale("RSSMRA80A01H501U")).toMatchObject({ paese: "IT", tipo: "cf_persona", valido: true });
    expect(identificativoFiscale("")).toBeNull();
  });
});

describe("nomi, date, importi, unità", () => {
  it("nomi e forme societarie", () => {
    expect(nomeConfrontabile("Edil Rossi S.r.l.")).toBe(nomeConfrontabile("EDIL ROSSI SRL"));
    expect(nomeConfrontabile("Ditta Bianchi Snc di Bianchi & C.")).toBe("bianchi bianchi c");
    expect(formaSocietaria("Alfa S.r.l.s.")).toBe("SRLS");
    expect(formaSocietaria("Beta S.p.A.")).toBe("SPA");
    expect(formaSocietaria("Gamma Soc. Coop. a r.l.")).toBe("COOP");
    expect(nomeConfrontabile("Caffè Società")).toBe("caffe");
  });
  it("date", () => {
    expect(dataIso("2026-11-15")).toBe("2026-11-15");
    expect(dataIso("15/11/2026")).toBe("2026-11-15");
    expect(dataIso("15-11-26")).toBe("2026-11-15");
    expect(dataIso("15.11.2026")).toBe("2026-11-15");
    expect(dataIso("7 ottobre 2026")).toBe("2026-10-07");
    expect(dataIso("31/02/2026")).toBeNull();
    expect(dataIso("11/15/2026")).toBeNull();
  });
  it("importi", () => {
    expect(importo("1.234,56")).toBe(1234.56);
    expect(importo("1,234.56")).toBe(1234.56);
    expect(importo("€ 12,5")).toBe(12.5);
    expect(importo("-3,00")).toBe(-3);
    expect(importo("(3,00)")).toBe(-3);
    expect(importo("1.234")).toBe(1234);
    expect(importo("1,234")).toBe(1.234);
    expect(importo("1.234.567")).toBe(1234567);
    expect(importo("abc")).toBeNull();
  });
  it("unità e conversioni: ml è il metro lineare; famiglie diverse solo se autorizzate", () => {
    expect(unitaCanonica("ml")).toBe("M");
    expect(unitaCanonica("m²")).toBe("MQ");
    expect(unitaCanonica("Nr.")).toBe("PZ");
    expect(unitaCanonica("cad")).toBe("PZ");
    expect(fattoreConversione("kg", "t")).toBe(0.001);
    expect(fattoreConversione("SACCHI", "KG")).toBeNull();
    expect(fattoreConversione("bancale", "sacchi", [{ da: "BANCALE", a: "SACCO", fattore: 60 }])).toBe(60);
    expect(fattoreConversione("sacchi", "bancale", [{ da: "BANCALE", a: "SACCO", fattore: 60 }])).toBeCloseTo(1 / 60);
    expect(fattoreConversione("bancale", "sacchi", [{ da: "BANCALE", a: "SACCO", fattore: 60, codiceArticolo: "X1" }], "Y2")).toBeNull();
  });
  it("indirizzi", () => {
    expect(indirizzoConfrontabile("V.le Roma n. 12, 20100 Milano")).toBe(indirizzoConfrontabile("Viale Roma 12 Milano"));
    expect(indirizzoConfrontabile("P.zza Garibaldi, 3")).toBe("piazza garibaldi 3");
  });
});

describe("numeri di documento", () => {
  it("prefissi, zeri, anno e serie", () => {
    expect(numeroDocumento("DDT n. 001068/2026")).toMatchObject({ chiave: "1068", anno: 2026, serie: null });
    expect(numeroDocumento("1068/26")).toMatchObject({ chiave: "1068", anno: 2026 });
    expect(numeroDocumento("9.363")).toMatchObject({ chiave: "9363", anno: null });
    expect(numeroDocumento("2026/000123")).toMatchObject({ chiave: "123", anno: 2026 });
    expect(numeroDocumento("ODA-2026-0039")).toMatchObject({ chiave: "39", anno: 2026, serie: "ODA" });
    expect(numeroDocumento("A/123")).toMatchObject({ chiave: "123", serie: "A" });
    expect(numeroDocumento("123 del 07/09/2026")).toMatchObject({ chiave: "123" });
  });
  it("i riferimenti che non dicono niente non sono numeri", () => {
    for (const v of [".", "NO.ORD.", "MARIO ROSSI", "N.D.", "-", "0000", "COME DA ACCORDI", ""]) expect(numeroDocumento(v)).toBeNull();
  });
  it("confronto: anno e serie dove scritti su entrambi", () => {
    expect(confrontaNumeri(numeroDocumento("1068/2026"), numeroDocumento("1068"))).toBe("compatibile");
    expect(confrontaNumeri(numeroDocumento("1068/2026"), numeroDocumento("1068/2025"))).toBe("diverso");
    expect(confrontaNumeri(numeroDocumento("A/12"), numeroDocumento("B/12"))).toBe("diverso");
    expect(confrontaNumeri(numeroDocumento("0012"), numeroDocumento("12"))).toBe("uguale");
  });
});

describe("motore a cinque esiti", () => {
  const id = (campo: string) => ({ campo, ruolo: "identifica" as const, esito: "uguale" as const, testo: campo });
  it("unico e verificato → automatico solo se la regola lo permette", () => {
    expect(decidi([{ id: "a", prove: [id("numero")] }], { automaticoConsentito: true }).esito).toBe("automatico");
    expect(decidi([{ id: "a", prove: [id("numero")] }]).esito).toBe("proposta");
  });
  it("più verificati → scelta", () => {
    expect(decidi([{ id: "a", prove: [id("n")] }, { id: "b", prove: [id("n")] }], { automaticoConsentito: true }).esito).toBe("scelta");
  });
  it("conflitto su un identificativo essenziale: nessuna somiglianza compensa", () => {
    const d = decidi(
      [
        {
          id: "a",
          prove: [
            id("numero_ordine"),
            { campo: "nome", ruolo: "indizio", esito: "uguale", testo: "nome" },
            { campo: "importo", ruolo: "conferma", esito: "uguale", testo: "importo" },
            { campo: "fornitore", ruolo: "conferma", esito: "diverso", essenziale: true, testo: "altro fornitore" },
          ],
        },
        { id: "b", prove: [id("numero_ordine")] },
      ],
      { automaticoConsentito: true },
    );
    expect(d.esito).toBe("conflitto");
    expect(d.sceltoId).toBeNull();
  });
  it("nessuno con i dati che mancano", () => {
    expect(decidi([], { datiUtili: ["piva"] })).toMatchObject({ esito: "nessuno", mancanti: ["piva"] });
  });
  it("solo indizi → proposta, mai automatico", () => {
    expect(decidi([{ id: "a", prove: [{ campo: "nome", ruolo: "indizio", esito: "uguale", testo: "nome" }] }], { automaticoConsentito: true }).esito).toBe("proposta");
  });
  it("fonti: forte contro debole = conflitto; due deboli = scelta", () => {
    expect(
      decidiTraFonti([
        { valore: "A", fonte: "ordine", forte: true, testo: "ordine" },
        { valore: "B", fonte: "indirizzo", forte: false, testo: "indirizzo" },
      ]).esito,
    ).toBe("conflitto");
    expect(
      decidiTraFonti([
        { valore: "A", fonte: "indirizzo", forte: false, testo: "x" },
        { valore: "B", fonte: "indirizzo", forte: false, testo: "y" },
      ]).esito,
    ).toBe("scelta");
    expect(decidiTraFonti([{ valore: "A", fonte: "ordine", forte: true, testo: "o" }, { valore: "A", fonte: "ddt", forte: true, testo: "d" }], { automaticoConsentito: true }).esito).toBe("automatico");
  });
});

describe("anagrafiche senza doppioni", () => {
  const rubrica: AnagraficaNota[] = [
    { id: "s1", nome: "Edil Rossi S.r.l.", piva: "00743110157", ibanVerificati: ["IT60X0542811101000000123456"] },
    { id: "s2", nome: "Edil Rossi Srl", piva: "01234567897" },
    { id: "s3", nome: "Bianchi Legnami", piva: "02345678906", codiceFiscale: "BNCMRA70A01H501X", aliasVerificati: ["Legnami Bianchi Mario"] },
  ];
  it("stessa P.IVA → automatico, anche con nome scritto diverso; il nome nuovo diventa un alias da proporre", () => {
    const r = risolviAnagrafica({ piva: "IT00743110157", nome: "ROSSI EDILIZIA" }, rubrica);
    expect(r).toMatchObject({ esito: "automatico", sceltoId: "s1" });
    expect(r.azioni.aliasDaProporre).toBe("ROSSI EDILIZIA");
  });
  it("solo il nome: due omonimi → scelta, mai un'unione", () => {
    expect(risolviAnagrafica({ nome: "EDIL ROSSI SRL" }, rubrica).esito).toBe("scelta");
  });
  it("stesso nome con un'altra P.IVA: esclusa, segnalata come omonima, si può creare", () => {
    const r = risolviAnagrafica({ nome: "Edil Rossi", piva: "03456789019" }, rubrica);
    expect(r.esito).toBe("nessuno");
    expect(r.azioni.creaNuova).toBe(true);
    expect(r.azioni.omonimiConAltroIdentificativo.sort()).toEqual(["s1", "s2"]);
  });
  it("stessa P.IVA ma codice fiscale discordante → conflitto, niente creazione", () => {
    const r = risolviAnagrafica({ piva: "02345678906", codiceFiscale: "RSSMRA80A01H501U" }, rubrica);
    expect(r.esito).toBe("conflitto");
    expect(r.azioni.identificativiDiscordanti).toEqual([{ campo: "codice_fiscale", letto: "RSSMRA80A01H501U", inRubrica: "BNCMRA70A01H501X" }]);
    expect(r.azioni.creaNuova).toBe(false);
  });
  it("IBAN nuovo letto sul documento: da verificare, non cambia niente", () => {
    const r = risolviAnagrafica({ piva: "00743110157", iban: "IT02A0301503200000003517230" }, rubrica);
    expect(r.esito).toBe("automatico");
    expect(r.azioni.ibanDaVerificare).toBe("IT02A0301503200000003517230");
    const stesso = risolviAnagrafica({ piva: "00743110157", iban: "IT60 X054 2811 1010 0000 0123 456" }, rubrica);
    expect(stesso.azioni.ibanDaVerificare).toBeNull();
  });
  it("alias verificato senza P.IVA → proposta", () => {
    expect(risolviAnagrafica({ nome: "Legnami Bianchi Mario" }, rubrica)).toMatchObject({ esito: "proposta", sceltoId: "s3" });
  });
  it("niente in comune, solo un nome → nessuno e niente creazione", () => {
    expect(risolviAnagrafica({ nome: "Sconosciuta" }, rubrica).azioni.creaNuova).toBe(false);
  });
});

describe("traccia", () => {
  it("chiave di idempotenza stabile, transizioni distinte", () => {
    const c = { companyId: "c", da: { tipo: "riga_fattura" as const, id: "f", riga: "3" }, a: { tipo: "ddt" as const, id: "d" }, regola: "r" };
    expect(chiaveCollegamento(c)).toBe("c|riga_fattura:f#3|ddt:d|r");
    expect(transizioneAmmessa("collegato", "pagato")).toBe(false);
    expect(transizioneAmmessa("approvato_pagamento", "pagato")).toBe(true);
    expect(transizioneAmmessa("pagato", "annullato")).toBe(false);
  });
});
