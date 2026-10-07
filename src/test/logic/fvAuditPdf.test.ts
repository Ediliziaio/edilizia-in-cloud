/**
 * Il PDF del fotovoltaico, letto come lo legge il cliente: le cifre del finanziamento tornano fra
 * loro (rata × rate = importo finanziato a tasso zero), nessuna pagina scrive «undefined», «NaN» o
 * un numero col punto al posto della virgola.
 */
import { describe, expect, it } from "vitest";
import { getFvPdfRenderedPagesCount, renderFvPdfHtml, type FvPdfTemplateData } from "../../../supabase/functions/_shared/fvHtmlTemplate.ts";
import { calcolaEnergyFlows, finanziatoConAnticipo, fmtRata } from "../../../supabase/functions/_shared/fvCalcoli.ts";
import { svgRataRisparmio } from "../../../supabase/functions/_shared/fvSvgCharts.ts";

/** Il testo che si legge: senza stili, script, grafici e tag. */
const testoDi = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
const conSpaziNormali = (t: string) => t.split(String.fromCharCode(160)).join(" ");

function dati(extra: (d: FvPdfTemplateData) => void = () => {}): FvPdfTemplateData {
  const flows = calcolaEnergyFlows({ potenza_kwp: 6, has_accumulo: false, capacita_accumulo_kwh: 0, consumo_annuo_kwh: 4500, ore_sole_annue: 1500, produzione_kwh: 6808.5, autoconsumo_pct: 0.35 });
  const d = {
    azienda: { name: "Demo Solar", phone: "02 123456", email: "info@example.com", website: "https://example.com", vat_number: "IT123" },
    cliente: { nome: "Mario", cognome: "Rossi", indirizzo: "Via Roma 1", comune: "Milano", cap: "20100", provincia: "MI", tipologia_immobile: "Abitazione" },
    progetto: { numero: "FV-1", titolo: "Mario Rossi", creato_il: "2026-10-05T10:00:00Z", valido_giorni: 30, venditore: null, potenza_kwp: 6, numero_pannelli: 12, has_accumulo: false, capacita_accumulo_kwh: 0, consumo_annuo_kwh: 4500, costo_kwh_attuale: 0.32, profilo_consumo: "misto", ore_sole_annue: 1500, superficie_tetto_disponibile_mq: null },
    costi: { prezzo_vendita_iva_inclusa: 12345.67, iva_perc: 10, detrazione_eur: 6173, detrazione_perc: 50, costo_netto_dopo_detrazione: 6173 },
    finanziamento: null,
    modalita_pagamento: null,
    scenario: { risparmio_mensile_eur: 100, risparmio_anno1_eur: 1205, risparmio_25_anni_eur: 20000, payback_anni: 9.4, npv_25_anni: 8000, cassa_anno_per_anno: [{ anno: 0, cumulato: -12345.67 }, { anno: 25, cumulato: 20000 }] },
    flows,
    componenti: [{ categoria: "pannello", descrizione: "Pannello 500 W", quantita: 12, potenza_w: 500, garanzia_anni: 25 }, { categoria: "inverter", descrizione: "Inverter", quantita: 1, garanzia_anni: 10 }],
  } as unknown as FvPdfTemplateData;
  extra(d);
  return d;
}

/** Tasso zero in 60 rate su 12.345,67 €: la rata giusta è 205,76 (12.345,67 / 60 = 205,7611…). */
function tassoZero(rata: number, finanziato = 12345.67): (d: FvPdfTemplateData) => void {
  return (d) => {
    d.finanziamento = { finanziaria: "Tasso zero", durata_mesi: 60, rata_mensile: rata, tan_perc: 0, taeg_perc: 0, importo_finanziato: finanziato };
    d.modalita_pagamento = { tipo: "finanziato", anticipo_pct: 0, anticipo_eur: 0, finanziato_eur: finanziato, rata_mensile: rata, durata_mesi: 60, tasso_zero: true, note: null };
  };
}

