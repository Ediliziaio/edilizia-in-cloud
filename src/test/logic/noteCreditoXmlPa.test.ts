/**
 * Note di credito (TD04) dalla fattura vera all'XML, per privato, azienda e PA
 * (15/11/2026, lotto 0 del piano PA). Dopo Renova: ogni nota passa dallo stesso
 * `creaNotaCredito` che usa l'app, poi dal generatore che usa l'invio, e sull'XML
 * si rifanno i controlli che fa lo SDI (00422, 00423) più esigibilità,
 * riepiloghi, importo da pagare, causale e fattura rettificata.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({ fattura: {} as Record<string, unknown> }));
function catena(): Record<string, unknown> {
  const c: Record<string, unknown> = {
    eq: () => c, not: () => c, is: () => c,
    single: async (): Promise<{ data: unknown; error: null }> => ({ data: stato.fattura, error: null }),
    then: (ok: (v: { data: unknown[]; error: null }) => void) => ok({ data: [], error: null }),
  };
  return c;
}
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => catena() }) } }));

import { creaNotaCredito } from "@/lib/fatturazione/noteCredito";
import { calcolaRiga, calcolaTotaliDocumento } from "@/lib/fatturazione/calcoli";
import { generateXML } from "../../../supabase/functions/_shared/generateXML";

const azienda = {
  ragione_sociale: "IMPRESA PROVA S.R.L.", partita_iva: "01234567897", codice_fiscale: "01234567897",
  indirizzo_via: "Via Roma", indirizzo_numero_civico: "1", indirizzo_cap: "33170", indirizzo_comune: "Pordenone",
  indirizzo_provincia: "PN", indirizzo_nazione: "IT", regime_fiscale: "RF01", codice_sdi: "KRRH6B9", split_payment_pa: true,
};
const indirizzo = { indirizzo_via: "Via Verdi 2", indirizzo_cap: "33080", indirizzo_comune: "Prata", indirizzo_provincia: "PN", indirizzo_nazione: "IT" };
const CLIENTI = {
  privato: { ...indirizzo, tipo_cliente: "B2C", ragione_sociale: "Mario Rossi", nome: "Mario", cognome: "Rossi", codice_fiscale: "RSSMRA80A01H501U" },
  azienda: { ...indirizzo, tipo_cliente: "B2B", ragione_sociale: "Edil Rossi S.r.l.", partita_iva: "01234567897", codice_sdi: "M5UXCR1" },
  PA: { ...indirizzo, tipo_cliente: "PA", ragione_sociale: "Comune di Prova", codice_fiscale: "80012345678", codice_sdi: "UF12AB" },
} as const;

const righe = [
  calcolaRiga({ id: "a", numero_linea: 1, descrizione: "Lavori", quantita: 2, unita_misura: "pz", prezzo_unitario: 450, aliquota_iva: "22", imponibile: 0, imposta: 0, totale_riga: 0 } as never),
  calcolaRiga({ id: "b", numero_linea: 2, descrizione: "Materiali al 10%", quantita: 1, unita_misura: "pz", prezzo_unitario: 333.33, aliquota_iva: "10", imponibile: 0, imposta: 0, totale_riga: 0 } as never),
];

interface Caso { cliente: keyof typeof CLIENTI; split: boolean; ritenuta: boolean; cigCup: boolean }

/** La fattura come è salvata: totali calcolati sulla sua esigibilità. */
function fatturaOriginale(c: Caso): Record<string, unknown> {
  const esig = c.split ? "S" : "I";
  const opz = { splitPayment: c.split, esigibilitaDefault: esig as "I" | "S", ritenutaAcconto: c.ritenuta, ritenutaAliquota: c.ritenuta ? 20 : undefined };
  const t = calcolaTotaliDocumento(righe, opz);
  return {
    id: "f1", tipo: c.cliente === "PA" ? "fattura_pa" : "fattura", numero: "FT-2026-0042", data_emissione: "2026-10-15",
    cliente_snapshot: CLIENTI[c.cliente], righe, esigibilita_iva: esig, metodo_pagamento_codice: "MP05",
    iban_pagamento: "IT60X0542811101000000123456",
    riepilogo_iva: t.riepilogo_iva, imponibile_totale: t.imponibile_totale, iva_totale: t.iva_totale,
    totale_documento: t.totale_documento, totale_da_pagare: t.totale_da_pagare,
    ...(c.ritenuta ? { ritenuta_acconto: true, ritenuta_aliquota: 20, ritenuta_tipo: "RT02", ritenuta_causale: "A", ritenuta_importo: t.ritenuta_importo } : {}),
    ...(c.cigCup ? { cig: "Z1A2B3C4D5", cup: "J12F34000000001" } : {}),
    ...(c.split ? { causale: ["Scissione dei pagamenti ai sensi dell'art. 17-ter del DPR 633/72"] } : {}),
  };
}

