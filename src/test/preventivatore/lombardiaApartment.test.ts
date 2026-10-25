import { describe, expect, it } from "vitest";
import { calcolaTotaliPreventivo } from "@/hooks/usePreventivoCosti";
import { advanceApartment, apartmentQuoteItems, apartmentSimulations, apartmentCodes, buildApartmentLines,
  type ApartmentConversation, type ApartmentMeasurements } from "@/lib/preventivi/devLombardiaApartment";
import { source, catalog, simulate, approved } from "./apartmentFixtures";

describe("Caso Lombardia: riuso fonte esistente, senza prezzi runtime incorporati", () => {
  it.each(apartmentSimulations.map((scenario, index) => [scenario.name, index] as const))("completa il dialogo guidato: %s", (_, index) => {
    expect(simulate(index).step).toBe("review");
  });
  it("usa solo i codici di questa edizione e la fonte selezionata", () => {
    expect(apartmentCodes).toHaveLength(12); expect(new Set(apartmentCodes).size).toBe(12);
    const rows = buildApartmentLines(source, [...catalog, ...catalog.map(r => ({ ...r, fonte_id: "altra" }))], simulate(0).measurements, approved, true);
    expect(apartmentQuoteItems(rows)).toHaveLength(9);
    expect(calcolaTotaliPreventivo(apartmentQuoteItems(rows), 0, 0).subtotale_netto).toBe(44800);
  });
  it("non usa un'edizione recente al posto di quella richiesta né fonti non pubblicate", () => {
    for (const patch of [{ anno: 2026 }, { regione: "Veneto" }, { stato: "bozza" }]) {
      const rows = buildApartmentLines({ ...source, ...patch }, catalog, simulate(0).measurements, approved, true);
      expect(rows.every(r => !!r.issue)).toBe(true); expect(apartmentQuoteItems(rows)).toHaveLength(0);
    }
  });
  it("richiede conferma edizione e specifiche, non emette un'offerta automaticamente", () => {
    expect(apartmentQuoteItems(buildApartmentLines(source, catalog, simulate(0).measurements, approved))).toHaveLength(0);
    expect(apartmentQuoteItems(buildApartmentLines(source, catalog, simulate(0).measurements, {}, true))).toHaveLength(0);
  });
  it("non deduce pareti, rivestimenti e sanitari dagli 80 mq", () => {
    const next = advanceApartment({ step: "request", measurements: {} }, apartmentSimulations[0].answers[0]).next;
    expect(next.measurements).toEqual({});
    expect(apartmentQuoteItems(buildApartmentLines(source, catalog, simulate(1).measurements, approved, true))).toHaveLength(0);
  });
  it("mantenere il pavimento esclude demolizione, pavimento nuovo e sottofondo", () => {
    const rows = buildApartmentLines(source, catalog, simulate(2).measurements, approved, true);
    expect(rows.some(r => ["floor", "floorRemoval", "screed", "bidet"].includes(r.key))).toBe(false);
    expect(apartmentQuoteItems(rows)).toHaveLength(6);
  });
  it("la distribuzione modificata aggiunge solo le due superfici dichiarate", () => {
    const rows = buildApartmentLines(source, catalog, simulate(3).measurements, approved, true);
    expect(rows.find(r => r.key === "partition")?.quantity).toBe(12);
    expect(rows.find(r => r.key === "partitionRemoval")?.quantity).toBe(12);
    expect(apartmentQuoteItems(rows)).toHaveLength(11);
  });
  it.each([null, "ml", "cad"])("blocca unità mancante/incompatibile: %s", unit => {
    const rows = buildApartmentLines(source, catalog.map(r => r.id === "floor" ? { ...r, unita_misura: unit } : r), simulate(0).measurements, approved, true);
    expect(rows.find(r => r.key === "floor")?.included).toBe(false);
    expect(rows.find(r => r.key === "floor")?.issue).toMatch(/Unità/);
  });
  it.each([null, "", "NaN", "Infinity", "0", "-12", "1000001"])("non confonde un prezzo invalido con una voce gratuita: %s", prezzo => {
    const rows = buildApartmentLines(source, catalog.map(r => r.id === "floor" ? { ...r, prezzo } : r), simulate(0).measurements, approved, true);
    expect(rows.find(r => r.key === "floor")?.price).toBeNull();
    expect(rows.find(r => r.key === "floor")?.included).toBe(false);
  });
  it("codici duplicati non sono risolti scegliendo arbitrariamente il primo", () => {
    const rows = buildApartmentLines(source, [...catalog, catalog[0]], simulate(0).measurements, approved, true);
    expect(rows.find(r => r.key === "floorRemoval")?.issue).toMatch(/duplicato/);
  });
  it("un prezzo manuale non ripara un codice regionale inesistente", () => {
    const rows = buildApartmentLines(source, catalog, simulate(0).measurements, { screed: { price: 20, approved: true } }, true);
    expect(rows.find(r => r.key === "screed")?.included).toBe(false);
  });
  it("mantiene le modifiche manuali e la provenienza anche quando cambia un'altra misura", () => {
    const overrides = { floor: { quantity: 70, price: 55, approved: true } };
    const rows = buildApartmentLines(source, catalog, { ...simulate(0).measurements, paint: 250 }, overrides, true);
    const floor = rows.find(r => r.key === "floor")!;
    expect([floor.quantity, floor.price, floor.referencePrice]).toEqual([70, 55, 100]);
    expect(apartmentQuoteItems(rows)[0].description).toMatch(/manualmente/);
    expect(apartmentQuoteItems(rows)[0].prezzo_acquisto).toBeNull();
    expect(overrides.floor.price).toBe(55);
  });
  it.each([null, NaN, Infinity, -1, 1000001])("blocca quantità invalide: %s", qty => {
    const measures: ApartmentMeasurements = { ...simulate(0).measurements, floor: qty };
    expect(buildApartmentLines(source, catalog, measures, approved, true).find(r => r.key === "floor")?.included).toBe(false);
  });
  it("i risultati ripetuti hanno identità stabili, non accumulano duplicati", () => {
    const items = () => apartmentQuoteItems(buildApartmentLines(source, catalog, simulate(0).measurements, approved, true));
    expect(items()).toEqual(items()); expect(new Set(items().map(r => r.client_temp_id)).size).toBe(9);
  });
  it("conserva descrizione e unità originali quando l'utente personalizza una voce", () => {
    const rows = buildApartmentLines(source, catalog, simulate(0).measurements, { floor: { title: "Nuovo titolo", description: "Nuovo testo", unit: "cad", quantity: 1, price: 500, approved: true } }, true);
    const row = rows.find(r => r.key === "floor")!;
    expect(row.included).toBe(true); expect(row.manualUnit).toBe(true); expect(row.referenceUnit).toBe("m²");
    expect(row.referencePrice).toBe(100); expect(row.referenceDescription).toContain("Specifiche demo"); expect(row.description).toBe("Nuovo testo");
    expect(apartmentQuoteItems(rows)[0].description).toContain("non confrontabile");
  });
});

