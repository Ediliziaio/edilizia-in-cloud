// La lettura delle bollette dall'XML (shared/bollette/lettura.ts) e il giro del server che le
// registra (supabase/functions/bollette-riconosci/handler.ts). Nessuna AI, nessun servizio esterno.
import { describe, expect, it, vi } from "vitest";
import { leggiBolletta, periodoDaMese, periodoDalTesto, sembraBolletta } from "../../../shared/bollette/lettura.ts";
import { giroBollette } from "../../../supabase/functions/bollette-riconosci/handler";

type Riga = { n: number; descr: string; totale: number; codice?: [string, string]; dal?: string; al?: string; qta?: number; um?: string; altri?: [string, string] | Array<[string, string]> };
function xml(righe: Riga[], testata: { causale?: string; contratto?: string; collegate?: string[]; tipo?: string; piva?: string; cliente?: string } = {}) {
  const linee = righe.map((r) => `<DettaglioLinee><NumeroLinea>${r.n}</NumeroLinea>${r.codice ? `<CodiceArticolo><CodiceTipo>${r.codice[0]}</CodiceTipo><CodiceValore>${r.codice[1]}</CodiceValore></CodiceArticolo>` : ""}
    <Descrizione>${r.descr}</Descrizione>${r.qta != null ? `<Quantita>${r.qta}</Quantita>` : ""}${r.um ? `<UnitaMisura>${r.um}</UnitaMisura>` : ""}
    ${r.dal ? `<DataInizioPeriodo>${r.dal}</DataInizioPeriodo>` : ""}${r.al ? `<DataFinePeriodo>${r.al}</DataFinePeriodo>` : ""}
    <PrezzoUnitario>${r.totale}</PrezzoUnitario><PrezzoTotale>${r.totale}</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA>
    ${(r.altri ? (Array.isArray(r.altri[0]) ? r.altri as Array<[string, string]> : [r.altri as [string, string]]) : []).map((a) => `<AltriDatiGestionali><TipoDato>${a[0]}</TipoDato><RiferimentoTesto>${a[1]}</RiferimentoTesto></AltriDatiGestionali>`).join("")}</DettaglioLinee>`).join("");
  const cedente = testata.piva ? `<FatturaElettronicaHeader><CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${testata.piva}</IdCodice></IdFiscaleIVA></DatiAnagrafici>${testata.cliente ? `<RiferimentoAmministrazione>${testata.cliente}</RiferimentoAmministrazione>` : ""}</CedentePrestatore></FatturaElettronicaHeader>` : "";
  return `<p:FatturaElettronica xmlns:p="x">${cedente}<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>${testata.tipo ?? "TD01"}</TipoDocumento>
    ${testata.causale ? `<Causale>${testata.causale}</Causale>` : ""}</DatiGeneraliDocumento>
    ${testata.contratto ? `<DatiContratto><IdDocumento>${testata.contratto}</IdDocumento></DatiContratto>` : ""}
    ${(testata.collegate ?? []).map((c) => `<DatiFattureCollegate><IdDocumento>${c}</IdDocumento></DatiFattureCollegate>`).join("")}
    </DatiGenerali><DatiBeniServizi>${linee}</DatiBeniServizi></FatturaElettronicaBody></p:FatturaElettronica>`;
}
const POD1 = "IT001E02621799";
const POD2 = "IT012E00000042";
const PDR = "00881234567890";
const sett = { dal: "2026-09-01", al: "2026-09-30" };