const n = (v: string | null | undefined) => Number(v ?? 0);
const testi = (d: Document, tag: string) => Array.from(d.getElementsByTagName(tag)).map((e) => e.textContent ?? "");

/** I due conti dello SDI: 00423 (righe) e 00422 (riepilogo contro righe). */
function contiSdi(d: Document): string[] {
  const errori: string[] = [];
  const linee = Array.from(d.getElementsByTagName("DettaglioLinee"));
  for (const l of linee) {
    const q = n(l.getElementsByTagName("Quantita")[0]?.textContent ?? "1");
    const prezzo = n(l.getElementsByTagName("PrezzoUnitario")[0]?.textContent);
    const totale = n(l.getElementsByTagName("PrezzoTotale")[0]?.textContent);
    if (Math.abs(prezzo * q - totale) > 0.01) errori.push(`00423 ${totale} ≠ ${(prezzo * q).toFixed(2)}`);
  }
  for (const r of Array.from(d.getElementsByTagName("DatiRiepilogo"))) {
    const al = n(r.getElementsByTagName("AliquotaIVA")[0]?.textContent);
    const somma = linee.filter((l) => n(l.getElementsByTagName("AliquotaIVA")[0]?.textContent) === al)
      .reduce((s, l) => s + n(l.getElementsByTagName("PrezzoTotale")[0]?.textContent), 0);
    const imponibile = n(r.getElementsByTagName("ImponibileImporto")[0]?.textContent);
    const imposta = n(r.getElementsByTagName("Imposta")[0]?.textContent);
    if (Math.abs(somma - imponibile) > 1) errori.push(`00422 ${imponibile} ≠ ${somma}`);
    if (Math.abs(imponibile * al / 100 - imposta) > 0.01) errori.push(`imposta ${imposta} ≠ ${(imponibile * al / 100).toFixed(2)}`);
  }
  return errori;
}

const casi: Caso[] = [];
for (const cliente of ["privato", "azienda", "PA"] as const) {
  for (const split of cliente === "PA" ? [true, false] : [false]) {
    for (const ritenuta of [false, true]) {
      for (const cigCup of [false, true]) casi.push({ cliente, split, ritenuta, cigCup });
    }
  }
}

beforeEach(() => { stato.fattura = {}; });

