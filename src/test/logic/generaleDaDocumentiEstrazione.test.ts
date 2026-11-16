// Lotti 1, 3 e 5 di docs/piano-commessa-generale-da-documenti.md: riconoscimento delle pagine,
// lettura delle risposte del modello, piano di scrittura. Dati inventati.
import { describe, expect, it } from "vitest";
import { riconosciPagina, documentoDalNome } from "@/lib/orders/generali/daDocumenti/pagine";
import { dataIso, datiDaRisposta, gruppiDiPagine, istruzioniEstrazione, numeroItaliano, unisciDati, type Gruppo } from "@/lib/orders/generali/daDocumenti/estrazione";
import { datiDaStrutturati } from "@/lib/orders/generali/daDocumenti/strutturati";
import { BOZZA_VUOTA, bozzaDa, mancaPerCreare, pianoDiScrittura, valoriConfermati, type BozzaCostruisci } from "@/lib/orders/generali/daDocumenti/scritture";
import { fotoDaDb, letturaFerma, type RigaLettura } from "@/lib/orders/generali/daDocumenti/foto";
import type { DatiLetti, Occorrenza } from "@/lib/orders/generali/daDocumenti/controlli";

describe("riconoscere una pagina", () => {
  it("documento d'identità e autocertificazione si escludono", () => {
    expect(riconosciPagina("REPUBBLICA ITALIANA carta d'identità n. CA00000AA. Cognome PROVA Nome MARIO nato a ROMA il 01/01/1970, cittadinanza italiana, scadenza 2030").esclusa).toBe(true);
    expect(riconosciPagina("Dichiarazione sostitutiva di certificazione ai sensi del DPR 445/2000: il sottoscritto Mario Prova, nato a Roma il 01/01/1970, residente in via Prova").esclusa).toBe(true);
  });
  it("un contratto con i dati di nascita del firmatario NON si esclude", () => {
    const r = riconosciPagina("Art. 1 – Oggetto. Tra le parti: il sig. Mario Prova, nato a Roma il 01/01/1970, in qualità di legale rappresentante dell'appaltatore");
    expect(r.esclusa).toBe(false);
    expect(r.classe).toBe("Articolato");
  });
  it("polizza, verbale, computo, pagina quasi vuota", () => {
    expect(riconosciPagina("Polizza n. 123 — somma assicurata partita 1").classe).toBe("Polizza");
    expect(riconosciPagina("VERBALE DI CONSEGNA DEI LAVORI in via d'urgenza").classe).toBe("Verbale di consegna");
    expect(riconosciPagina("COMPUTO METRICO ESTIMATIVO — riporto 12.000,00").classe).toBe("Computo metrico");
    expect(riconosciPagina("  - 3 -  ").classe).toBe("Pagina quasi vuota");
  });
  it("il nome del file propone il tipo di documento", () => {
    expect(documentoDalNome("Computo.xpwe")).toBe("computo");
    expect(documentoDalNome("Verbale consegna lavori.pdf")).toBe("verbale_consegna");
    expect(documentoDalNome("Polizza CAR.pdf")).toBe("polizze");
    expect(documentoDalNome("scansione 001.pdf")).toBe("contratto");
  });
});

describe("numeri e date all'italiana", () => {
  it("numeri", () => {
    expect(numeroItaliano("€ 1.234.567,89")).toBe(1234567.89);
    expect(numeroItaliano("365000,5")).toBe(365000.5);
    expect(numeroItaliano("1,234,567.89")).toBe(1234567.89);
    expect(numeroItaliano("12,5%")).toBe(12.5);
    expect(numeroItaliano("dodici")).toBeNull();
  });
  it("date", () => {
    expect(dataIso("01/03/2027")).toBe("2027-03-01");
    expect(dataIso("1-3-27")).toBe("2027-03-01");
    expect(dataIso("2027-02-30")).toBeNull();
  });
});

const g = (testi: string[], file = "Contratto.pdf"): Gruppo => ({
  fileId: "f1", fileNome: file, caratteri: 0, pagine: testi.map((t, i) => ({ fileId: "f1", fileNome: file, numero: i + 1, testo: t })),
});

