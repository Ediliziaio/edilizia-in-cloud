import { describe, expect, it } from "vitest";
import { calcolaPrezzoFamiglia, type GridPoint } from "@/hooks/useFamilyPricing";
import type { AxisValue, FamilyAxis, FamilyWithAxes } from "@/types/articleFamily";
import { prezzoFamigliaAi } from "../../../supabase/functions/_shared/prezzoFamigliaAi";
import { conAssiVisibili } from "@/lib/serramenti/assiCondizionati";

/**
 * La generazione AI del preventivo (ai-genera-preventivo-v2) mostra un prezzo
 * prima che la riga entri; quando entra, il preventivo lo rifà con
 * calcolaPrezzoFamiglia. I due numeri devono essere uguali (05/10/2026): prima
 * l'AI prendeva la cella più vicina della griglia e il prezzo di vendita salvato
 * anche per le famiglie a ricarico.
 */

function valore(id: string, extra: Partial<AxisValue> = {}): AxisValue {
  return {
    id, axis_id: "a", company_id: "c", valore: id, label: id, descrizione: null, is_default: false,
    maggiorazione_tipo: "none", maggiorazione_valore: 0, maggiorazione_acquisto: 0,
    prezzo_vendita: null, prezzo_acquisto: null,
    sort_order: 0, attivo: true, created_at: "2026-01-01T00:00:00Z",
    ...extra,
  } as AxisValue;
}

function asse(codice: string, sort_order: number, values: AxisValue[], obbligatorio = false): FamilyAxis & { values: AxisValue[] } {
  return {
    id: `asse-${codice}`, family_id: "f", company_id: "c", nome: codice, codice, descrizione: null,
    tipo: "discrete", obbligatorio, sort_order, created_at: "2026-01-01T00:00:00Z", values,
  } as FamilyAxis & { values: AxisValue[] };
}

function famiglia(extra: Partial<FamilyWithAxes>): FamilyWithAxes {
  return {
    id: "f", company_id: "c", vertical: "serramenti", categoria_id: null, nome: "Finestra", descrizione: null,
    immagine_url: null, pdf_scheda_url: null, modalita_prezzo_base: "pz", prezzo_base_mode: "vendita",
    prezzo_base_vendita: 100, prezzo_base_acquisto: 60, markup_tipo: "none", markup_valore: 0,
    sconto_fornitore_1: 0, sconto_fornitore_2: 0, vat_rate: 22, vat_rate_acquisto: 22, unit_of_measure: "pz",
    posa_tariffa_default_id: null, posa_quantita_default: 0, griglia_asse_x_label: "L", griglia_asse_y_label: "H",
    griglia_unita: "mm", attivo: true, sort_order: 0, custom_field_values: {}, deleted_at: null,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", axes: [],
    ...extra,
  } as FamilyWithAxes;
}

const GRIGLIA: GridPoint[] = [
  { valore_x: 1000, valore_y: 1000, prezzo_vendita: 300, prezzo_acquisto_netto: 400 },
  { valore_x: 1200, valore_y: 1400, prezzo_vendita: 420, prezzo_acquisto_netto: 500 },
  { valore_x: 1500, valore_y: 1800, prezzo_vendita: 600, prezzo_acquisto_netto: 700 },
];

function entrambi(
  f: FamilyWithAxes,
  scelte: Record<string, string>,
  x?: number,
  y?: number,
  griglia?: GridPoint[],
) {
  // Il preventivo prezza solo le varianti visibili, come il configuratore.
  const preventivo = calcolaPrezzoFamiglia(
    { family: conAssiVisibili(f, scelte), selections: scelte, larghezza_mm: x, altezza_mm: y, quantita: 1 },
    griglia,
  );
  const avvisi: string[] = [];
  const ai = prezzoFamigliaAi(
    {
      nome: f.nome,
      prezzi: {
        modalita_prezzo_base: f.modalita_prezzo_base,
        prezzo_base_mode: f.prezzo_base_mode,
        prezzo_base_vendita: f.prezzo_base_vendita,
        prezzo_base_acquisto: f.prezzo_base_acquisto,
        sconto_fornitore_1: f.sconto_fornitore_1 ?? 0,
        sconto_fornitore_2: f.sconto_fornitore_2 ?? 0,
        markup_tipo: f.markup_tipo,
        markup_valore: f.markup_valore,
      },
      assi: f.axes,
      scelte,
      xMm: x ?? null,
      yMm: y ?? null,
      ml: null,
      griglia: griglia?.map((g) => ({ valore_x: g.valore_x, valore_y: g.valore_y, prezzo_vendita: g.prezzo_vendita, prezzo_acquisto: g.prezzo_acquisto_netto })),
    },
    avvisi,
  );
  return { preventivo, ai, avvisi };
}