describe("lettura della bolletta dall'XML", () => {
  it("POD nelle righe: periodo, consumo in kWh, importo; la riga del bollo senza codice va all'unica utenza", () => {
    const b = leggiBolletta(xml([
      { n: 1, descr: "Spesa per la vendita di energia", totale: 60, codice: ["POD", POD1], ...sett, qta: 1, um: "PdP" },
      { n: 2, descr: "Oneri di sistema", totale: 30, codice: ["POD", POD1], ...sett, qta: 1146, um: "kWh", altri: ["Ind.POD", "Via Roma 3, Torino"] },
      { n: 3, descr: "Bollo", totale: 2 },
    ]));
    expect(b.utenze).toEqual([expect.objectContaining({
      codice: POD1, tipo_utenza: "luce", periodo_dal: "2026-09-01", periodo_al: "2026-09-30", consumo: 1146, importo: 92, indirizzo: "Via Roma 3, Torino", righe: [1, 2, 3],
    })]);
  });

  it("più utenze nello stesso documento, luce e gas: le righe comuni si ripartiscono in proporzione", () => {
    const b = leggiBolletta(xml([
      { n: 1, descr: "Energia", totale: 75, codice: ["POD", POD1], ...sett },
      { n: 2, descr: "Gas naturale", totale: 25, codice: ["PDR", PDR], ...sett, qta: 80, um: "Smc" },
      { n: 3, descr: "Canone", totale: 4 },
    ]));
    expect(b.utenze.map((u) => [u.codice, u.tipo_utenza, u.importo])).toEqual([[POD1, "luce", 78], [PDR, "gas", 26]]);
    expect(b.utenze.reduce((t, u) => t + u.importo, 0)).toBe(104);
  });

  it("POD solo nella causale o al posto del contratto: tutto il documento è di quell'utenza; periodo dal mese scritto", () => {
    const b = leggiBolletta(xml([{ n: 1, descr: "Fornitura energia", totale: 78.59 }], { causale: "Fattura per la fornitura di energia elettrica consumi gennaio 2025", contratto: POD2 }));
    expect(b.utenze).toEqual([expect.objectContaining({ codice: POD2, importo: 78.59, periodo_dal: "2025-01-01", periodo_al: "2025-01-31" })]);
  });

  it("letture stimate o effettive, conguaglio, nota di credito con la fattura che storna", () => {
    expect(leggiBolletta(xml([{ n: 1, descr: "Consumi stimati", totale: 10, codice: ["POD", POD1] }])).utenze[0].letture).toBe("stimate");
    expect(leggiBolletta(xml([{ n: 1, descr: "Consumi da letture effettive", totale: 10, codice: ["POD", POD1] }])).utenze[0].letture).toBe("effettive");
    expect(leggiBolletta(xml([{ n: 1, descr: "Conguaglio consumi", totale: -20, codice: ["POD", POD1] }])).tipo).toBe("conguaglio");
    expect(leggiBolletta(xml([{ n: 1, descr: "Storno", totale: -10, codice: ["POD", POD1] }], { tipo: "TD04", collegate: ["FT-10"] })).fatture_collegate).toEqual(["FT-10"]);
  });

  it("PDR riconosciuto anche nel testo, ma solo se etichettato: un numero di 14 cifre qualunque non è un PDR", () => {
    expect(leggiBolletta(xml([{ n: 1, descr: `Fornitura gas PDR: ${PDR}`, totale: 10 }])).utenze[0]).toMatchObject({ codice: PDR, tipo_utenza: "gas" });
    expect(leggiBolletta(xml([{ n: 1, descr: "Ordine 12345678901234", totale: 10 }])).utenze).toEqual([]);
    expect(sembraBolletta(xml([{ n: 1, descr: "Ordine 12345678901234", totale: 10 }]))).toBe(false);
  });

  it("mese scritto in lettere", () => {
    expect(periodoDaMese("consumi febbraio 2028")).toEqual({ dal: "2028-02-01", al: "2028-02-29" });
    expect(periodoDaMese("nessun mese")).toBeNull();
  });
});

// Acqua e telefono: casi presi dalle fatture vere (15/11/2026), con codici e indirizzi inventati.
const SMAT = "07937540016";
const CAP = "13187590156";
const WINDTRE = "13378520152";
const FASTWEB = "12878470157";