describe("finanziatoConAnticipo: capitale e rata dopo l'anticipo", () => {
  it.each([
    // [totale, anticipo %, rata intera, anticipo €, finanziato €, rata attesa]
    [12345.67, 0, 205.76, 0, 12345.67, 205.76], // nessun anticipo: la rata resta intera
    [12345.67, 20, 205.76, 2469, 9876.67, 164.61], // 20% di 12.345,67 = 2.469,13 → 2.469; 205,76 · 9.876,67 / 12.345,67 = 164,61
    [10000, 30, 167, 3000, 7000, 116.9], // rata da tabella (intera in euro) scalata al 70%
    [10000, 100, 167, 10000, 0, 0], // tutto in contanti: niente rata
    [10000, 150, 167, 10000, 0, 0], // oltre il 100% si ferma al 100%
    [10000, -5, 167, 0, 10000, 167], // un anticipo negativo non esiste
    [0, 30, 167, 0, 0, 0], // senza prezzo niente da dividere (e niente NaN)
  ])("totale %s, anticipo %s%% → anticipo %s, finanziato %s, rata %s", (totale, pct, intera, anticipo, finanziato, rata) => {
    const r = finanziatoConAnticipo({ totale, anticipoPct: pct, rataIntera: intera });
    expect(r.anticipo_eur).toBe(anticipo);
    expect(r.finanziato_eur).toBeCloseTo(finanziato, 2);
    expect(r.rata_mensile).toBeCloseTo(rata, 2);
    expect(Number.isFinite(r.rata_mensile)).toBe(true);
  });

  it("a tasso zero rata × rate torna con l'importo finanziato (scarto sotto mezzo euro, non fino a 14 € come con la rata all'euro)", () => {
    const rataGiusta = Math.round((12345.67 / 60) * 100) / 100;
    const r = finanziatoConAnticipo({ totale: 12345.67, anticipoPct: 0, rataIntera: rataGiusta });
    expect(Math.abs(r.rata_mensile * 60 - r.finanziato_eur)).toBeLessThan(0.5);
    // la stessa rata arrotondata all'euro: 206 × 60 = 12.360, 14 € più dell'importo
    expect(Math.abs(206 * 60 - 12345.67)).toBeGreaterThan(14);
  });
});

describe("la rata si scrive col centesimo quando ce l'ha", () => {
  it.each([
    [206, "206 €"], [205.76, "205,76 €"], [1504.76, "1.504,76 €"], [1505, "1.505 €"], [105.75999999999999, "105,76 €"], [0, "0 €"],
  ])("%s → %s", (n, atteso) => {
    expect(conSpaziNormali(fmtRata(n))).toBe(atteso);
  });
});

describe("PDF a tasso zero: 60 rate da 205,76 € su 12.345,67 €", () => {
  const testo = () => conSpaziNormali(testoDi(renderFvPdfHtml(dati(tassoZero(205.76)))));

  it("la rata esce col centesimo in ogni pagina in cui compare (investimento, piano economico, decisione, firma)", () => {
    const t = testo();
    expect(t).toContain("Rata mensile · 60 rate 205,76 €/mese");
    expect(t).toContain("Rata mensile 205,76 €");
    expect(t).toContain("205,76 €/mese × 60 mesi (Tasso zero TAEG 0,00%)");
    expect(t).toContain("Pagamento 205,76 €/mese × 60 mesi · Tasso zero · TAEG 0,00%");
    // il costo netto reale = rata − risparmio (100): 105,76, scritto uguale in tutte le pagine
    expect(t).toContain("Costo netto reale: 105,76 €/mese");
    expect(t).toContain("105,76 € al mese.");
    expect(t).toContain("205,76 € − 100 €");
  });

  it("nessun importo col punto decimale («205.76 €»): i grafici scrivono come il testo", () => {
    const html = renderFvPdfHtml(dati(tassoZero(205.76)));
    expect(conSpaziNormali(html)).not.toMatch(/\d\.\d{2}\s?€/);
  });

  it("una rata tonda resta tonda (206 €, mai «206,00 €»)", () => {
    const t = conSpaziNormali(testoDi(renderFvPdfHtml(dati(tassoZero(206, 12360)))));
    expect(t).toContain("Rata mensile · 60 rate 206 €/mese");
    expect(t).not.toContain("206,00");
  });
});

