import { describe, expect, it } from "vitest";
import { groupSerramentiAdvanced } from "@/components/serramenti/SerramentoPDF";
import { disegnoDaConfig, type DisegnoConfig } from "@/lib/serramenti/disegnoDaFamiglia";
import { calcolaFornituraSerramento, offertaDaListino, type OffertaSerramento } from "@/lib/serramenti/fornitureConfigurazione";
import { erroreNuovoOda, righeDagliArticoli, righePerDatabase } from "@/lib/orders/nuovoOdaCommessa";
import { pendingMaterials, planMaterial, procurementLines, type ProcurementItem } from "@/lib/orders/materialProcurement";
import { creaPdfOperativo } from "@/lib/documentiOperativi/pdf";
import type { SrSerramentoRow } from "@/types/serramenti";

const geometria = { v: 1, tipologia: "finestra_2_ante" } satisfies DisegnoConfig;
const serieA = "Profilo A 76";
const serieB = "Profilo B 82";
const specificheA = "PVC 76 mm, doppio vetro";
const specificheB = "PVC 82 mm, triplo vetro";
const misure = [
  { L: 1000, H: 1400, vendA: 728, costoA: 490, vendB: 810, costoB: 540 },
  { L: 1200, H: 1500, vendA: 936, costoA: 630, vendB: 1010, costoB: 690 },
  { L: 1400, H: 1600, vendA: 1164.8, costoA: 784, vendB: 1240, costoB: 850 },
];

const a = offertaDaListino({
  id: "tariffa-a", codice: "A-2A", unita: "m²", prezzo: 400, sconto_pct: 12.5,
  configurazione_serramento: { tipologia: geometria.tipologia, serie: serieA, specifiche: specificheA, vendita: 520, iva_acquisto: 22 },
  listino: { supplier_id: "a", nome: "Listino demo A", fornitore: { name: "Fornitore demo A" } },
})!;

function offertaB(m: typeof misure[number]): OffertaSerramento {
  return {
    id: `tariffa-b-${m.L}`, codice: `B-2A-${m.L}`, unita: "pz", acquistoNetto: m.costoB,
    fornitoreId: "b", fornitore: "Fornitore demo B", listino: "Listino demo B",
    configurazione: { tipologia: geometria.tipologia, serie: serieB, specifiche: specificheB, vendita: m.vendB, iva_acquisto: 22,
      larghezza_mm: m.L, altezza_mm: m.H },
  };
}

function rigaPreventivo(offerta: OffertaSerramento, L: number, H: number) {
  const f = calcolaFornituraSerramento(offerta, L, H)!;
  return {
    id: offerta.id, family_id: "finestra", tipologia: "finestra_2ante", tipologia_label: "Finestra a 2 ante",
    larghezza_mm: L, altezza_mm: H, quantita: 1, prezzo_unitario: f.vendita_unitaria, prezzo_totale: f.vendita_unitaria,
    disegno_config: geometria, fornitura_listino: f, note: "Posizione del cliente",
  } as SrSerramentoRow;
}

describe("finestra a 2 ante: preventivo e acquisto da due listini", () => {
  it.each(misure)("condivide il disegno $L×$H e conserva prezzi, codici e specifiche per fornitore", (m) => {
    const sa = rigaPreventivo(a, m.L, m.H);
    const sb = rigaPreventivo(offertaB(m), m.L, m.H);
    const disegna = (s: SrSerramentoRow) => disegnoDaConfig(s.disegno_config!, s.larghezza_mm!, s.altezza_mm!);
    expect(disegna(sa)?.viste).toHaveLength(2);
    expect(disegna(sa)).toEqual(disegna(sb));
    const bom = groupSerramentiAdvanced([sa, sb]);
    expect(bom).toMatchObject([
      { prezzo_totale: m.vendA, serieFornitore: serieA, note: expect.stringContaining(`A-2A · ${specificheA}`) },
      { prezzo_totale: m.vendB, serieFornitore: serieB, note: expect.stringContaining(`B-2A-${m.L} · ${specificheB}`) },
    ]);
    expect(bom[0]).not.toHaveProperty("fornitura_listino");
    expect(sa.fornitura_listino?.acquisto_unitario).toBe(m.costoA);
    expect(sb.fornitura_listino?.acquisto_unitario).toBe(m.costoB);

    const articoli = [sa, sb].map((riga): ProcurementItem => ({
      id: riga.id, name: riga.tipologia_label!, quantity: 1, unita_misura: "pz",
      supplier_id: riga.fornitura_listino!.supplier_id, product_code: riga.fornitura_listino!.codice,
      purchase_price: riga.fornitura_listino!.acquisto_unitario, vat_rate: 10,
      measure_status: "confermato", misure_preventivo: { larghezza: m.L, altezza: m.H },
      misure_da_ordinare: { larghezza_mm: m.L, altezza_mm: m.H },
      prezzo_fonte: "listino", axis_selections: { _fornitura_su_misura: "listino_fornitore", _iva_acquisto_listino: "22" },
      specifiche: riga.fornitura_listino!.specifiche,
    }));
    for (const [i, costo] of [m.costoA, m.costoB].entries()) {
      const articolo = articoli[i];
      const fornitore = articolo.supplier_id!;
      const righe = righeDagliArticoli(pendingMaterials(articoli, []), fornitore);
      expect(righe[i].dettaglio_fornitura).toContain(`${articolo.product_code} · ${m.L} × ${m.H} mm`);
      expect(righePerDatabase(righe, "demo", "oda")).toMatchObject([
        { description: "Finestra a 2 ante", unit_price: costo, vat_rate: 22, order_item_id: articolo.id },
      ]);
      expect(procurementLines([articolo])[0]).toMatchObject({
        description: "Finestra a 2 ante", unit_price: costo, unit_of_measure: "pz",
      });
      expect(erroreNuovoOda({ fornitore: i === 0 ? "b" : "a", origine: "email", righe })).toMatch(/fornitore/);
      expect(planMaterial({ ...articolo, measure_status: "da_rilevare" }, []).canOrder).toBe(false);
      expect(planMaterial({ ...articolo, misure_da_ordinare: { larghezza: m.L + 5, altezza: m.H } }, []).canOrder).toBe(false);
    }
  });

  it("stampa il codice fornitore con le misure e le specifiche nel PDF dell'OdA", () => {
    const pdf = creaPdfOperativo({
      tipo: "materiali", numero: "ODA-DEMO-A", data: "2026-11-21",
      destinatario: { nome: "Fornitore demo A" },
      righe: [{
        descrizione: "Finestra a 2 ante · 1000 × 1400 mm · Doppio vetro",
        specifiche: { sku: "A-2A" }, unita: "pz", quantita: 1, prezzo: 490, iva: 22, importo: 490,
      }],
    }, { id: "demo", name: "Azienda demo" });
    const testo = pdf.output();
    expect(testo).toContain("Codice: A-2A");
    expect(testo).toContain("1000 × 1400 mm");
    expect(testo).toContain("Doppio vetro");
    expect(testo).toContain("490,00");
  });

  it("una tariffa a misura esatta richiede entrambe le dimensioni", () => {
    const base = misure[0];
    expect(calcolaFornituraSerramento(offertaB(base), base.L + 1, base.H)).toBeNull();
    expect(calcolaFornituraSerramento(a, base.L, null)).toBeNull();
  });
});