describe("acqua", () => {
  it("gestore idrico col codice «Fornitura»: una sola utenza acqua, periodo dalla causale, indirizzo col comune", () => {
    const b = leggiBolletta(xml([
      { n: 1, descr: "Acquedotto", totale: 20, altri: [["Fornitura", "0100999900001111"], ["Indirizzo", "VIA DEI PINI, 3"], ["Comune", "Torino"]] },
      { n: 2, descr: "Depurazione", totale: 10 },
      { n: 3, descr: "Acconti bollette precedenti", totale: -5 },
    ], { piva: SMAT, causale: "Bolletta servizio Idrico periodo 02/06/2026 - 01/09/2026" }));
    expect(b.utenze).toEqual([expect.objectContaining({
      codice: "0100999900001111", tipo_utenza: "acqua", importo: 25, periodo_dal: "2026-06-02", periodo_al: "2026-09-01",
      indirizzo: "VIA DEI PINI, 3, Torino", righe: [1, 2, 3],
    })]);
  });

  it("«COD.UTENZA» in una riga sola vale per tutto il documento", () => {
    const b = leggiBolletta(xml([
      { n: 1, descr: "Quota fissa acqua", totale: 12, altri: ["COD.UTENZA", "0009999999"] },
      { n: 2, descr: "Tariffa acquedotto", totale: 30, qta: 18, um: "MC" },
    ], { piva: CAP }));
    expect(b.utenze).toEqual([expect.objectContaining({ codice: "0009999999", tipo_utenza: "acqua", importo: 42, consumo: 18 })]);
  });

  it("dal gestore idrico senza codice (allacciamento, contributo) non è una bolletta", () => {
    expect(leggiBolletta(xml([{ n: 1, descr: "Allacciamento fognario", totale: 900 }], { piva: CAP })).utenze).toEqual([]);
  });

  it("un altro gestore: le parole dell'acqua bastano solo col codice utenza scritto", () => {
    expect(leggiBolletta(xml([{ n: 1, descr: "Servizio idrico integrato - codice utenza: 77001234", totale: 40 }], { piva: "01234567890" })).utenze[0])
      .toMatchObject({ codice: "77001234", tipo_utenza: "acqua" });
    // Un'impresa che fattura lavori di fognatura non è un gestore idrico.
    expect(leggiBolletta(xml([{ n: 1, descr: "Lavori di fognatura via Roma", totale: 4000 }], { piva: "01234567890" })).utenze).toEqual([]);
  });
});

describe("telefono", () => {
  it("codice cliente del gestore: un'utenza per contratto, periodo dalle righe «dal … al …»", () => {
    const righe: Riga[] = [
      { n: 1, descr: "Infinito dal 01/08/2026 al 31/08/2026", totale: 13 },
      { n: 2, descr: "Infinito dal 01/09/2026 al 30/09/2026", totale: 13 },
      { n: 3, descr: "Costi e oneri di invio fattura", totale: 1 },
    ];
    const a = leggiBolletta(xml(righe, { piva: WINDTRE, cliente: "600000001" }));
    expect(a.utenze).toEqual([expect.objectContaining({ codice: "Cliente 600000001", tipo_utenza: "telefono", importo: 27, periodo_dal: "2026-08-01", periodo_al: "2026-09-30" })]);
    // Stesso gestore, altro contratto della stessa azienda: altra utenza.
    expect(leggiBolletta(xml(righe, { piva: WINDTRE, cliente: "5800000002" })).utenze[0].codice).toBe("Cliente 5800000002");
  });

  it("senza codice cliente: il numero di linea, se è uno solo; altrimenti il gestore", () => {
    expect(leggiBolletta(xml([{ n: 1, descr: "Prima Ricarica del 14/10/2026 sul numero 3401234567", totale: 10 }], { piva: FASTWEB })).utenze[0].codice).toBe("Linea 3401234567");
    const b = leggiBolletta(xml([{ n: 1, descr: "Costi fissi", totale: 50 }, { n: 2, descr: "Costi variabili", totale: 6 }],
      { piva: FASTWEB, causale: "Periodo fatturazione: 01 agosto 2026 - 30 settembre 2026" }));
    expect(b.utenze).toEqual([expect.objectContaining({ codice: `Fastweb ${FASTWEB}`, tipo_utenza: "telefono", importo: 56, periodo_dal: "2026-08-01", periodo_al: "2026-09-30" })]);
  });

  it("lo stesso gestore che vende luce: vince il POD", () => {
    const b = leggiBolletta(xml([{ n: 1, descr: "Fornitura energia", totale: 80 }],
      { piva: FASTWEB, causale: "Fattura per la fornitura di energia elettrica consumi gennaio 2026", contratto: POD1 }));
    expect(b.utenze.map((u) => [u.codice, u.tipo_utenza])).toEqual([[POD1, "luce"]]);
  });

  it("i soli telefoni a rate, senza canoni né traffico, non sono una bolletta; né un fornitore qualunque con «abbonamento»", () => {
    expect(leggiBolletta(xml([{ n: 1, descr: "Terminale modello X", totale: 300 }], { piva: WINDTRE, cliente: "600000001" })).utenze).toEqual([]);
    expect(leggiBolletta(xml([{ n: 1, descr: "Abbonamento software gestionale", totale: 30 }], { piva: "01234567890" })).utenze).toEqual([]);
  });
});