describe("gruppi di pagine", () => {
  it("stesso file, fino al tetto, mai una pagina tagliata a metà fra due gruppi", () => {
    const pagine = [1, 2, 3, 4].map((n) => ({ fileId: "f1", fileNome: "a.pdf", numero: n, testo: "x".repeat(400) }));
    const altri = [{ fileId: "f2", fileNome: "b.pdf", numero: 1, testo: "y" }];
    const gr = gruppiDiPagine([...pagine, ...altri], 1000);
    expect(gr.map((x) => x.pagine.map((p) => p.numero))).toEqual([[1, 2], [3, 4], [1]]);
  });
});

describe("leggere la risposta del modello", () => {
  const gruppo = g(["Art. 3 – L'importo contrattuale è di euro 365.000,00 oltre IVA.", "La penale è pari allo 0,5 per mille al giorno."]);
  it("tiene i campi del catalogo con pagina giusta, controlla la citazione", () => {
    const r = datiDaRisposta("appalto_pubblico", gruppo, JSON.stringify({ campi: [
      { chiave: "importo_contrattuale", valore: "365.000,00", pagina: 1, citazione: "l'importo contrattuale è di euro 365.000,00" },
      { chiave: "penale_permille", valore: 0.5, pagina: 2, citazione: "frase che non c'è" },
      { chiave: "inventato", valore: 1, pagina: 1, citazione: "x" },
      { chiave: "cig", valore: "Z1A2B3C4D5", pagina: 9, citazione: "pagina fuori dal gruppo" },
      { chiave: "conti_dedicati", valore: "IT00…", pagina: 1, citazione: "x" },
    ] }));
    expect(r.dati.importo_contrattuale[0]).toMatchObject({ valore: 365000, pagina: 1, certezza: "letto", file: "Contratto.pdf" });
    expect(r.dati.penale_permille[0].certezza).toBe("dedotto");
    expect(r.dati.inventato).toBeUndefined();
    expect(r.dati.cig).toBeUndefined();
    expect(r.dati.conti_dedicati).toBeUndefined();
    expect(r.scartati).toBe(3);
  });
  it("una risposta rotta non lancia", () => {
    expect(datiDaRisposta("appalto_pubblico", gruppo, "non è json").dati).toEqual({});
    expect(datiDaRisposta("appalto_pubblico", gruppo, "```json\n{\"campi\":[]}\n```").avvisi).toEqual([]);
  });
  it("unire non ripete la stessa occorrenza", () => {
    const o: Occorrenza = { valore: 1, file: "a", pagina: 1, citazione: "", certezza: "letto" };
    expect(unisciDati({ x: [o] }, { x: [o, { ...o, pagina: 2 }] }).x).toHaveLength(2);
  });
  it("le istruzioni contengono le chiavi e non i campi esclusi", () => {
    const t = istruzioniEstrazione("appalto_pubblico");
    expect(t).toContain("importo_contrattuale");
    expect(t).toContain("cig_accordo");
    expect(t).not.toContain("conti_dedicati");
  });
});

describe("file strutturati", () => {
  it("il computo dà il totale, la sicurezza il suo", () => {
    const d = datiDaStrutturati({
      f1: { formato: "xpwe", documento: "computo", totale: 400000, oggetto: "Lavori di prova", committente: null, voci: [] },
      f2: { formato: "excel", documento: "sicurezza", totale: 15000, oggetto: null as string | null, committente: null as string | null, voci: [] },
    }, [{ id: "f1", nome: "Computo.xpwe" }, { id: "f2", nome: "Sicurezza.xlsx" }]);
    expect(d.totale_computo[0]).toMatchObject({ valore: 400000, certezza: "calcolato", file: "Computo.xpwe" });
    expect(d.totale_sicurezza[0].valore).toBe(15000);
    expect(d.oggetto[0].valore).toBe("Lavori di prova");
  });
});

const o = (valore: Occorrenza["valore"], pagina = 1): Occorrenza => ({ valore, file: "c.pdf", pagina, citazione: "…", certezza: "letto" });
const datiAppalto = (): DatiLetti => ({
  oggetto: [o("Manutenzione strade di prova")],
  importo_base: [o(400000)], ribasso_pct: [o(12.5)], oneri_sicurezza: [o(15000)], importo_contrattuale: [o(365000)],
  penale_permille: [o(0.5), o(1, 3)], penale_massima_pct: [o(10)], cig: [o("Z1A2B3C4D5")], cup: [o("A12B34C56D78E90")],
  data_consegna: [o("2027-03-01")], data_fine_prevista: [o("2028-02-29")], car_somma_lavori: [o(365000)], rct_massimale: [o(500000)],
  rup: [o("Ing. Mario Prova")], contratto_numero: [o("1234/2027")],
});
const conferma = (b: BozzaCostruisci, ...k: string[]): BozzaCostruisci => ({ ...b, confermati: [...b.confermati, ...k] });

