// Dati del registro imprese sulle fatture delle società (art. 2250 c.c.):
// il blocco <IscrizioneREA> e il controllo che ferma l'invio se mancano.
import { describe, it, expect } from "vitest";
import {
  datiReaMancanti,
  eSocieta,
  eSocietaDiCapitali,
  formaGiuridica,
  iscrizioneRea,
} from "../../../supabase/functions/_shared/datiSocietari";
import { generateXML } from "../../../supabase/functions/_shared/generateXML";

const renova = {
  ragione_sociale: "RENOVA SOLUTION S.R.L.",
  partita_iva: "01941970939",
  codice_fiscale: "01941970939",
  regime_fiscale: "RF01",
  forma_giuridica: "SRL",
  indirizzo_via: "Via Revedole 78/B",
  indirizzo_cap: "33170",
  indirizzo_comune: "Pordenone",
  indirizzo_provincia: "PN",
  indirizzo_nazione: "IT",
};

describe("forme giuridiche", () => {
  it("riconosce le società come le scrive la pagina Impostazioni e come le scrive la gente", () => {
    expect(formaGiuridica("S.r.l.")).toBe("SRL");
    expect(eSocieta("SRL")).toBe(true);
    expect(eSocieta("S.a.s.")).toBe(true);
    expect(eSocieta("Cooperativa")).toBe(true);
    expect(eSocieta("Ditta Individuale")).toBe(false);
    expect(eSocieta("Libero Professionista")).toBe(false);
    expect(eSocieta(null)).toBe(false);
    expect(eSocietaDiCapitali("SRLS")).toBe(true);
    expect(eSocietaDiCapitali("SNC")).toBe(false);
  });
});

describe("iscrizioneRea", () => {
  it("numero e ufficio scritti a parte", () => {
    expect(iscrizioneRea({ ...renova, codice_rea: "123456", rea_ufficio: "PN", capitale_sociale: 10000, socio_unico: true }))
      .toEqual({ ufficio: "PN", numero: "123456", capitale: 10000, socioUnico: "SU", stato: "LN" });
  });

  it("«PN-123456» come nelle visure: ufficio e numero separati", () => {
    const r = iscrizioneRea({ ...renova, codice_rea: "pn-123456" })!;
    expect(r.ufficio).toBe("PN");
    expect(r.numero).toBe("123456");
  });

  it("senza ufficio vale la provincia della sede; senza numero niente blocco", () => {
    expect(iscrizioneRea({ ...renova, codice_rea: "123456" })!.ufficio).toBe("PN");
    expect(iscrizioneRea({ ...renova, codice_rea: "  " })).toBeNull();
  });

  it("socio unico solo per S.r.l. e S.p.A.; liquidazione quando c'è", () => {
    expect(iscrizioneRea({ ...renova, forma_giuridica: "SAS", codice_rea: "1", capitale_sociale: 5000, socio_unico: true })!.socioUnico).toBeNull();
    expect(iscrizioneRea({ ...renova, codice_rea: "1", capitale_sociale: 5000, socio_unico: false })!.socioUnico).toBe("SM");
    expect(iscrizioneRea({ ...renova, codice_rea: "1", stato_liquidazione: "LS" })!.stato).toBe("LS");
  });
});

describe("datiReaMancanti: cosa ferma l'invio", () => {
  it("una S.r.l. senza REA né capitale: due motivi, con dove inserirli", () => {
    const m = datiReaMancanti(renova);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatch(/Numero REA mancante.*art\. 2250/);
    expect(m[1]).toMatch(/Capitale sociale versato mancante/);
  });

  it("una S.n.c. ha bisogno del REA ma non del capitale", () => {
    expect(datiReaMancanti({ ...renova, forma_giuridica: "SNC" })).toHaveLength(1);
    expect(datiReaMancanti({ ...renova, forma_giuridica: "SNC", codice_rea: "98765" })).toEqual([]);
  });

  it("ditta individuale e professionista: nessun obbligo", () => {
    expect(datiReaMancanti({ ...renova, forma_giuridica: "Ditta Individuale" })).toEqual([]);
    expect(datiReaMancanti({ ...renova, forma_giuridica: "Libero Professionista" })).toEqual([]);
  });

  it("S.r.l. completa: niente da segnalare", () => {
    expect(datiReaMancanti({ ...renova, codice_rea: "PN-123456", capitale_sociale: "10000" })).toEqual([]);
  });
});

describe("il blocco nell'XML", () => {
  const doc = {
    tipo: "fattura",
    numero: "FT-2026-0001",
    data_emissione: "2026-09-24",
    cliente_snapshot: {
      ragione_sociale: "Cliente Srl", partita_iva: "12345678903", codice_sdi: "ABC1234",
      indirizzo: "Via Po 1", cap: "10100", comune: "Torino", provincia: "TO", nazione: "IT",
    },
    righe: [{ numero_linea: 1, descrizione: "Posa", quantita: 1, prezzo_unitario: 100, imponibile: 100, aliquota_iva: "22", imposta: 22, totale_riga: 122 }],
    riepilogo_iva: [{ aliquota: "22", imponibile: 100, imposta: 22 }],
    imponibile_totale: 100,
    totale_documento: 122,
  };
  const leggi = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");

  it("con i dati: ufficio, numero, capitale, socio unico e stato nell'ordine dello schema", () => {
    const xml = leggi(generateXML(doc, { ...renova, codice_rea: "123456", capitale_sociale: 10000, socio_unico: true }, "00001"));
    const rea = xml.getElementsByTagName("IscrizioneREA")[0];
    expect(Array.from(rea.children).map((c) => c.tagName)).toEqual(["Ufficio", "NumeroREA", "CapitaleSociale", "SocioUnico", "StatoLiquidazione"]);
    expect(rea.getElementsByTagName("CapitaleSociale")[0].textContent).toBe("10000.00");
  });

  it("senza numero REA il blocco non esce (e invia-sdi ferma la fattura prima)", () => {
    const xml = leggi(generateXML(doc, renova, "00001"));
    expect(xml.getElementsByTagName("IscrizioneREA")).toHaveLength(0);
  });
});