describe("nota di credito TD04: dalla fattura all'XML", () => {
  for (const c of casi) {
    const nome = `${c.cliente}${c.cliente === "PA" ? (c.split ? " split acceso" : " split spento") : ""}${c.ritenuta ? ", ritenuta" : ""}${c.cigCup ? ", CIG/CUP" : ""}`;
    it(nome, async () => {
      stato.fattura = fatturaOriginale(c);
      const nc = await creaNotaCredito("f1", "totale");
      const doc = { ...nc, tipo: "nota_credito", numero: "NC-2026-0007", data_emissione: "2026-11-15", fattura_collegata: { numero: "FT-2026-0042", data: "2026-10-15" } };
      const xml = generateXML(doc as never, azienda, "00001");
      const d = new DOMParser().parseFromString(xml, "application/xml");
      expect(d.getElementsByTagName("parsererror")).toHaveLength(0);

      // Formato e tipo.
      expect(testi(d, "FormatoTrasmissione")).toEqual([c.cliente === "PA" ? "FPA12" : "FPR12"]);
      expect(testi(d, "TipoDocumento")).toEqual(["TD04"]);
      expect(testi(d, "CodiceDestinatario")).toEqual([c.cliente === "PA" ? "UF12AB" : c.cliente === "azienda" ? "M5UXCR1" : "0000000"]);

      // Importi uguali alla fattura (lo storno totale la annulla tutta), positivi: il segno è TD04.
      const f = stato.fattura;
      expect(nc.totale_documento).toBe(f.totale_documento);
      expect(nc.totale_da_pagare).toBe(f.totale_da_pagare);
      expect(testi(d, "ImportoTotaleDocumento")).toEqual([Number(f.totale_documento).toFixed(2)]);

      // Esigibilità e riepiloghi: una riga per aliquota, nella stessa esigibilità della fattura.
      expect(testi(d, "EsigibilitaIVA")).toEqual(c.split ? ["S", "S"] : ["I", "I"]);
      expect(testi(d, "AliquotaIVA").filter((_, i, a) => a.indexOf(_) === i).sort()).toEqual(["10.00", "22.00"]);
      expect(testi(d, "ImponibileImporto").map(Number)).toEqual([900, 333.33]);
      expect(testi(d, "Imposta").map(Number)).toEqual([198, 33.33]);
      expect(contiSdi(d)).toEqual([]);

      // Pagamento: con lo split senza IVA, con la ritenuta al netto.
      const iva = 198 + 33.33;
      const ritenuta = c.ritenuta ? Math.round(1233.33 * 0.2 * 100) / 100 : 0;
      const atteso = 1233.33 + (c.split ? 0 : iva) - ritenuta;
      expect(n(testi(d, "ImportoPagamento")[0])).toBeCloseTo(atteso, 2);
      expect(n(testi(d, "ImportoPagamento")[0])).toBeCloseTo(Number(nc.totale_da_pagare), 2);
      if (c.ritenuta) {
        expect(testi(d, "TipoRitenuta")).toEqual(["RT02"]);
        expect(n(testi(d, "ImportoRitenuta")[0])).toBeCloseTo(ritenuta, 2);
      } else {
        expect(testi(d, "DatiRitenuta")).toEqual([]);
      }

      // Causale: la dicitura dello split solo se c'è lo split, una volta sola.
      const causale = testi(d, "Causale").join(" ");
      expect((causale.match(/17-ter/g) ?? []).length).toBe(c.split ? 1 : 0);
      expect(causale).toMatch(/FT-2026-0042/);

      // Fattura rettificata.
      expect(testi(d, "DatiFattureCollegate")).toHaveLength(1);
      const collegata = d.getElementsByTagName("DatiFattureCollegate")[0];
      expect(collegata.getElementsByTagName("IdDocumento")[0].textContent).toBe("FT-2026-0042");
      expect(collegata.getElementsByTagName("Data")[0].textContent).toBe("2026-10-15");

      // CIG e CUP della fattura anche sulla nota.
      expect(testi(d, "CodiceCIG")).toEqual(c.cigCup ? ["Z1A2B3C4D5"] : []);
      expect(testi(d, "CodiceCUP")).toEqual(c.cigCup ? ["J12F34000000001"] : []);
    });
  }

  it("nota PA da una fattura con split poi tolto sulla nota: niente S e niente dicitura", async () => {
    stato.fattura = fatturaOriginale({ cliente: "PA", split: true, ritenuta: false, cigCup: true });
    const nc = await creaNotaCredito("f1", "totale");
    const t = calcolaTotaliDocumento(nc.righe!, { esigibilitaDefault: "I" });
    const doc = { ...nc, ...t, tipo: "nota_credito", numero: "NC-1", data_emissione: "2026-11-15", esigibilita_iva: "I" };
    const d = new DOMParser().parseFromString(generateXML(doc as never, azienda, "00001"), "application/xml");
    expect(testi(d, "EsigibilitaIVA")).toEqual(["I", "I"]);
    expect(testi(d, "Causale").join(" ")).not.toMatch(/17-ter/);
    expect(n(testi(d, "ImportoPagamento")[0])).toBeCloseTo(1464.66, 2);
  });
});