describe("piano di scrittura", () => {
  it("si scrive solo il confermato", () => {
    const b = conferma({ ...BOZZA_VUOTA, clienteId: "c1" }, "importo_base", "ribasso_pct");
    const v = valoriConfermati("appalto_pubblico", datiAppalto(), b);
    expect(Object.keys(v).sort()).toEqual(["importo_base", "ribasso_pct"]);
    const p = pianoDiScrittura("appalto_pubblico", datiAppalto(), b);
    expect(p.contratto!.cig).toBeNull();
    expect(p.riferimenti_pa).toEqual([]);
    expect(p.garanzie).toEqual([]);
  });

  it("un conflitto confermato senza scelta non si scrive; con la scelta sì, e la penale va in euro al giorno", () => {
    let b = conferma({ ...BOZZA_VUOTA, clienteId: "c1" }, "penale_permille", "importo_contrattuale");
    expect(pianoDiScrittura("appalto_pubblico", datiAppalto(), b).contratto!.penale_giornaliera).toBeNull();
    b = { ...b, scelte: { penale_permille: 1 } };
    // 1‰ di 365.000 = 365 € al giorno
    expect(pianoDiScrittura("appalto_pubblico", datiAppalto(), b).contratto!.penale_giornaliera).toBe(365);
  });

  it("appalto pubblico completo: contratto, garanzie, riferimenti PA, dati", () => {
    const tutte = ["oggetto", "importo_base", "ribasso_pct", "oneri_sicurezza", "importo_contrattuale", "penale_massima_pct", "cig", "cup",
      "data_consegna", "data_fine_prevista", "car_somma_lavori", "rct_massimale", "rup", "contratto_numero"];
    const p = pianoDiScrittura("appalto_pubblico", datiAppalto(), conferma({ ...BOZZA_VUOTA, clienteId: "c1", forma: "singolo" }, ...tutte));
    expect(p.modello).toBe("appalto");
    expect(p.nome).toBe("Manutenzione strade di prova");
    expect(p.valore).toBe(365000);
    expect(p.contratto).toMatchObject({ importo_base: 400000, ribasso_pct: 12.5, oneri_sicurezza: 15000, cig: "Z1A2B3C4D5", data_consegna_lavori: "2027-03-01" });
    expect(p.garanzie).toEqual([{ tipo: "car", importo: 365000, massimale: 500000, note: expect.any(String) }]);
    expect(p.riferimenti_pa[0]).toMatchObject({ tipo: "contratto", numero: "1234/2027", cig: "Z1A2B3C4D5", cup: "A12B34C56D78E90" });
    expect(p.dati).toMatchObject({ inizio: "2027-03-01", fine: "2028-02-29", cliente_id: "c1", appalto: { tipo: "Pubblico", forma: "Contratto singolo", rup: "Ing. Mario Prova" } });
    expect(mancaPerCreare(p, 0)).toEqual([]);
  });

  it("RTI: la commessa vale per la quota, il totale resta nel contratto", () => {
    const p = pianoDiScrittura("appalto_pubblico", datiAppalto(), conferma({ ...BOZZA_VUOTA, clienteId: "c1", quotaPct: 40 }, "importo_base", "ribasso_pct", "oneri_sicurezza", "importo_contrattuale"));
    expect(p.valore).toBe(146000);
    expect(p.contratto).toMatchObject({ importo_base: 160000, oneri_sicurezza: 6000, importo_totale_appalto: 365000, quota_pct: 40 });
  });

  it("privato senza committente non si crea; senza nome nemmeno", () => {
    const p = pianoDiScrittura("appalto_privato", {}, BOZZA_VUOTA);
    expect(mancaPerCreare(p, 2)).toEqual(["il nome della commessa generale", "il committente", "2 scelte o controlli rossi"]);
  });

  it("computo strutturato: elenco prezzi (sicurezza non ribassabile) e fasi per capitolo", () => {
    const s = {
      f1: { formato: "xpwe" as const, documento: "computo", totale: 300, oggetto: null as string | null, committente: null as string | null, voci: [
        { codice: "A.1", descrizione: "Scavo", unita: "mc", quantita: 10, prezzo: 10, importo: 100, capitolo: "Scavi" },
        { codice: "B.1", descrizione: "Asfalto", unita: "mq", quantita: 20, prezzo: 10, importo: 200, capitolo: "Pavimentazioni" },
      ] },
      f2: { formato: "excel" as const, documento: "sicurezza", totale: 50, oggetto: null as string | null, committente: null as string | null, voci: [
        { codice: null as string | null, descrizione: "Recinzione", unita: "m", quantita: 5, prezzo: 10, importo: 50, capitolo: null as string | null },
      ] },
    };
    const conRibasso = conferma({ ...BOZZA_VUOTA, nome: "x" }, "ribasso_pct");
    const p = pianoDiScrittura("appalto_pubblico", { ribasso_pct: [o(25)] }, conRibasso, s);
    expect(p.elenco.map((e) => [e.codice, e.soggetto_ribasso])).toEqual([["A.1", true], ["B.1", true], [null, false]]);
    // Venduto delle fasi al netto del ribasso; la sicurezza a parte, senza ribasso.
    expect(p.fasi.map((f) => [f.nome, f.voci.reduce((t, x) => t + x.importo, 0)])).toEqual([["Scavi", 75], ["Pavimentazioni", 150], ["Oneri della sicurezza", 50]]);
    const senzaRibasso = pianoDiScrittura("appalto_pubblico", {}, { ...BOZZA_VUOTA, nome: "x" }, s);
    expect(senzaRibasso.fasi).toEqual([]);
    expect(senzaRibasso.note.join(" ")).toContain("conferma prima il ribasso");
    const senza = pianoDiScrittura("appalto_pubblico", {}, { ...BOZZA_VUOTA, nome: "x", conElenco: false, conFasi: false }, s);
    expect(senza.elenco).toEqual([]);
    expect(senza.fasi).toEqual([]);
  });

  it("sviluppo e compravendita vanno nelle loro sezioni", () => {
    const sv = pianoDiScrittura("sviluppo", { titolo_tipo: [o("Permesso di costruire")], catasto: [o("Foglio 1, part. 2")] }, conferma(BOZZA_VUOTA, "titolo_tipo", "catasto"));
    expect(sv.dati).toMatchObject({ area: { catasto: "Foglio 1, part. 2" }, titolo: { tipo: "Permesso di costruire" } });
    const cv = pianoDiScrittura("compravendita", { prezzo_atto: [o(195000)], data_rogito: [o("2027-05-01")] }, conferma(BOZZA_VUOTA, "prezzo_atto", "data_rogito"));
    expect(cv.dati).toMatchObject({ immobile: { prezzo: 195000, data_rogito: "2027-05-01" } });
    expect(cv.contratto).toBeNull();
  });

  it("una bozza rovinata si legge con i valori di partenza", () => {
    expect(bozzaDa(null)).toEqual(BOZZA_VUOTA);
    expect(bozzaDa({ confermati: "x", nome: "a" })).toMatchObject({ nome: "a", confermati: [] });
  });
});

