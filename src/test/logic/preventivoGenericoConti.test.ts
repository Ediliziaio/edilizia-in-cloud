/**
 * Preventivo generico: i conti che toccano i soldi (05/10/2026).
 *
 *  - Una riga «Sconto» vale sempre in meno, sullo schermo, nel database e nel PDF.
 *  - Il margine non si dice se una riga venduta non ha un costo.
 *  - L'IVA delle voci nuove segue i prodotti; quella delle tariffe di un bundle pure.
 *  - Il costo delle tariffe segue la regola unica (costoTariffa).
 *  - Una voce di computo abbinata al listino porta costo e IVA del prodotto.
 */
import { describe, expect, it } from "vitest";
import {
  aliquotaPiuUsata,
  calcolaTotaliPreventivo,
  espondiBundle,
  ivaVoceNuova,
  normalizzaRigaSconto,
  prezzoRigaSconto,
  round2,
} from "@/hooks/usePreventivoCosti";
import {
  buildComputoQuoteItemPayload,
  categoriaRigaPreventivo,
  costoEIvaDaListino,
  inferComputoItemCategory,
} from "@/lib/computo/quoteItemMapping";
import type { CatalogItem } from "@/types/catalogItem";
import type { ComputoVoceLocal } from "@/types/computo";

type Riga = {
  quantity: number;
  unit_price: number;
  discount_percent: number;
  vat_rate: number;
  prezzo_acquisto?: number;
  is_optional?: boolean;
  item_category?: string;
};

const riga = (extra: Partial<Riga> = {}): Riga => ({
  quantity: 1, unit_price: 0, discount_percent: 0, vat_rate: 22, prezzo_acquisto: 0, is_optional: false, item_category: "prodotto", ...extra,
});

/**
 * I totali come li rifà il database dalle righe salvate
 * (do_recalculate_quote_totals, migrazione 20280923100000): somma dei
 * line_total arrotondati, IVA arrotondata per aliquota, nessun filtro per categoria.
 */
function totaliDelDatabase(salvate: Riga[], scontoPct = 0) {
  const attive = salvate.filter((r) => !r.is_optional);
  const lineTotal = (r: Riga) => round2(r.quantity * r.unit_price * (1 - (r.discount_percent ?? 0) / 100));
  const base = attive.reduce((s, r) => s + lineTotal(r), 0);
  const netto = round2(base * (1 - scontoPct / 100));
  const perAliquota = new Map<number, number>();
  for (const r of attive) perAliquota.set(r.vat_rate ?? 22, (perAliquota.get(r.vat_rate ?? 22) ?? 0) + lineTotal(r));
  const iva = [...perAliquota].reduce((s, [aliquota, somma]) => s + round2(somma * aliquota / 100 * (1 - scontoPct / 100)), 0);
  return { subtotal: round2(base), total: round2(netto + round2(iva)) };
}

describe("Riga «Sconto»: vale sempre in meno", () => {
  it("l'importo scritto diventa negativo, mai «-0»", () => {
    expect(prezzoRigaSconto(100)).toBe(-100);
    expect(prezzoRigaSconto(-100)).toBe(-100);
    expect(Object.is(prezzoRigaSconto(0), 0)).toBe(true);
    expect(prezzoRigaSconto(Number.NaN)).toBe(0);
  });

  it("la riga di sconto perde sconto di riga e costo; le altre restano le stesse", () => {
    const prodotto = riga({ unit_price: 100 });
    expect(normalizzaRigaSconto(prodotto)).toBe(prodotto);
    expect(normalizzaRigaSconto(riga({ item_category: "sconto", unit_price: 50, discount_percent: 10, prezzo_acquisto: 5 })))
      .toMatchObject({ unit_price: -50, discount_percent: 0, prezzo_acquisto: 0 });
  });

  it("100 € di sconto su 1.000 € al 22%: il totale scende a 1.098 €, non sale a 1.342 €", () => {
    const righe = [riga({ unit_price: 1000, prezzo_acquisto: 600 }), riga({ item_category: "sconto", unit_price: 100 })];
    const t = calcolaTotaliPreventivo(righe, 0);
    expect(t.subtotale).toBe(900);
    expect(t.iva_breakdown).toEqual({ "22": 198 });
    expect(t.totale).toBe(1098);
    // Il ricavo scende e il margine con lui: (900 − 600) / 900.
    expect(t.margine_totale_pct).toBeCloseTo(33.33, 2);
  });

  it("schermo e database dicono lo stesso totale: si salva la riga già in negativo", () => {
    const righe = [
      riga({ unit_price: 1234.56, vat_rate: 10, quantity: 3 }),
      riga({ unit_price: 80, vat_rate: 22, item_category: "posa" }),
      riga({ unit_price: 150.5, vat_rate: 10, item_category: "sconto" }),
      riga({ unit_price: 999, vat_rate: 22, is_optional: true }),
    ];
    for (const sconto of [0, 7.5]) {
      const schermo = calcolaTotaliPreventivo(righe, 0, sconto);
      const database = totaliDelDatabase(righe.map((r) => normalizzaRigaSconto(r)), sconto);
      expect(schermo.subtotale).toBe(database.subtotal);
      expect(schermo.totale).toBe(database.total);
    }
  });
});

