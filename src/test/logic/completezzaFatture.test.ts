import { describe, expect, it } from "vitest";
import { buchiNumerazione, fatturePerMese, fuoriSequenza, testoIntervalli, totaleMancanti } from "@/lib/fatturazione/completezzaFatture";
import { chiaveRicevuta, errorePassaggero, identitaFattura, inParallelo, tempoRimanente } from "@/lib/fatturazione/importMassivo";

const d = (numero: string, data = "2026-03-01") => ({ numero, data });

describe("buchi nella numerazione", () => {
  it("trova i numeri saltati, serie per serie", () => {
    const b = buchiNumerazione([d("1/1"), d("1/4"), d("1/5"), d("2/1"), d("2/3")]);
    expect(b.map(testoIntervalli)).toEqual(["1/2 – 1/3", "2/2"]);
    expect(totaleMancanti(b)).toBe(3);
  });
  it("gli anni non si mescolano: la numerazione riparte", () => {
    expect(totaleMancanti(buchiNumerazione([d("1/256", "2025-12-31"), d("1/1", "2026-01-13")]))).toBe(0);
  });
  it("un doppione non è un buco", () => {
    expect(totaleMancanti(buchiNumerazione([d("1/1"), d("1/1"), d("1/2")]))).toBe(0);
  });
  it("numeri nel formato della piattaforma", () => {
    expect(buchiNumerazione([d("FT-2026-0001"), d("FT-2026-0003")])[0].mancanti).toEqual([2]);
  });
  it("un salto enorme è un cambio di numerazione, non un buco", () => {
    expect(totaleMancanti(buchiNumerazione([d("1/1"), d("1/9000")]))).toBe(0);
  });
  it("senza cifre in fondo non si giudica", () => {
    expect(buchiNumerazione([d("Bozza AB")])).toEqual([]);
  });
});

describe("fuori ordine", () => {
  it("segnala il numero alto con la data vecchia", () => {
    const f = fuoriSequenza([d("1/1", "2026-01-10"), d("1/216", "2026-10-28"), d("1/226", "2026-06-30")]);
    expect(f.map((x) => x.numero)).toEqual(["1/226"]);
  });
});

describe("fatture per mese", () => {
  const date = (mese: string, n: number) => Array.from({ length: n }, () => `${mese}-10`);
  const tutte = [...date("2026-01", 2), ...date("2026-02", 20), ...date("2026-03", 22), ...date("2026-04", 21), ...date("2026-05", 24), ...date("2026-06", 3)];
  it("segnala il mese molto sotto la mediana", () => {
    expect(fatturePerMese(tutte, "2026-08-15").filter((m) => m.sospetto).map((m) => m.mese)).toEqual(["2026-06", "2026-07"]);
  });
  it("il mese in corso non si giudica", () => {
    expect(fatturePerMese(tutte, "2026-06-05").find((m) => m.mese === "2026-06")?.sospetto).toBe(false);
  });
  it("il primo mese, spesso parziale, non si giudica", () => {
    expect(fatturePerMese(tutte, "2026-08-15")[0].sospetto).toBe(false);
  });
  it("con pochi mesi non c'è misura", () => {
    expect(fatturePerMese([...date("2026-01", 9), ...date("2026-02", 1)], "2026-03-02").some((m) => m.sospetto)).toBe(false);
  });
});

describe("import massivo", () => {
  const xml = `<p:FatturaElettronica xmlns:p="x"><FatturaElettronicaHeader><CessionarioCommittente><DatiAnagrafici><IdFiscaleIVA><IdCodice>999</IdCodice></IdFiscaleIVA></DatiAnagrafici></CessionarioCommittente><CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>123</IdCodice></IdFiscaleIVA></DatiAnagrafici></CedentePrestatore></FatturaElettronicaHeader><FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Data>2026-03-01</Data><Numero>FPR 8/26</Numero></DatiGeneraliDocumento><DatiDDT><NumeroDDT>7</NumeroDDT></DatiDDT></DatiGenerali></FatturaElettronicaBody></p:FatturaElettronica>`;
  it("legge l'identità dal cedente, non dal cessionario", () => {
    expect(identitaFattura(xml)).toEqual({ cedente: "123", numero: "FPR 8/26", data: "2026-03-01" });
  });
  it("funziona anche coi prefissi su ogni elemento", () => {
    const conPrefisso = "<a:CedentePrestatore><a:IdCodice>5</a:IdCodice></a:CedentePrestatore><a:DatiGeneraliDocumento><a:Data>2026-01-02</a:Data><a:Numero>9</a:Numero></a:DatiGeneraliDocumento>";
    expect(identitaFattura(conPrefisso)).toEqual({ cedente: "5", numero: "9", data: "2026-01-02" });
  });
  it("senza dati non inventa", () => expect(identitaFattura("<x/>")).toBeNull());
  it("la chiave ignora maiuscole e spazi del cedente", () => {
    expect(chiaveRicevuta(" abc ", "1", "2026-01-01T00")).toBe(chiaveRicevuta("ABC", "1", "2026-01-01"));
  });
  it("riprova solo sugli errori passeggeri", () => {
    expect(errorePassaggero("", 503)).toBe(true);
    expect(errorePassaggero("", 422)).toBe(false);
    expect(errorePassaggero("Failed to fetch")).toBe(true);
    expect(errorePassaggero("Fattura rifiutata")).toBe(false);
  });
  it("non supera il parallelo e tiene l'ordine", async () => {
    let attivi = 0; let picco = 0; const avanzamento: number[] = [];
    const r = await inParallelo([1, 2, 3, 4, 5, 6], 2, async (x) => {
      attivi++; picco = Math.max(picco, attivi);
      await new Promise((ok) => setTimeout(ok, 5));
      attivi--; return x * 2;
    }, (n) => avanzamento.push(n));
    expect(r).toEqual([2, 4, 6, 8, 10, 12]);
    expect(picco).toBe(2);
    expect(avanzamento).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("il tempo rimanente", () => {
    expect(tempoRimanente(2, 100, 1000)).toBeNull();
    expect(tempoRimanente(50, 100, 600000)).toBe("circa 10 min");
    expect(tempoRimanente(99, 100, 9900)).toBe("meno di un minuto");
  });
});