describe("prezzo famiglia: generazione AI e preventivo dicono lo stesso numero", () => {
  const colore = asse("colore", 1, [
    valore("bianco"),
    valore("noce", { maggiorazione_tipo: "percentuale", maggiorazione_valore: 10 }),
  ]);
  const maniglia = asse("maniglia", 2, [valore("cromo", { maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 25 })]);
  const vetro = asse("vetro", 3, [valore("triplo", { maggiorazione_tipo: "fisso_mq", maggiorazione_valore: 40 })]);

  it("prezzo di vendita diretto, con percentuale e fisso", () => {
    const { preventivo, ai } = entrambi(famiglia({ axes: [colore, maniglia] }), { colore: "noce", maniglia: "cromo" });
    expect(preventivo.unit_price_vendita).toBe(135); // 100 + 10% + 25
    expect(ai).toBe(preventivo.unit_price_vendita);
  });

  it("al m², con la maggiorazione al m²", () => {
    const f = famiglia({ modalita_prezzo_base: "mq", prezzo_base_vendita: 300, axes: [colore, vetro] });
    const { preventivo, ai } = entrambi(f, { colore: "noce", vetro: "triplo" }, 1200, 1500);
    expect(preventivo.unit_price_vendita).toBe(666); // 300 × 1,8 m² = 540, +10% = 594, + 40 × 1,8 = 666
    expect(ai).toBe(preventivo.unit_price_vendita);
  });

  it("acquisto + ricarico: rifà la vendita dal costo netto, non dal prezzo salvato", () => {
    const f = famiglia({
      prezzo_base_mode: "acquisto_markup", prezzo_base_vendita: 999, prezzo_base_acquisto: 1000,
      sconto_fornitore_1: 50, sconto_fornitore_2: 3, markup_tipo: "percentuale", markup_valore: 100,
    });
    const { preventivo, ai } = entrambi(f, {});
    expect(preventivo.unit_price_vendita).toBe(970); // 1000 − 50% − 3% = 485, +100%
    expect(ai).toBe(preventivo.unit_price_vendita);
  });

  it("griglia: la misura esatta e, se manca, la più piccola che la contiene", () => {
    const f = famiglia({ modalita_prezzo_base: "griglia", axes: [colore] });
    const esatta = entrambi(f, { colore: "noce" }, 1200, 1400, GRIGLIA);
    expect(esatta.ai).toBe(esatta.preventivo.unit_price_vendita);
    expect(esatta.ai).toBe(462);

    // 1250×1420: la cella più vicina sarebbe 1200×1400 (420); quella che la contiene è 1500×1800.
    const superiore = entrambi(f, {}, 1250, 1420, GRIGLIA);
    expect(superiore.ai).toBe(600);
    expect(superiore.ai).toBe(superiore.preventivo.unit_price_vendita);
    expect(superiore.avvisi.join(" ")).toContain("misura superiore 1500×1800");
  });

  it("griglia a ricarico: costo della cella, sconti fornitore e ricarico", () => {
    const f = famiglia({
      modalita_prezzo_base: "griglia", prezzo_base_mode: "acquisto_markup",
      sconto_fornitore_1: 40, markup_tipo: "fisso_pz", markup_valore: 80,
    });
    const { preventivo, ai } = entrambi(f, {}, 1000, 1000, GRIGLIA);
    expect(preventivo.unit_price_vendita).toBe(320); // 400 − 40% = 240, + 80
    expect(ai).toBe(preventivo.unit_price_vendita);
  });

  it("griglia: fuori listino niente prezzo, come nel preventivo", () => {
    const f = famiglia({ modalita_prezzo_base: "griglia" });
    const { preventivo, ai, avvisi } = entrambi(f, {}, 1600, 1000, GRIGLIA);
    expect(preventivo.fuori_listino).toBe(true);
    expect(ai).toBeNull();
    expect(avvisi.join(" ")).toContain("fuori listino");
  });

  it("prezzo proprio della variante: sostituisce il base (al m²) e salta le maggiorazioni del suo asse", () => {
    const serie = asse("serie", 0, [
      valore("top", { prezzo_vendita: 500, maggiorazione_tipo: "percentuale", maggiorazione_valore: 50 }),
    ]);
    const f = famiglia({ modalita_prezzo_base: "mq", prezzo_base_vendita: 300, axes: [serie, colore] });
    const { preventivo, ai } = entrambi(f, { serie: "top", colore: "noce" }, 1000, 2000);
    expect(preventivo.unit_price_vendita).toBe(1100); // 500 × 2 m² = 1000, +10% del colore
    expect(ai).toBe(preventivo.unit_price_vendita);
  });

  it("ribassi delle varianti: −8% vale, ma un −120 € su un prodotto da 100 € conta 0 e lo dice", () => {
    const sconto = asse("linea", 0, [
      valore("economica", { maggiorazione_tipo: "percentuale", maggiorazione_valore: -8 }),
      valore("svendita", { maggiorazione_tipo: "fisso_pz", maggiorazione_valore: -120, maggiorazione_acquisto: -120 }),
    ]);
    const f = famiglia({ axes: [sconto] });
    const ribasso = entrambi(f, { linea: "economica" });
    expect(ribasso.preventivo.unit_price_vendita).toBe(92);
    expect(ribasso.ai).toBe(92);

    const sotto = entrambi(f, { linea: "svendita" });
    expect(sotto.preventivo.unit_price_vendita).toBe(0);
    expect(sotto.preventivo.unit_price_acquisto).toBe(0);
    expect(sotto.preventivo.warnings.join(" ")).toContain("sotto zero");
    expect(sotto.ai).toBe(0);
    expect(sotto.avvisi.join(" ")).toContain("sotto zero");
  });

  it("varianti «solo con monoblocco»: nascoste non pesano e non si chiedono", () => {
    const monoblocco = asse("monoblocco", 0, [
      valore("senza"),
      valore("con", { maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 150 }),
    ]);
    const cassonetto = {
      ...asse("cassonetto", 1, [valore("h200", { maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 40 })], true),
      visibile_se: { asse: "monoblocco", valori: ["con"] },
    };
    const f = famiglia({ axes: [monoblocco, cassonetto] });

    // Senza monoblocco il cassonetto non c'è: niente +40 anche se l'AI l'ha scelto, niente «obbligatorio».
    const senza = entrambi(f, { monoblocco: "senza", cassonetto: "h200" });
    expect(senza.preventivo.unit_price_vendita).toBe(100);
    expect(senza.ai).toBe(100);
    expect(senza.avvisi.join(" ")).not.toContain("obbligatorio");

    const con = entrambi(f, { monoblocco: "con", cassonetto: "h200" });
    expect(con.preventivo.unit_price_vendita).toBe(290); // 100 + 150 + 40
    expect(con.ai).toBe(290);

    // Con monoblocco il cassonetto si chiede.
    expect(entrambi(f, { monoblocco: "con" }).avvisi.join(" ")).toContain("obbligatorio");
  });

  it("asse obbligatorio non scelto: lo dice", () => {
    const f = famiglia({ axes: [asse("apertura", 0, [valore("dx")], true)] });
    const { ai, avvisi } = entrambi(f, {});
    expect(ai).toBe(100);
    expect(avvisi.join(" ")).toContain("obbligatorio");
  });
});
