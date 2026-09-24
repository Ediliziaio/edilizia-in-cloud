// Regole di legge che il calcolo della fattura deve rispettare (24/09/2026):
// bollo sulla parte senza IVA, IVA per cassa solo dove c'è IVA, e le diciture
// che l'XML deve portare per IVA per cassa e scissione dei pagamenti.
import { describe, it, expect } from "vitest";
import {
  calcolaRiga,
  calcolaRiepilogoIVA,
  importoSoggettoABollo,
  shouldSuggestBollo,
  validateDocumento,
} from "@/lib/fatturazione/calcoli";
import { generateXML } from "../../../supabase/functions/_shared/generateXML";
import type { RigaDocumento } from "@/types/fatturazione";

const riga = (importo: number, aliquota: string, natura?: string): RigaDocumento =>
  calcolaRiga({
    id: `r${importo}${natura ?? ""}`, numero_linea: 1, descrizione: "Voce", quantita: 1, unita_misura: "PZ",
    prezzo_unitario: importo, aliquota_iva: aliquota, natura_iva: natura, imponibile: 0, imposta: 0, totale_riga: 0,
  } as never);

describe("bollo da 2 euro (DPR 642/72)", () => {
  it("fattura mista: lavori al 22% e 100 euro esenti → bollo dovuto", () => {
    const righe = [riga(5000, "22"), riga(100, "0", "N4")];
    expect(importoSoggettoABollo(righe)).toBe(100);
    expect(shouldSuggestBollo(righe)).toBe(true);
  });

  it("la soglia è sulla parte senza IVA: 77,47 no, 77,48 sì", () => {
    expect(shouldSuggestBollo([riga(77.47, "0", "N2_2")])).toBe(false);
    expect(shouldSuggestBollo([riga(77.48, "0", "N2_2")])).toBe(true);
  });

  it("lettera d'intento (N3.5) sì; esportazioni, intracomunitarie e reverse charge no", () => {
    expect(shouldSuggestBollo([riga(1000, "0", "N3_5")])).toBe(true);
    expect(shouldSuggestBollo([riga(1000, "0", "N3_1")])).toBe(false);
    expect(shouldSuggestBollo([riga(1000, "0", "N3_2")])).toBe(false);
    expect(shouldSuggestBollo([riga(10000, "0", "N6_3")])).toBe(false);
    expect(shouldSuggestBollo([riga(10000, "0", "N6_7")])).toBe(false);
  });

  it("una fattura tutta con IVA non paga il bollo, qualunque sia il totale", () => {
    expect(shouldSuggestBollo([riga(100000, "22")])).toBe(false);
  });
});

describe("IVA per cassa (art. 32-bis DL 83/2012)", () => {
  it("esigibilità differita sulle righe con IVA, immediata su esenti e reverse charge", () => {
    const r = calcolaRiepilogoIVA([riga(1000, "22"), riga(200, "0", "N4"), riga(500, "0", "N6_3")], { esigibilitaDefault: "D" });
    expect(r.find((x) => x.aliquota === "22")?.esigibilita).toBe("D");
    expect(r.find((x) => x.natura === "N4")?.esigibilita).toBe("I");
    expect(r.find((x) => x.natura === "N6_3")?.esigibilita).toBe("I");
  });

  it("a un cliente privato non si applica: avviso nell'editor", () => {
    const avvisi = validateDocumento({
      tipo: "fattura",
      esigibilita_iva: "D",
      cliente_snapshot: { ragione_sociale: "Mario Rossi", codice_fiscale: "RSSMRA80A01G888X" } as never,
      righe: [riga(1000, "22")],
    });
    expect(avvisi.some((a) => a.field === "esigibilita_iva")).toBe(true);
    const b2b = validateDocumento({
      tipo: "fattura",
      esigibilita_iva: "D",
      cliente_snapshot: { ragione_sociale: "Cliente Srl", partita_iva: "12345678903" } as never,
      righe: [riga(1000, "22")],
    });
    expect(b2b.some((a) => a.field === "esigibilita_iva")).toBe(false);
  });
});

describe("diciture nell'XML", () => {
  const azienda = {
    ragione_sociale: "Impresa Srl", partita_iva: "01941970939", codice_fiscale: "01941970939", regime_fiscale: "RF01",
    indirizzo_via: "Via Roma 1", indirizzo_cap: "33170", indirizzo_comune: "Pordenone", indirizzo_provincia: "PN", indirizzo_nazione: "IT",
  };
  const cliente = {
    ragione_sociale: "Cliente Srl", partita_iva: "12345678903", codice_sdi: "ABC1234",
    indirizzo_via: "Via Po 1", indirizzo_cap: "10100", indirizzo_comune: "Torino", indirizzo_provincia: "TO", indirizzo_nazione: "IT",
  };
  const doc = (esigibilita: "I" | "D" | "S", extra: Record<string, unknown> = {}) => {
    const righe = [riga(1000, "22")];
    return {
      tipo: "fattura", numero: "FT-2026-0001", data_emissione: "2026-09-24", cliente_snapshot: cliente, righe,
      riepilogo_iva: calcolaRiepilogoIVA(righe, { esigibilitaDefault: esigibilita, splitPayment: esigibilita === "S" }),
      imponibile_totale: 1000, totale_documento: 1220, ...extra,
    };
  };
  const causali = (xml: string) =>
    Array.from(new DOMParser().parseFromString(xml, "application/xml").getElementsByTagName("Causale")).map((c) => c.textContent ?? "");

  it("IVA per cassa: la dicitura dell'art. 32-bis", () => {
    const c = causali(generateXML(doc("D"), azienda, "00001"));
    expect(c.some((t) => /32-bis/.test(t))).toBe(true);
  });

  it("scissione dei pagamenti: la dicitura dell'art. 17-ter", () => {
    const c = causali(generateXML(doc("S"), azienda, "00001"));
    expect(c.some((t) => /17-ter/.test(t))).toBe(true);
  });

  it("esigibilità immediata: nessuna dicitura in più; scritta a mano: non si ripete", () => {
    expect(causali(generateXML(doc("I"), azienda, "00001"))).toEqual([]);
    const c = causali(generateXML(doc("D", { causale: ["IVA per cassa art. 32-bis DL 83/2012"] }), azienda, "00001"));
    expect(c.filter((t) => /32-bis/.test(t))).toHaveLength(1);
  });
});

describe("termine di emissione (art. 21 c. 4 DPR 633/72)", () => {
  const giorniFa = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const avviso = (data: string, tipo = "fattura", stato = "bozza") =>
    validateDocumento({ tipo: tipo as never, stato: stato as never, data_emissione: data, righe: [riga(100, "22")] })
      .some((a) => a.field === "data_emissione");

  it("bozza con la data di 20 giorni fa: avviso", () => {
    expect(avviso(giorniFa(20))).toBe(true);
  });
  it("entro 12 giorni, fattura differita o già emessa: niente avviso", () => {
    expect(avviso(giorniFa(12))).toBe(false);
    expect(avviso(giorniFa(20), "fattura_riepilogativa")).toBe(false);
    expect(avviso(giorniFa(20), "fattura", "emessa")).toBe(false);
  });
});

