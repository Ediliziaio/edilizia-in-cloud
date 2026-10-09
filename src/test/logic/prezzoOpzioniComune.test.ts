import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { applicaPrezzoOpzioni, type AssePrezzo } from "@/lib/listino/prezzoOpzioni";
import { applyMaggiorazioniAssi, calcolaCostoPosizione, type FamigliaCosto } from "@/lib/serramenti/pricing";
import { calcolaPrezzoFamiglia } from "@/hooks/useFamilyPricing";
import type { AxisValue, FamilyWithAxes } from "@/types/articleFamily";

function fullAxes(minimal: AssePrezzo[]): FamilyWithAxes["axes"] {
  return minimal.map((axis): FamilyWithAxes["axes"][number] => ({ id: axis.codice, family_id: "family", company_id: "demo",
    nome: axis.codice, descrizione: null, tipo: "discrete", obbligatorio: false, sort_order: 0, created_at: "",
    ...axis, values: axis.values.map((v): AxisValue => ({ axis_id: axis.codice, company_id: "demo", valore: v.id,
      label: v.id, descrizione: null, is_default: false, maggiorazione_valore: 0, maggiorazione_acquisto: 0,
      codice: null, prezzo_vendita: null, prezzo_acquisto: null, immagine_url: null, sort_order: 0,
      attivo: true, created_at: "", ...v })) }));
}

const family = { modalita_prezzo_base: "pz", prezzo_base_mode: "vendita", prezzo_base_vendita: 100,
  prezzo_base_acquisto: 60, axes: [] } as FamilyWithAxes;
const axes: AssePrezzo[] = [
  { codice: "fisso", sort_order: 0, values: [{ id: "f", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 20, maggiorazione_acquisto: 10 }] },
  { codice: "percento", sort_order: 1, values: [{ id: "p", maggiorazione_tipo: "percentuale", maggiorazione_valore: 10, maggiorazione_acquisto: 20 }] },
  { codice: "secondo", sort_order: 2, values: [{ id: "s", maggiorazione_tipo: "percentuale", maggiorazione_valore: 5, maggiorazione_acquisto: 10 }] },
];
const selections = { fisso: "f", percento: "p", secondo: "s" };
const costFamily = { ...family, manodopera_modalita: "nessuna", posa_tariffa_default_id: null,
  posa_quantita_default: 1, manodopera_costo_acquisto: 0 } as FamigliaCosto;

describe("regole varianti comuni a listino e preventivatore", () => {
  it("percentuali in cascata prima dei supplementi, stessi risultati sui due percorsi", () => {
    const generic = calcolaPrezzoFamiglia({ family: { ...family, axes: fullAxes(axes) }, selections, quantita: 2 });
    expect(generic.totale_vendita).toBe(271);
    expect(generic.totale_acquisto).toBe(178.4);
    expect(applyMaggiorazioniAssi(200, selections, axes, 1200, 1400, 2, "pz")).toBeCloseTo(generic.totale_vendita);
    expect(calcolaCostoPosizione({ family: costFamily, selections, axes, quantita: 2, larghezza: 1200, altezza: 1400 }).prodotto).toBe(generic.totale_acquisto);
  });

  it("un valore inattivo non modifica il prezzo", () => {
    const inactive = [{ ...axes[0], values: [{ ...axes[0].values[0], attivo: false }] }];
    const result = applicaPrezzoOpzioni({ vendita: 100, acquisto: 60, axes: inactive, selections, mq: null, ml: null });
    expect(result.vendita).toBe(100);
    expect(result.acquisto).toBe(60);
    expect(result.warnings[0]).toMatch(/inattivo/);
  });

  it("un prezzo sostitutivo senza costo specifico non certifica il costo precedente", () => {
    const own: AssePrezzo[] = [{ codice: "serie", values: [{ id: "x", maggiorazione_tipo: "none", prezzo_vendita: 400 }] }];
    const result = applicaPrezzoOpzioni({ vendita: 100, acquisto: 60, axes: own, selections: { serie: "x" }, mq: null, ml: null });
    expect(result.vendita).toBe(400);
    expect(result.costoCompleto).toBe(false);
    expect(calcolaCostoPosizione({ family: costFamily, axes: own, selections: { serie: "x" }, quantita: 1, larghezza: 1200, altezza: 1400 }).prodotto).toBeNull();
  });

  it("un supplemento noto non trasforma un costo base sconosciuto in un costo completo", () => {
    expect(applicaPrezzoOpzioni({ vendita: 100, acquisto: 0, axes, selections, mq: null, ml: null }).costoCompleto).toBe(false);
  });

  it("il costo proprio completo della variante può sostituire un costo base mancante", () => {
    const own: AssePrezzo[] = [{ codice: "serie", values: [{ id: "x", maggiorazione_tipo: "none", prezzo_vendita: 400, prezzo_acquisto: 250 }] }];
    const result = applicaPrezzoOpzioni({ vendita: 0, acquisto: 0, axes: own, selections: { serie: "x" }, mq: null, ml: null });
    expect(result.costoCompleto).toBe(true);
    expect(result.acquisto).toBe(250);
  });

  it.each([0, -1, NaN, Infinity])("quantità %s blocca il calcolo", quantita => {
    const result = calcolaPrezzoFamiglia({ family, selections: {}, quantita });
    expect(result.calcolo_disponibile).toBe(false);
    expect(result.totale_vendita).toBe(0);
  });

  it.each([{ griglia: [] }, { griglia: [{ valore_x: 1000, valore_y: 1000, prezzo_vendita: 200, prezzo_acquisto_netto: 100 }] }])("griglia assente o fuori misura non lascia il solo supplemento", ({ griglia }) => {
    const result = calcolaPrezzoFamiglia({ family: { ...family, modalita_prezzo_base: "griglia", axes: fullAxes(axes) },
      selections, quantita: 1, larghezza_mm: 1200, altezza_mm: 1400 }, griglia);
    expect(result.calcolo_disponibile).toBe(false);
    expect(result.totale_vendita).toBe(0);
    expect(result.maggiorazioni_applicate).toEqual([]);
  });

  it("un asse condizionato nascosto non viene conteggiato dal motore generico", () => {
    const hidden = { ...axes[0], visibile_se: { asse: "monoblocco", valori: ["yes"] } };
    const f = { ...family, axes: fullAxes([hidden]).map(a => ({ ...a, visibile_se: hidden.visibile_se })) };
    expect(calcolaPrezzoFamiglia({ family: f, selections, quantita: 1 }).unit_price_vendita).toBe(100);
  });

  it("una vecchia scelta ora disattivata non attiva supplementi condizionati", () => {
    const controllo: AssePrezzo = { codice: "monoblocco", values: [{ id: "yes", valore: "con", attivo: false, maggiorazione_tipo: "none" }] };
    const hidden = { ...axes[0], visibile_se: { asse: "monoblocco", valori: ["con"] } };
    const f = { ...family, axes: fullAxes([controllo, hidden]).map(a => a.codice === hidden.codice ? { ...a, visibile_se: hidden.visibile_se } : a) };
    const result = calcolaPrezzoFamiglia({ family: f, selections: { ...selections, monoblocco: "yes" }, quantita: 1 });
    expect(result.unit_price_vendita).toBe(100);
    expect(result.warnings[0]).toMatch(/inattivo/);
  });
});