describe("fotografia della lettura vera", () => {
  const riga = (extra: Partial<RigaLettura> = {}): RigaLettura => ({
    id: "l1", tipo: "appalto_pubblico", forma: null, stato: "in_lettura",
    file: [{ id: "f1", nome: "a.pdf", documento: "contratto", percorso: "x", strutturato: false, pagine: 3 }],
    strutturati: {}, stima_eur: 0.1, costo_eur: 0.03, dati: {}, avvisi: [], bozza: {}, generale_id: null, errore: null,
    gruppi_totali: null, gruppi_fatti: 0, avviata_at: "2027-01-01T10:00:00Z", finita_at: null, created_at: "2027-01-01T10:00:00Z", updated_at: "2027-01-01T10:00:00Z", ...extra,
  });
  const pagine = [
    { file_id: "f1", numero: 2, stato: "in_coda" as const, classe: null as string | null, motivo: null as string | null, updated_at: "2027-01-01T10:00:10Z" },
    { file_id: "f1", numero: 1, stato: "ocr" as const, classe: "Articolato" as string | null, motivo: null as string | null, updated_at: "2027-01-01T10:00:10Z" },
    { file_id: "f1", numero: 3, stato: "bianca" as const, classe: null as string | null, motivo: null as string | null, updated_at: "2027-01-01T10:00:10Z" },
  ];
  it("pagine in ordine, fase, costo", () => {
    const f = fotoDaDb(riga(), pagine, Date.parse("2027-01-01T10:00:20Z"));
    expect(f.file[0].pagine.map((p) => [p.numero, p.stato])).toEqual([[1, "ocr"], [2, "in_coda"], [3, "bianca"]]);
    expect(f.fase).toBe("pagine");
    expect(f.costo).toBe(0.03);
    expect(f.finita).toBe(false);
  });
  it("un giro fermo da più di 4 minuti si riconosce", () => {
    expect(letturaFerma(riga(), pagine, Date.parse("2027-01-01T10:03:00Z"))).toBe(false);
    expect(letturaFerma(riga(), pagine, Date.parse("2027-01-01T10:05:00Z"))).toBe(true);
    expect(letturaFerma(riga({ stato: "pronta" }), pagine, Date.parse("2027-01-01T11:00:00Z"))).toBe(false);
  });
});