describe("Margine con costi mancanti", () => {
  it("una riga venduta senza costo: costi incompleti, con quante righe", () => {
    const t = calcolaTotaliPreventivo([
      riga({ unit_price: 1000, prezzo_acquisto: 600 }),
      riga({ item_category: "posa", unit_price: 200 }),
      riga({ item_category: "trasporto", unit_price: 50 }),
    ], 0);
    expect(t.costi_completi).toBe(false);
    expect(t.righe_senza_costo).toBe(2);
  });

  it("niente costi: il calcolo direbbe 100%, ma i costi risultano incompleti", () => {
    const t = calcolaTotaliPreventivo([riga({ unit_price: 1000 })], 0);
    expect(t.margine_totale_pct).toBe(100);
    expect(t.costi_completi).toBe(false);
  });

  it("tutte le righe vendute col costo: il margine è vero", () => {
    const t = calcolaTotaliPreventivo([
      riga({ unit_price: 1000, prezzo_acquisto: 600 }),
      riga({ item_category: "posa", unit_price: 200, prezzo_acquisto: 120 }),
    ], 0);
    expect(t.costi_completi).toBe(true);
    expect(t.righe_senza_costo).toBe(0);
    expect(t.margine_totale_pct).toBeCloseTo(40, 6);
  });

  it("non contano: opzionali, note, subtotali, sconti e righe a 0 € (omaggi)", () => {
    const t = calcolaTotaliPreventivo([
      riga({ unit_price: 1000, prezzo_acquisto: 600 }),
      riga({ unit_price: 500, is_optional: true }),
      riga({ item_category: "nota" }),
      riga({ item_category: "subtotale" }),
      riga({ item_category: "sconto", unit_price: -50 }),
      riga({ unit_price: 0 }),
    ], 0);
    expect(t.costi_completi).toBe(true);
    expect(t.righe_senza_costo).toBe(0);
  });

  it("col prezzo scritto a mano le voci a 0 € restano vendute: senza costo il margine non si dice", () => {
    const senza = calcolaTotaliPreventivo([riga(), riga({ prezzo_acquisto: 300 })], 0, 0, 5000, 22);
    expect(senza.costi_completi).toBe(false);
    expect(senza.righe_senza_costo).toBe(1);
    const con = calcolaTotaliPreventivo([riga({ prezzo_acquisto: 200 }), riga({ prezzo_acquisto: 300 })], 0, 0, 5000, 22);
    expect(con.costi_completi).toBe(true);
    expect(con.margine_totale_pct).toBeCloseTo(90, 6);
  });

  it("preventivo vuoto: nessun margine da dire", () => {
    const t = calcolaTotaliPreventivo([], 0);
    expect(t.costi_completi).toBe(false);
    expect(t.righe_senza_costo).toBe(0);
  });
});

describe("IVA delle voci nuove", () => {
  it("preventivo vuoto: l'aliquota del prezzo a mano, se c'è, altrimenti 22", () => {
    expect(ivaVoceNuova([])).toBe(22);
    expect(ivaVoceNuova([], 10)).toBe(10);
    expect(ivaVoceNuova([], 0)).toBe(0);
    expect(ivaVoceNuova([], 150)).toBe(22);
  });

  it("decidono i prodotti, anche se le voci di servizio sono di più", () => {
    const righe = [
      { item_category: "prodotto", vat_rate: 10 },
      { item_category: "posa", vat_rate: 22 },
      { item_category: "trasporto", vat_rate: 22 },
      { item_category: "smaltimento", vat_rate: 22 },
    ];
    expect(ivaVoceNuova(righe, 4)).toBe(10);
  });

  it("senza prodotti decidono le altre voci; note, subtotali e sconti mai", () => {
    expect(ivaVoceNuova([{ item_category: "posa", vat_rate: 10 }, { item_category: "sconto", vat_rate: 4 }, { item_category: "sconto", vat_rate: 4 }])).toBe(10);
    expect(ivaVoceNuova([{ item_category: "nota", vat_rate: 4 }], 10)).toBe(10);
  });

  it("a parità vince la prima aliquota incontrata", () => {
    expect(aliquotaPiuUsata([{ vat_rate: 10 }, { vat_rate: 22 }])).toBe(10);
    expect(aliquotaPiuUsata([{ vat_rate: null }])).toBeNull();
  });
});

