import { describe, expect, it } from "vitest";
import {
  calculateCompanyStructureSnapshot,
  calculateOrderStructureImpact,
  cantiereChiuso,
  destinazioneCosto,
  isOrderActiveForStructure,
  statiCheChiudono,
} from "@/lib/controlloGestione/strutturaCommessa";

describe("Struttura aziendale sulla commessa", () => {
  const today = "2026-09-30";

  it("riconosce i cantieri attivi da avanzamento, stato o date", () => {
    expect(isOrderActiveForStructure({ percentuale_avanzamento: 35 }, today)).toBe(true);
    expect(isOrderActiveForStructure({ percentuale_avanzamento: 0, status: "in_corso" }, today)).toBe(true);
    expect(isOrderActiveForStructure({ percentuale_avanzamento: 0, work_start_date: "2026-09-01", work_end_date: "2026-10-31" }, today)).toBe(true);
    expect(isOrderActiveForStructure({ percentuale_avanzamento: 100 }, today)).toBe(false);
    expect(isOrderActiveForStructure({ percentuale_avanzamento: 0, work_start_date: "2026-10-01" }, today)).toBe(false);
  });

  it("un cantiere concluso smette di consumare struttura anche con l'avanzamento sotto il 100%", () => {
    // Il caso visto in demo: lavori finiti il 15/12/2025, avanzamento fermo all'86%
    // perché l'ultima fase non è stata spuntata. Prima restava aperto per sempre.
    const fermo = { percentuale_avanzamento: 86, work_start_date: "2025-10-20", work_end_date: "2025-12-15" };
    expect(cantiereChiuso(fermo, "2026-11-25")).toBe(true);
    expect(isOrderActiveForStructure(fermo, "2026-11-25")).toBe(false);
    // Lo stato di evasione lo chiude subito, senza aspettare i 90 giorni.
    expect(cantiereChiuso({ percentuale_avanzamento: 86, work_end_date: "2026-09-20", fulfillment_status: "completed" }, today)).toBe(true);
  });

  it("la fase della commessa chiude il cantiere: l'ultima operativa e l'assistenza", () => {
    // Le fasi come le configura l'azienda: l'ultima operativa è «Lavori completati»,
    // «Assistenza» è di supporto e viene dopo, ma il cantiere lì è già finito.
    const chiusi = statiCheChiudono([
      { id: "firmato", position: 0, is_support_phase: false },
      { id: "in_corso", position: 7, is_support_phase: false },
      { id: "completati", position: 8, is_support_phase: false },
      { id: "assistenza", position: 9, is_support_phase: true },
    ]);
    expect([...chiusi].sort()).toEqual(["assistenza", "completati"]);
    const aMeta = { percentuale_avanzamento: 60, work_start_date: "2026-08-01", work_end_date: "2026-10-31" };
    expect(cantiereChiuso({ ...aMeta, current_status_id: "completati" }, today, chiusi)).toBe(true);
    expect(cantiereChiuso({ ...aMeta, current_status_id: "assistenza" }, today, chiusi)).toBe(true);
    expect(cantiereChiuso({ ...aMeta, current_status_id: "in_corso" }, today, chiusi)).toBe(false);
    // Senza le fasi configurate il giudizio resta quello di avanzamento e date.
    expect(cantiereChiuso({ ...aMeta, current_status_id: "completati" }, today)).toBe(false);
  });

  it("un ritardo vero resta aperto: deve continuare a costare", () => {
    // Fine prevista tre settimane fa, metà lavori fatti: il cantiere è in ritardo,
    // non finito, e la struttura che consuma è proprio il costo del ritardo.
    const inRitardo = { percentuale_avanzamento: 50, work_start_date: "2026-06-01", work_end_date: "2026-09-09" };
    expect(cantiereChiuso(inRitardo, today)).toBe(false);
    expect(isOrderActiveForStructure(inRitardo, today)).toBe(true);
  });

  it("i mesi di un cantiere chiuso si fermano alla fine lavori, non corrono fino a oggi", () => {
    const comune = { directMargin: 20000, revenue: 90000, monthlyPerActiveOrder: 1000, today: "2026-11-25" };
    const chiuso = calculateOrderStructureImpact({
      ...comune, workStartDate: "2025-10-20", workEndDate: "2025-12-15", progressPercent: 86,
    });
    expect(chiuso.months).toBeCloseTo(1.84, 2);
    expect(chiuso.allocatedStructure).toBeCloseTo(1840, -1);
    const aperto = calculateOrderStructureImpact({
      ...comune, workStartDate: "2026-10-20", workEndDate: null, progressPercent: 50,
    });
    expect(aperto.months).toBeCloseTo(1.2, 1);
  });

  it("la categoria decide il secchio: cantiere, già contato, struttura", () => {
    expect(destinazioneCosto({ category: "subappalti" })).toBe("cantiere");
    expect(destinazioneCosto({ category: "Subappalto" })).toBe("cantiere");
    expect(destinazioneCosto({ category: "merci" })).toBe("cantiere");
    expect(destinazioneCosto({ category: "INPS" })).toBe("gia_contato");
    expect(destinazioneCosto({ category: "f24" })).toBe("gia_contato");
    expect(destinazioneCosto({ category: "stipendi" })).toBe("gia_contato");
    expect(destinazioneCosto({ category: "materiali", purchase_order_id: "oda-1" })).toBe("gia_contato");
    // «ferramenta» comincia per f come «f24»: non deve finire fra i già contati.
    expect(destinazioneCosto({ category: "ferramenta" })).toBe("struttura");
    expect(destinazioneCosto({ category: "commercialista" })).toBe("struttura");
    expect(destinazioneCosto({ category: null })).toBe("struttura");
  });

  it("i costi di cantiere senza commessa e i contributi restano fuori dalla struttura", () => {
    const snapshot = calculateCompanyStructureSnapshot({
      fixedCosts: [
        { amount: 1000, recurrence: "monthly", category: "affitti", cost_type: "fixed" },
        { amount: 30000, recurrence: "once", category: "subappalti", cost_type: "variable" },
        { amount: 2500, recurrence: "monthly", category: "INPS", cost_type: "fixed" },
      ],
      employees: [],
      operationalEmployeeIds: [],
      orders: [],
      today,
    });
    expect(snapshot.fixedCostsMonthly).toBe(1000);
    expect(snapshot.daAttribuire).toEqual({ righe: 1, totale: 30000 });
    expect(snapshot.giaContati).toEqual({ righe: 1, totale: 2500 });
  });

  it("separa personale operativo e ufficio senza duplicare la manodopera", () => {
    const snapshot = calculateCompanyStructureSnapshot({
      fixedCosts: [
        { amount: 1200, recurrence: "monthly" },
        { amount: 1200, recurrence: "yearly" },
        { amount: 500, recurrence: "once" },
      ],
      employees: [
        { id: "operaio", gross_salary: 2000, inps_rate: 30, role_type: "operaio", area: "cantiere" },
        { id: "ufficio", gross_salary: 1500, inps_rate: 20, role_type: "staff_interno", area: "amministrazione" },
      ],
      operationalEmployeeIds: ["operaio"],
      orders: [{ percentuale_avanzamento: 25 }, { status: "in corso" }, { percentuale_avanzamento: 100 }],
      today,
    });

    expect(snapshot.fixedCostsMonthly).toBe(1300);
    // Costo vero del mese: impiegato 1500 × 14/12 × 127,91%; operaio 2000 × 167,41%.
    expect(snapshot.officeSalariesMonthly).toBe(2238.43);
    expect(snapshot.directLaborSalariesMonthly).toBe(3348.2);
    expect(snapshot.monthlyStructure).toBe(3538.43);
    expect(snapshot.activeOrders).toBe(2);
    expect(snapshot.monthlyPerActiveOrder).toBeCloseTo(1769.215, 3);
  });

  it("stima l'incidenza fino a oggi per una commessa aperta", () => {
    const impact = calculateOrderStructureImpact({
      directMargin: 10_000,
      revenue: 40_000,
      monthlyPerActiveOrder: 1000,
      workStartDate: "2026-07-01",
      workEndDate: "2026-12-31",
      progressPercent: 60,
      today,
    });

    expect(impact.months).toBeCloseTo(2.99, 1);
    expect(impact.allocatedStructure).toBeCloseTo(2990, -1);
    expect(impact.marginAfterStructure).toBeCloseTo(7010, -1);
    expect(impact.marginAfterStructurePct).toBeCloseTo(17.5, 1);
  });

  it("ferma la struttura alla data di fine quando lo schema storico non ha l'avanzamento", () => {
    const impact = calculateOrderStructureImpact({
      directMargin: 10_000,
      revenue: 40_000,
      monthlyPerActiveOrder: 1000,
      workStartDate: "2026-01-01",
      workEndDate: "2026-03-01",
      progressPercent: null,
      today,
    });

    expect(impact.months).toBeCloseTo(1.94, 1);
    expect(impact.allocatedStructure).toBeCloseTo(1940, -1);
  });

  it("non inventa una quota quando mancano costi, cantieri o data di avvio", () => {
    expect(calculateCompanyStructureSnapshot({
      fixedCosts: [], employees: [], operationalEmployeeIds: [], orders: [], today,
    }).monthlyPerActiveOrder).toBeNull();
    expect(calculateOrderStructureImpact({
      directMargin: 1000,
      revenue: 5000,
      monthlyPerActiveOrder: 500,
      workStartDate: null,
      workEndDate: null,
      progressPercent: 20,
      today,
    }).allocatedStructure).toBeNull();
  });
});