describe("RTI e capitoli", () => {
  it("in un raggruppamento le fasi valgono per la quota", () => {
    const s = { f1: { formato: "xpwe" as const, documento: "computo", totale: 100, oggetto: null as string | null, committente: null as string | null, voci: [
      { codice: "A", descrizione: "Scavo", unita: "mc", quantita: 1, prezzo: 100, importo: 100, capitolo: "Scavi" as string | null },
    ] } };
    const p = pianoDiScrittura("appalto_pubblico", { ribasso_pct: [o(0)] }, conferma({ ...BOZZA_VUOTA, nome: "x", quotaPct: 40 }, "ribasso_pct"), s);
    expect(p.fasi[0].voci[0].importo).toBe(40);
  });
  it("oltre 60 capitoli lo dice nelle note", () => {
    const voci = Array.from({ length: 61 }, (_, i) => ({ codice: `C${i}`, descrizione: `V${i}`, unita: "n", quantita: 1, prezzo: 1, importo: 1, capitolo: `Cap ${i}` as string | null }));
    const p = pianoDiScrittura("appalto_pubblico", { ribasso_pct: [o(0)] }, conferma({ ...BOZZA_VUOTA, nome: "x" }, "ribasso_pct"), { f1: { formato: "xpwe", documento: "computo", totale: 61, oggetto: null, committente: null, voci } });
    expect(p.fasi).toHaveLength(59);
    expect(p.note.join(" ")).toContain("61 capitoli");
  });
});

describe("accordo quadro", () => {
  it("la generale vale l'importo massimo; il contratto non ha base da ribassare", () => {
    const d: DatiLetti = { ...datiAppalto(), tetto_accordo: [o(2000000)] };
    const p = pianoDiScrittura("appalto_pubblico", d, conferma({ ...BOZZA_VUOTA, clienteId: "c1", forma: "accordo_quadro" }, "tetto_accordo", "importo_base", "ribasso_pct", "oneri_sicurezza", "importo_contrattuale"));
    expect(p.valore).toBe(2000000);
    expect(p.contratto).toMatchObject({ importo_base: null, tetto_accordo: 2000000, ribasso_pct: 12.5, oneri_sicurezza: 0 });
    expect(p.dati).toMatchObject({ appalto: { forma: "Accordo quadro" } });
  });
  it("senza importo massimo confermato vale l'importo contrattuale, e lo dice", () => {
    const p = pianoDiScrittura("appalto_pubblico", datiAppalto(), conferma({ ...BOZZA_VUOTA, clienteId: "c1", forma: "accordo_quadro" }, "importo_contrattuale"));
    expect(p.valore).toBe(365000);
    expect(p.note.join(" ")).toContain("Importo massimo");
    expect(p.note.join(" ")).not.toContain("Base d'asta");
  });
  it("l'applicativo vale il suo importo e porta il CIG derivato nei riferimenti PA", () => {
    const p = pianoDiScrittura("appalto_pubblico", datiAppalto(), conferma({ ...BOZZA_VUOTA, forma: "applicativo", nome: "Applicativo 1" }, "importo_contrattuale", "cig"));
    expect(p.valore).toBe(365000);
    expect(p.riferimenti_pa[0]).toMatchObject({ cig: "Z1A2B3C4D5" });
  });
});