describe("Bundle: tariffe con IVA, unità e costo come in ApplyBundleDialog", () => {
  const finestra = {
    prodotto_id: "art-1", quantita: 2, sort_order: 0,
    // prezzo_acquisto_netto è lo 0 di default: il costo vero sta in standard_cost.
    article_templates: { name: "Finestra", prezzo_vendita: 500, prezzo_acquisto_netto: 0, standard_cost: 300, unit_of_measure: "pz", vat_rate: 10 },
  };
  const porta = {
    prodotto_id: "art-2", quantita: 1, sort_order: 1,
    article_templates: { name: "Porta", prezzo_vendita: 900, prezzo_acquisto_netto: 600, unit_of_measure: "pz", vat_rate: 22 },
  };
  const posa = {
    tariffa_id: "tar-1", quantita: 2, sort_order: 2,
    // Costo vero in prezzo_costo (costo_interno è lo 0 di default); unità vera
    // nella legacy, perché unita_fatturazione è rimasta al «pz» di default.
    tariffe_aziendali: { nome: "Posa", prezzo_vendita: 80, prezzo_costo: 35, costo_interno: 0, costo_default: null as number | null, unita: "mq", unita_fatturazione: "pz" },
  };
  const bundle = { id: "b1", nome: "Finestra posata", sconto_bundle_pct: 5 };

  it("la posa sciolta prende l'aliquota degli articoli del bundle, il costo e l'unità veri", () => {
    const [rigaFinestra, rigaPosa] = espondiBundle(bundle, [finestra, posa], 0);
    expect(rigaFinestra).toMatchObject({ vat_rate: 10, prezzo_acquisto: 300 });
    expect(rigaPosa).toMatchObject({ vat_rate: 10, prezzo_acquisto: 35, unit_of_measure: "mq" });
  });

  it("articoli con aliquote diverse, o nessun articolo: la tariffa resta al 22%", () => {
    expect(espondiBundle(bundle, [finestra, porta, posa], 0)[2].vat_rate).toBe(22);
    expect(espondiBundle(bundle, [posa], 0)[0].vat_rate).toBe(22);
  });
});