describe("filtro veloce e periodi scritti", () => {
  it("sembraBolletta: POD, gestori di acqua e telefono, «servizio idrico»; non un fornitore qualunque", () => {
    expect(sembraBolletta(xml([{ n: 1, descr: "x", totale: 1 }], { piva: WINDTRE }))).toBe(true);
    expect(sembraBolletta(xml([{ n: 1, descr: "x", totale: 1 }], { piva: SMAT }))).toBe(true);
    expect(sembraBolletta(xml([{ n: 1, descr: "Servizio idrico integrato", totale: 1 }], { piva: "01234567890" }))).toBe(true);
    expect(sembraBolletta(xml([{ n: 1, descr: "Cemento", totale: 1 }], { piva: "01234567890" }))).toBe(false);
  });

  it("periodoDalTesto: più righe = dal primo inizio all'ultima fine; date impossibili scartate", () => {
    expect(periodoDalTesto(["dal 01/09/2026 al 30/09/2026", "dal 01/08/2026 al 31/08/2026"])).toEqual({ dal: "2026-08-01", al: "2026-09-30" });
    expect(periodoDalTesto(["periodo 31/02/2026 - 10/03/2026"])).toBeNull();
    expect(periodoDalTesto(["09 dicembre 2025 - 08 febbraio 2026"])).toEqual({ dal: "2025-12-09", al: "2026-02-08" });
  });
});

describe("giro del server delle bollette", () => {
  function db(fatture: Array<{ id: string; xml_raw: string }>, risposta: (args: Record<string, unknown>) => unknown = () => ({ stato: "riconosciuta", costo: { esito: "da_collegare" } })) {
    const chiamate: Array<{ nome: string; args: Record<string, unknown> }> = [];
    return {
      chiamate,
      rpc: async (nome: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> => {
        chiamate.push({ nome, args });
        if (nome === "bollette_da_leggere") return { data: fatture.map((f) => ({ ...f, company_id: "az", indice_corpo: 0 })), error: null };
        if (nome === "bolletta_registra") return { data: risposta(args), error: null };
        return { data: null, error: null };
      },
    };
  }

  it("legge e registra ogni fattura, conta gli esiti e segna il lavoro chiuso senza AI", async () => {
    const d = db([{ id: "f1", xml_raw: xml([{ n: 1, descr: "Energia", totale: 50, codice: ["POD", POD1], ...sett }]) }]);
    const esito = await giroBollette(d);
    expect(esito).toMatchObject({ lette: 1, riconosciute: 1, costi: { da_collegare: 1 }, errori: [] });
    const reg = d.chiamate.find((c) => c.nome === "bolletta_registra")!;
    expect((reg.args.p_lettura as { utenze: Array<{ codice: string }> }).utenze[0].codice).toBe(POD1);
    expect(d.chiamate).toContainEqual(expect.objectContaining({ nome: "registra_esito_lavoro_ai", args: expect.objectContaining({ p_flusso: "bolletta_lettura", p_esito: "senza_ai" }) }));
  });

  it("una fattura che non è una bolletta si registra senza utenze, così non torna al giro dopo", async () => {
    const d = db([{ id: "f2", xml_raw: "<x>niente</x>" }], () => ({ stato: "senza_utenze" }));
    const esito = await giroBollette(d);
    expect(esito.senzaUtenze).toBe(1);
    expect(d.chiamate.find((c) => c.nome === "bolletta_registra")!.args.p_lettura).toEqual({ utenze: [] });
  });

  it("nessuna chiamata esterna", async () => {
    const fetchFinto = vi.fn();
    vi.stubGlobal("fetch", fetchFinto);
    await giroBollette(db([{ id: "f1", xml_raw: xml([{ n: 1, descr: "Energia", totale: 50, codice: ["POD", POD1] }]) }]));
    expect(fetchFinto).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
