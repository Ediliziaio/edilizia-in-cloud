// La lettura delle bollette dall'XML (shared/bollette/lettura.ts) e il giro del server che le
// registra (supabase/functions/bollette-riconosci/handler.ts). Nessuna AI, nessun servizio esterno.
import { describe, expect, it, vi } from "vitest";
import { leggiBolletta, periodoDaMese, sembraBolletta } from "../../../shared/bollette/lettura.ts";
import { giroBollette } from "../../../supabase/functions/bollette-riconosci/handler";

type Riga = { n: number; descr: string; totale: number; codice?: [string, string]; dal?: string; al?: string; qta?: number; um?: string; altri?: [string, string] };
function xml(righe: Riga[], testata: { causale?: string; contratto?: string; collegate?: string[]; tipo?: string } = {}) {
  const linee = righe.map((r) => `<DettaglioLinee><NumeroLinea>${r.n}</NumeroLinea>${r.codice ? `<CodiceArticolo><CodiceTipo>${r.codice[0]}</CodiceTipo><CodiceValore>${r.codice[1]}</CodiceValore></CodiceArticolo>` : ""}
    <Descrizione>${r.descr}</Descrizione>${r.qta != null ? `<Quantita>${r.qta}</Quantita>` : ""}${r.um ? `<UnitaMisura>${r.um}</UnitaMisura>` : ""}
    ${r.dal ? `<DataInizioPeriodo>${r.dal}</DataInizioPeriodo>` : ""}${r.al ? `<DataFinePeriodo>${r.al}</DataFinePeriodo>` : ""}
    <PrezzoUnitario>${r.totale}</PrezzoUnitario><PrezzoTotale>${r.totale}</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA>
    ${r.altri ? `<AltriDatiGestionali><TipoDato>${r.altri[0]}</TipoDato><RiferimentoTesto>${r.altri[1]}</RiferimentoTesto></AltriDatiGestionali>` : ""}</DettaglioLinee>`).join("");
  return `<p:FatturaElettronica xmlns:p="x"><FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>${testata.tipo ?? "TD01"}</TipoDocumento>
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