describe("PDF col noleggio: il canone ha i centesimi", () => {
  it("1.504,76 € al mese in testo e nel grafico, per 84 mesi", () => {
    const d = dati((x) => {
      x.finanziamento = { finanziaria: "Noleggio operativo FV", durata_mesi: 84, rata_mensile: 1504.76, tan_perc: null, taeg_perc: null, importo_finanziato: 100000 };
      x.modalita_pagamento = { tipo: "noleggio", canone_mensile: 1504.76, durata_mesi: 84, note: null };
    });
    const html = renderFvPdfHtml(d);
    const t = conSpaziNormali(testoDi(html));
    expect(t).toContain("Canone mensile · 84 mesi 1.504,76 €/mese");
    expect(conSpaziNormali(html)).not.toMatch(/\d\.\d{2}\s?€/);
  });
});

describe("il grafico rata contro risparmio", () => {
  it("scrive gli importi come il testo: 205,76 € − 100 € = 105,76 €", () => {
    const svg = conSpaziNormali(svgRataRisparmio(205.76, 100, 105.76));
    expect(svg).toContain(">205,76 €<");
    expect(svg).toContain(">−100 €<");
    expect(svg).toContain(">= 105,76 €<");
  });
});

describe("nessuna pagina scrive undefined, NaN, Infinity, [object] o null", () => {
  const varianti: Array<[string, (d: FvPdfTemplateData) => void]> = [
    ["a tasso zero", tassoZero(205.76)],
    ["senza finanziamento", () => {}],
    ["rientro che non c'è", (d) => { d.scenario.payback_anni = null; }],
    ["senza cassa a 25 anni", (d) => { d.scenario.cassa_anno_per_anno = []; }],
    ["con la batteria", (d) => { d.progetto.has_accumulo = true; d.progetto.capacita_accumulo_kwh = 10; }],
    ["prezzo a corpo", (d) => { d.costi.prezzo_a_corpo = true; }],
    ["prezzo zero", (d) => { d.costi.prezzo_vendita_iva_inclusa = 0; }],
    ["cliente senza nome", (d) => { d.cliente.nome = ""; d.cliente.cognome = ""; }],
    ["con anticipo del 30% e rata scalata", (d) => {
      tassoZero(144.03, 8641.97)(d);
      d.modalita_pagamento = { tipo: "finanziato", anticipo_pct: 30, anticipo_eur: 3704, finanziato_eur: 8641.67, rata_mensile: 144.03, durata_mesi: 60, tasso_zero: true, note: null };
    }],
  ];
  it.each(varianti)("%s", (_nome, modifica) => {
    const t = testoDi(renderFvPdfHtml(dati(modifica)));
    expect(t).not.toMatch(/undefined|NaN|Infinity|\[object|\bnull\b/);
  });
});

describe("la pagina «Composizione della fornitura»: tutte le righe e il totale stanno nelle pagine", () => {
  const conComponenti = (n: number, local = false, estesa = "") => dati((d) => {
    d.componenti = Array.from({ length: n }, (_, i) => ({
      categoria: i === 0 ? "pannello" : i === 1 ? "inverter" : "altro", descrizione: `PRODOTTO-${i + 1}-FINE`, marca: "Marca",
      modello: `PRODOTTO-${i + 1}-FINE`, quantita: 1 + i, potenza_w: 0, garanzia_anni: 10, articolo_descrizione_estesa: estesa || null,
    })) as unknown as FvPdfTemplateData["componenti"];
    if (local) d.template = { pdf_blocchi: { modulo_intervento: "componenti" } } as unknown as FvPdfTemplateData["template"];
  });
  const pagineDi = (html: string) => (html.match(/class="page"/g) ?? []).length;

  it.each([[3, false], [6, false], [7, false], [8, false], [12, false], [20, false], [2, true], [8, true], [14, true]])(
    "%s componenti (intervento locale: %s): il numero di pagine del piè di pagina è quello delle pagine disegnate, e ogni pagina dice «N / totale»",
    (n, local) => {
      const d = conComponenti(n, local);
      const html = renderFvPdfHtml(d);
      expect(pagineDi(html)).toBe(getFvPdfRenderedPagesCount(d));
      const numeri = [...html.matchAll(/<span class="pnum">(\d+) \/ (\d+)<\/span>/g)].map((m) => [Number(m[1]), Number(m[2])]);
      expect(numeri.length).toBeGreaterThan(0);
      expect(numeri.every(([, tot]) => tot === pagineDi(html))).toBe(true);
    },
  );

  it("con otto righe la fornitura non entra in una pagina A4 (sei col totale, sette senza): continua nella pagina dopo, senza perdere righe, e il totale esce una volta sola, nell'ultima", () => {
    const html6 = renderFvPdfHtml(conComponenti(6));
    const html8 = renderFvPdfHtml(conComponenti(8));
    expect(pagineDi(html8)).toBe(pagineDi(html6) + 1);
    for (const html of [html6, html8]) expect((html.match(/class="forn-tot"/g) ?? []).length).toBe(1);
    // nessuna riga della tabella persa né doppia
    for (let i = 1; i <= 8; i++) expect((html8.match(new RegExp(`class="forn-t">Marca PRODOTTO-${i}-FINE<`, "g")) ?? []).length).toBe(1);
    // il totale sta dopo l'ultima riga, e la pagina che continua lo dice
    expect(html8.indexOf('class="forn-tot"')).toBeGreaterThan(html8.indexOf('class="forn-t">Marca PRODOTTO-8-FINE<'));
    expect(html8).toContain("La fornitura · continua 2");
    expect(html6).not.toContain("continua 2");
    // la numerazione continua (01…07, poi 08) e i pezzi sono quelli di tutta la fornitura (1+2+…+8 = 36) su ogni pagina
    expect((html8.match(/<td class="forn-idx">01<\/td>/g) ?? []).length).toBe(1);
    expect((html8.match(/<td class="forn-idx">08<\/td>/g) ?? []).length).toBe(1);
    expect((html8.match(/Composizione della fornitura&nbsp;·&nbsp;36 pezzi/g) ?? []).length).toBe(2);
  });

  it("il totale si chiama «Fornitura chiavi in mano» solo per un impianto completo: per una proposta parziale (batteria, componenti, manutenzione) è «Totale della proposta», come nel resto del documento", () => {
    const completo = renderFvPdfHtml(conComponenti(3, false));
    const parziale = renderFvPdfHtml(conComponenti(3, true));
    expect(completo).toContain(">Fornitura chiavi in mano<");
    expect(parziale).not.toContain("chiavi in mano");
    expect(parziale).toContain(">Totale della proposta<");
    // lo stesso valore, con la stessa IVA
    for (const html of [completo, parziale]) expect(html).toMatch(/class="forn-tot-l">[^<]+<span>IVA 10% inclusa/);
  });

  it("una riga con tanto testo (specifiche a capo) prende più spazio: con descrizioni lunghe bastano meno righe per riempire la pagina", () => {
    const lunga = "Descrizione estesa del prodotto con molte parole che manda a capo le specifiche piu' volte dentro la riga della tabella. ".repeat(3);
    const corte = renderFvPdfHtml(conComponenti(6));
    const lunghe = renderFvPdfHtml(conComponenti(6, false, lunga));
    expect(pagineDi(lunghe)).toBeGreaterThan(pagineDi(corte));
  });
});
