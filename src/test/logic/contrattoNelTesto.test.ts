import { describe, expect, it } from "vitest";
import { parseContractExtract } from "@/lib/orders/contractExtract";
import { cercaNelTesto, daControllare, variantiData, variantiImporto, verificaContrattoNelTesto } from "@/lib/orders/contrattoNelTesto";
import { chiaviContratto, confronta, punteggio } from "@/lib/ai/bancoProva";

const pagine = [
  "CONTRATTO DI APPALTO tra la Edil Rossi S.r.l. e il sig. Mario Bianchi, C.F. BNCMRA70A01H501U, residente in Roma. " +
    "Il corrispettivo è fissato in € 48.500,00 oltre IVA al 10%. I lavori inizieranno il 15/01/2027 e termineranno entro il 30 giugno 2027.",
  "Pagamenti: acconto alla firma € 14.550,00 (30%); SAL intermedio € 19.400; saldo a fine lavori 33.950,00 euro? no: saldo € 14.550,00. Roma, 2 dicembre 2026.",
];
const letto = parseContractExtract({
  cliente: { nome_completo: "Mario Bianchi", codice_fiscale: "BNCMRA70A01H501U" },
  importo_totale_eur: 48500, iva_pct: 10, importo_totale_ivato_eur: 53350,
  data_documento: "2026-12-02", data_inizio_lavori: "2027-01-15", data_fine_lavori: "2027-06-30",
  fasi_pagamento: [
    { descrizione: "Acconto", percentuale: 30, importo_eur: 14550 },
    { descrizione: "SAL", percentuale: 40, importo_eur: 19400 },
    { descrizione: "Saldo", percentuale: 30, importo_eur: 15550 },
  ],
});

describe("contratto ricontrollato sul testo del PDF", () => {
  it("scrive gli importi e le date come in un contratto italiano", () => {
    expect(variantiImporto(48500)).toEqual(expect.arrayContaining(["48.500,00", "48.500", "48500"]));
    expect(variantiData("2027-06-30")).toEqual(expect.arrayContaining(["30/06/2027", "30 giugno 2027"]));
    // 8.500 non si trova dentro 48.500.
    expect(cercaNelTesto(pagine, variantiImporto(8500))).toBeNull();
  });

  it("trova pagina e citazione; l'importo sbagliato resta da controllare, il totale con IVA no", () => {
    const v = verificaContrattoNelTesto(letto, pagine);
    const per = Object.fromEntries(v.campi.map((c) => [c.chiave, c]));
    expect(per["importo"].pagina).toBe(1);
    expect(per["iva"].pagina).toBe(1);
    expect(per["fine"].pagina).toBe(1);
    expect(per["data_documento"].pagina).toBe(2);
    expect(per["rata.2"].pagina).toBe(2);
    expect(per["cliente.nome"].pagina).toBe(1);
    expect(per["rata.3"].pagina).toBeNull();
    expect(daControllare(v).map((c) => c.chiave)).toEqual(["rata.3"]);
  });

  it("un PDF senza testo (scansione) non dà avvisi", () => {
    expect(verificaContrattoNelTesto(letto, ["", " "])).toEqual({ campi: [], senzaTesto: true });
  });
});

describe("banco di prova", () => {
  it("conta giusti, sbagliati, mancanti e inventati", () => {
    const campi = confronta(
      { "cliente.nome": "Bianchi Mario", importo: 48500, "rata.3": 14550, "cliente.piva": null, inizio: "2027-01-15", cup: "J12B" },
      chiaviContratto(letto),
    );
    const per = Object.fromEntries(campi.map((c) => [c.chiave, c.esito]));
    expect(per).toEqual({ "cliente.nome": "giusto", importo: "giusto", "rata.3": "sbagliato", "cliente.piva": "giusto", inizio: "giusto", cup: "mancante" });
    expect(punteggio(campi)).toMatchObject({ giusti: 4, totale: 6, percentuale: 66.7 });
    expect(confronta({ "cliente.piva": null }, { "cliente.piva": "01234567890" })[0].esito).toBe("inventato");
  });
});

describe("importi da esempio", () => {
  it("1.234,56 su una voce si segnala: è il numero d'esempio delle istruzioni", async () => {
    const { contractCoherenceWarnings } = await import("@/lib/orders/contractExtract");
    const e = parseContractExtract({ importo_totale_eur: 1798.59, voci: [{ descrizione: "Serramento 002 EKO", quantita: 1, prezzo_unitario_eur: 1234.56 }, { descrizione: "Serramento 017", quantita: 1, prezzo_unitario_eur: 564.03 }] });
    expect(contractCoherenceWarnings(e).join(" ")).toContain("Serramento 002 EKO");
  });
});