describe("Dialogo: niente estrazioni ottimistiche da risposte ambigue", () => {
  it.each(["40-60 mq", "non 240 mq", "1.000 mq", "20 x 12", "240", "240 mq oppure 260 mq", "0 mq", "1000001 mq"])("chiede chiarimento: %s", text => {
    const state: ApartmentConversation = { step: "paint", measurements: {} };
    expect(advanceApartment(state, text).next).toBe(state);
  });
  it("accetta decimali italiani e m² senza inventare il contorno", () => {
    expect(advanceApartment({ step: "paint", measurements: {} }, "240,5 m²").next.measurements.paint).toBe(240.5);
  });
  it.each(["80 mq netti non rimuovo", "80 mq commerciali, rimuovo e rifaccio", "90 mq netti, rimuovo e rifaccio"])("non assume pavimento netto: %s", text => {
    const state: ApartmentConversation = { step: "floor", measurements: {} }; expect(advanceApartment(state, text).next).toBe(state);
  });
  it.each(["1 WC", "1 WC, 1 lavabo, 0,5 bidet, 1 doccia", "non 1 WC, 1 lavabo, 1 bidet, 1 doccia", "11 WC, 1 lavabo, 1 bidet, 1 doccia"])("richiede quantità esplicite per sanitari: %s", text => {
    const state: ApartmentConversation = { step: "fixtures", measurements: {} }; expect(advanceApartment(state, text).next).toBe(state);
  });
  it("ferma il turno in presenza di materiale pericoloso, senza prezzo inventato", () => {
    const state: ApartmentConversation = { step: "floor", measurements: {} };
    const result = advanceApartment(state, "80 mq con amianto"); expect(result.next).toBe(state); expect(result.reply).toMatch(/verifica tecnica/);
  });
  it("non sostituisce modifiche manuali con un comando generico a fine dialogo", () => {
    const state = simulate(0); expect(advanceApartment(state, "rifai tutto").next).toBe(state);
  });
});