describe("Computo → preventivo: costo e IVA della voce abbinata", () => {
  const articolo = {
    source: "article", id: "art-1", nome: "Gres 60x60",
    article: { id: "art-1", prezzo_acquisto_netto: 18.5, vat_rate: 10 },
  } as unknown as CatalogItem;
  const famiglia = (extra: Record<string, unknown> = {}) => ({
    source: "family", id: "fam-1", nome: "Persiana",
    family: {
      id: "fam-1", modalita_prezzo_base: "pz", prezzo_base_mode: "acquisto_markup", prezzo_base_acquisto: 200,
      sconto_fornitore_1: 50, sconto_fornitore_2: 10, vat_rate: 10, ...extra,
    },
  }) as unknown as CatalogItem;

  it("articolo: costo netto e IVA del listino", () => {
    expect(costoEIvaDaListino(articolo)).toEqual({ costo: 18.5, vat_rate: 10 });
  });

  it("famiglia «acquisto + ricarico»: costo al netto degli sconti fornitore", () => {
    expect(costoEIvaDaListino(famiglia())).toEqual({ costo: 90, vat_rate: 10 });
    expect(costoEIvaDaListino(famiglia({ prezzo_base_mode: "vendita" })).costo).toBe(200);
  });

  it("famiglia a griglia: senza misure il costo non si sa", () => {
    expect(costoEIvaDaListino(famiglia({ modalita_prezzo_base: "griglia" }))).toEqual({ costo: null, vat_rate: 10 });
  });

  const voce = (extra: Partial<ComputoVoceLocal> = {}): ComputoVoceLocal => ({
    id: "v1", computo_upload_id: "c1", company_id: "co1", capitolo_numero: 1, capitolo_nome: "Pavimenti",
    codice_voce: "1", codice_prezzario: null, descrizione_breve: "Fornitura gres", descrizione_estesa: null,
    unita_misura: "mq", quantita: 10, prezzo_unitario_computo: 30, importo_computo: 300,
    prezzo_unitario_impresa: null, ricarico_percentuale: null, sconto_percentuale: 0, importo_impresa: null,
    confidence: 0.9, warnings: null, ai_notes: null, is_included: true, is_modified: false, ordine: 1,
    created_at: "2026-10-05T00:00:00Z", matched_template_id: null, matched_family_id: null, matched_tariffa_id: null,
    matched_name: null, match_type: null, match_confidence: null,
    _prezzoImpresa: 34.5, _ricarico: 15, _importoImpresa: 345, _isIncluded: true, ...extra,
  });
  const listino = new Map([
    ["art-1", { costo: 18.5, vat_rate: 10 }],
    ["fam-1", { costo: 90, vat_rate: 22 }],
    ["tar-1", { costo: 12, vat_rate: null }],
  ]);
  const cerca = (id: string) => listino.get(id);

  it("prodotto abbinato a mano: costo e IVA del listino", () => {
    const p = buildComputoQuoteItemPayload(voce({ _matched_template_id: "art-1", _match_type: "manual" }), 0, cerca);
    expect(p).toMatchObject({ article_template_id: "art-1", family_id: null, prezzo_acquisto: 18.5, vat_rate: 10 });
  });

  it("abbinamento del server (solo l'id): costo e IVA lo stesso", () => {
    const p = buildComputoQuoteItemPayload(voce({ matched_family_id: "fam-1", match_type: "vector" }), 0, cerca);
    expect(p).toMatchObject({ family_id: "fam-1", prezzo_acquisto: 90, vat_rate: 22 });
  });

  it("tariffa del server senza costo in pagina: costo dal listino; quella scelta a mano tiene il suo", () => {
    expect(buildComputoQuoteItemPayload(voce({ _matched_tariffa_id: "tar-1" }), 0, cerca).prezzo_acquisto).toBe(12);
    expect(buildComputoQuoteItemPayload(voce({ _matched_tariffa_id: "tar-1", _matched_tariffa_cost: 15 }), 0, cerca).prezzo_acquisto).toBe(15);
    expect(buildComputoQuoteItemPayload(voce({ _matched_tariffa_id: "tar-1" }), 0, cerca).vat_rate).toBeNull();
  });

  it("articolo scelto a mano su una voce che il server aveva legato a una famiglia: un solo abbinamento", () => {
    const p = buildComputoQuoteItemPayload(
      voce({ matched_family_id: "fam-1", match_type: "vector", _matched_template_id: "art-1", _matched_family_id: undefined, _match_type: "manual" }),
      0,
      cerca,
    );
    expect(p).toMatchObject({ article_template_id: "art-1", family_id: null, tariffa_id: null, prezzo_acquisto: 18.5 });
  });

  it("prodotto scelto a mano su una voce che il server aveva legato a una tariffa: vince il prodotto", () => {
    const p = buildComputoQuoteItemPayload(
      voce({ matched_tariffa_id: "tar-1", match_type: "vector", _matched_family_id: "fam-1", _match_type: "manual" }),
      0,
      cerca,
    );
    expect(p).toMatchObject({ family_id: "fam-1", tariffa_id: null, item_type: "product", prezzo_acquisto: 90, vat_rate: 22 });
  });

  it("senza listino si comporta come prima: niente costo, IVA del preventivo", () => {
    const p = buildComputoQuoteItemPayload(voce({ _matched_template_id: "art-1" }), 0);
    expect(p).toMatchObject({ prezzo_acquisto: null, vat_rate: null });
  });

  it("nella riga va solo una categoria che il database accetta", () => {
    // «lavorato» contiene «ora»: la revisione la chiama manodopera, il database la rifiuterebbe.
    const lavorato = voce({ descrizione_breve: "Intonaco civile lavorato a frattazzo" });
    expect(inferComputoItemCategory(lavorato)).toBe("manodopera");
    expect(buildComputoQuoteItemPayload(lavorato, 0)).toMatchObject({ item_category: "prodotto", item_type: "product" });
    const tariffa = voce({ _matched_tariffa_id: "tar-1", _matched_tariffa_tipo: "manodopera" });
    expect(buildComputoQuoteItemPayload(tariffa, 0)).toMatchObject({ item_category: "posa", item_type: "service" });
    for (const ammessa of ["prodotto", "posa", "trasporto", "tiro_piano", "smaltimento", "nolo", "pratica"]) {
      expect(categoriaRigaPreventivo(ammessa, false)).toBe(ammessa);
    }
    expect(categoriaRigaPreventivo("servizio", true)).toBe("posa");
    expect(categoriaRigaPreventivo("ponteggio", false)).toBe("prodotto");
  });
});