describe("revisione finale del 15/11", () => {
  it("dati personali: IBAN e codici fiscali di persone si coprono, la partita IVA resta", async () => {
    const { mascheraDatiPersonali } = await import("@/lib/orders/generali/daDocumenti/pagine");
    const t = mascheraDatiPersonali("Conto IT60 X054 2811 1010 0000 0123 456, delegato PRVMRA70A01H501Z, P.IVA 01234567890");
    expect(t).toContain("[IBAN]");
    expect(t).toContain("[CODICE FISCALE]");
    expect(t).toContain("01234567890");
    expect(t).not.toContain("PRVMRA70A01H501Z");
  });
  it("il frontespizio di un atto che cita la carta d'identità non si esclude; con «includi» nulla si esclude", () => {
    expect(riconosciPagina("Repertorio n. 12. Avanti a me notaio è presente il sig. Mario Prova, identificato con carta d'identità, che stipula il presente atto di compravendita dell'immobile in via Prova").esclusa).toBe(false);
    const id = "Carta d'identità. Cognome PROVA, nato a Roma il 01/01/1970, rilasciata dal Comune di Prova";
    expect(riconosciPagina(id).esclusa).toBe(true);
    expect(riconosciPagina(id, { includi: true }).esclusa).toBe(false);
  });
  it("percentuali: un punto solo è il decimale, 100 e oltre si rifiutano", async () => {
    const { numeroPercentuale } = await import("@/lib/orders/generali/daDocumenti/estrazione");
    expect(numeroPercentuale("12.345%")).toBe(12.345);
    expect(numeroPercentuale("12,5")).toBe(12.5);
    expect(numeroPercentuale("0,5 per mille")).toBe(0.5);
    expect(numeroPercentuale("125")).toBeNull();
    expect(numeroPercentuale("12.345")).toBe(12.345);
  });
  it("più file di computo si sommano; l'elenco prezzi non entra nei totali", () => {
    const v = (importo: number) => ({ codice: null as string | null, descrizione: "x", unita: "n", quantita: 1, prezzo: importo, importo, capitolo: null as string | null });
    const d = datiDaStrutturati({
      a: { formato: "xpwe", documento: "computo", totale: 100, oggetto: null, committente: null, voci: [v(100)] },
      b: { formato: "excel", documento: "computo", totale: 50, oggetto: null, committente: null, voci: [v(50)] },
      c: { formato: "excel", documento: "elenco_prezzi", totale: 999, oggetto: null, committente: null, voci: [v(999)] },
    }, [{ id: "a", nome: "A.xpwe" }, { id: "b", nome: "B.xlsx" }, { id: "c", nome: "Elenco.xlsx" }]);
    expect(d.totale_computo).toHaveLength(1);
    expect(d.totale_computo[0].valore).toBe(150);
  });
});

describe("prova dal vivo del 16/11", () => {
  it("una pagina con più articoli numerati è l'articolato, anche se cita gli oneri", () => {
    expect(riconosciPagina("Art. 1 - Oggetto dei lavori. Art. 2 - Importo, di cui oneri della sicurezza euro 15.000,00.").classe).toBe("Articolato");
  });
  it("l'accordo quadro porta il CIG dell'accordo nei riferimenti PA; niente avvisi sulla penale o sulla base", () => {
    const d: DatiLetti = { cig_accordo: [o("Y9X8W7V6U5")], contratto_numero: [o("900/2027")], penale_permille: [o(1)], tetto_accordo: [o(2000000)] };
    const p = pianoDiScrittura("appalto_pubblico", d, conferma({ ...BOZZA_VUOTA, clienteId: "c1", forma: "accordo_quadro" }, "cig_accordo", "contratto_numero", "penale_permille", "tetto_accordo"));
    expect(p.riferimenti_pa[0]).toMatchObject({ cig: "Y9X8W7V6U5", numero: "900/2027" });
    expect(p.note.join(" ")).not.toContain("serve l'importo contrattuale");
  });
  it("un applicativo senza importo confermato non si crea; il nome proposto è pulito", async () => {
    const { nomeDaOggetto } = await import("@/lib/orders/generali/daDocumenti/scritture");
    const p = pianoDiScrittura("appalto_pubblico", datiAppalto(), { ...BOZZA_VUOTA, forma: "applicativo", nome: "x" });
    expect(mancaPerCreare(p, 0, true)).toContain("l'importo contrattuale confermato");
    expect(nomeDaOggetto("rifacimento del manto stradale.")).toBe("Rifacimento del manto stradale");
  });
});
