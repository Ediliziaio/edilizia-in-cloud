import { describe, expect, it } from "vitest";
import {
  analizzaCause,
  classifySemaforo,
  computeScostamenti,
  formatEuroCompact,
  formatScostamentiForChat,
  num,
  semaforoEmoji,
  summarizeScostamenti,
  toScostamento,
  type OrdineMarginalitaRow,
} from "@/lib/commesse/scostamenti";

/** Helper: riga vista con default sensati (numerici come stringa, come fa Postgres). */
function row(overrides: Partial<OrdineMarginalitaRow> & { id: string }): OrdineMarginalitaRow {
  return {
    id: overrides.id,
    order_code: overrides.order_code ?? null,
    description: overrides.description ?? null,
    cliente_nome: overrides.cliente_nome ?? null,
    preventivo_contratto: overrides.preventivo_contratto ?? null,
    preventivo_totale: overrides.preventivo_totale ?? null,
    variazioni_approvate: overrides.variazioni_approvate ?? null,
    costo_acquisti: overrides.costo_acquisti ?? null,
    costo_errori: overrides.costo_errori ?? null,
    consuntivo: overrides.consuntivo ?? null,
    margine: overrides.margine ?? null,
    margine_perc: overrides.margine_perc ?? null,
  };
}

// Fixtures ispirate ai dati reali di prod (v_ordine_marginalita).
const A = row({
  id: "A",
  order_code: "ORD-2026-024",
  description: "Rivestimento facciata ventilata",
  preventivo_totale: "37000.00",
  consuntivo: "25160.00",
  costo_acquisti: "25160.00",
  margine: "11840.00",
  margine_perc: "32.0",
}); // verde
const B = row({
  id: "B",
  order_code: "ORD-2025-001",
  description: "Cappotto termico",
  preventivo_totale: "22000.00",
  consuntivo: "22440.00",
  costo_acquisti: "20440.00",
  costo_errori: "2000",
  margine: "-440.00",
  margine_perc: "-2.0",
}); // rosso / in perdita
const C = row({
  id: "C",
  order_code: "ORD-2026-099",
  description: "Tinteggiatura",
  preventivo_totale: "10000",
  consuntivo: "9000",
  margine: "1000",
  margine_perc: "10.0",
}); // giallo
const D = row({
  id: "D",
  order_code: "ORD-2026-100",
  description: "Nuovo cantiere",
  preventivo_totale: "5000",
  consuntivo: "0",
  margine: "5000",
  margine_perc: "100",
}); // grigio (non consuntivato)
const E = row({
  id: "E",
  order_code: "ORD-2026-101",
  description: "Senza contratto",
  preventivo_totale: "0",
  consuntivo: "100",
  margine: "-100",
  margine_perc: "0",
}); // escluso: preventivo 0

describe("num", () => {
  it("coerce stringhe, numeri, null e NaN", () => {
    expect(num("25160.00")).toBe(25160);
    expect(num(42)).toBe(42);
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num("abc")).toBe(0);
    expect(num(-440)).toBe(-440);
  });
});

describe("classifySemaforo", () => {
  it("grigio se consuntivazione non avviata", () => {
    expect(classifySemaforo(100, false)).toBe("grigio");
  });
  it("rosso se margine % negativo", () => {
    expect(classifySemaforo(-2, true)).toBe("rosso");
  });
  it("giallo se tra 0 e soglia", () => {
    expect(classifySemaforo(0, true)).toBe("giallo");
    expect(classifySemaforo(14.9, true)).toBe("giallo");
  });
  it("verde se >= soglia", () => {
    expect(classifySemaforo(15, true)).toBe("verde");
    expect(classifySemaforo(32, true)).toBe("verde");
  });
});

describe("toScostamento", () => {
  it("mappa i campi e coerce numerici-stringa", () => {
    const s = toScostamento(A);
    expect(s.preventivo).toBe(37000);
    expect(s.consuntivo).toBe(25160);
    expect(s.margine).toBe(11840);
    expect(s.marginePerc).toBe(32);
    expect(s.semaforo).toBe("verde");
    expect(s.isInPerdita).toBe(false);
    expect(s.incidenzaCosti).toBeCloseTo(25160 / 37000, 6);
  });

  it("riconosce la perdita e classifica rosso", () => {
    const s = toScostamento(B);
    expect(s.margine).toBe(-440);
    expect(s.isInPerdita).toBe(true);
    expect(s.semaforo).toBe("rosso");
    expect(s.costoErrori).toBe(2000);
  });

  it("usa preventivo_contratto come fallback se preventivo_totale è 0/null", () => {
    expect(toScostamento(row({ id: "x", preventivo_totale: null, preventivo_contratto: "8000" })).preventivo).toBe(8000);
    expect(toScostamento(row({ id: "y", preventivo_totale: "0", preventivo_contratto: "8000" })).preventivo).toBe(8000);
  });

  it("fornisce una descrizione di fallback", () => {
    expect(toScostamento(row({ id: "z", description: null })).description).toBe("Commessa senza descrizione");
  });
});

describe("analizzaCause", () => {
  it("segnala sforamento + errori per la commessa in perdita", () => {
    const cause = toScostamento(B).cause;
    const tipi = cause.map((c) => c.tipo);
    expect(tipi).toContain("sforamento");
    expect(tipi).toContain("errori");
    // Entrambe gravi: margine negativo + costi oltre il preventivo.
    expect(cause.every((c) => c.gravita === "alta")).toBe(true);
    // La causa principale (sforamento) è ordinata per prima.
    expect(cause[0].tipo).toBe("sforamento");
  });

  it("segnala incidenza alta per commessa sotto soglia senza errori", () => {
    expect(toScostamento(C).cause.map((c) => c.tipo)).toEqual(["incidenza_alta"]);
  });

  it("nessuna causa per commessa sana o non consuntivata", () => {
    expect(toScostamento(A).cause).toEqual([]);
    expect(toScostamento(D).cause).toEqual([]);
  });

  it("classifica errori come 'media' se il margine resta capiente", () => {
    const cause = analizzaCause({
      preventivo: 100000,
      consuntivo: 50000,
      costoErrori: 5000, // 5% del preventivo, ma margine residuo 50k >> errori
      margine: 50000,
      incidenzaCosti: 0.5,
    });
    expect(cause.map((c) => c.tipo)).toEqual(["errori"]);
    expect(cause[0].gravita).toBe("media");
  });

  it("ignora errori sotto la soglia di incidenza (< 2%)", () => {
    const cause = analizzaCause({
      preventivo: 100000,
      consuntivo: 50000,
      costoErrori: 1000, // 1% < 2%
      margine: 50000,
      incidenzaCosti: 0.5,
    });
    expect(cause).toEqual([]);
  });
});

describe("computeScostamenti", () => {
  it("esclude commesse senza preventivo e ordina dal più a rischio", () => {
    const res = computeScostamenti([A, B, C, D, E]);
    // E escluso (preventivo 0). Ordine: B (perdita) → C (10%) → A (32%) → D (grigio 100%)
    expect(res.map((r) => r.id)).toEqual(["B", "C", "A", "D"]);
  });

  it("rispetta minPreventivo", () => {
    expect(computeScostamenti([D]).map((r) => r.id)).toEqual(["D"]);
    expect(computeScostamenti([D], { minPreventivo: 5000 })).toHaveLength(0);
  });

  it("input vuoto → array vuoto", () => {
    expect(computeScostamenti([])).toEqual([]);
  });
});

describe("summarizeScostamenti", () => {
  it("aggrega i KPI di portafoglio (esclude preventivo 0)", () => {
    const k = summarizeScostamenti([A, B, C, D, E]);
    expect(k.nCommesse).toBe(4); // A,B,C,D
    expect(k.nConCosti).toBe(3); // A,B,C (D ha consuntivo 0)
    expect(k.nInPerdita).toBe(1); // B
    expect(k.nSottoSoglia).toBe(1); // C (10% < 15, non in perdita)
    expect(k.nConErrori).toBe(1); // B (errori 2000 = 9.1% del preventivo)
    expect(k.nConSforamento).toBe(1); // B (consuntivo 22440 > preventivo 22000)
    expect(k.preventivoTotale).toBe(74000);
    expect(k.consuntivoTotale).toBe(56600);
    expect(k.margineTotale).toBe(17400);
    expect(k.margineMedioPerc).toBeCloseTo((17400 / 74000) * 100, 6);
    expect(k.peggiore?.id).toBe("B");
  });

  it("input vuoto → KPI azzerati e peggiore null", () => {
    const k = summarizeScostamenti([]);
    expect(k.nCommesse).toBe(0);
    expect(k.margineMedioPerc).toBe(0);
    expect(k.peggiore).toBeNull();
  });
});

describe("formatEuroCompact / semaforoEmoji", () => {
  it("formatta in EUR all'italiana senza decimali", () => {
    expect(formatEuroCompact(1234567)).toBe("1.234.567 €");
    expect(formatEuroCompact(25160)).toBe("25.160 €");
    expect(formatEuroCompact(-440)).toBe("-440 €");
  });
  it("mappa i semafori a emoji", () => {
    expect(semaforoEmoji("rosso")).toBe("🔴");
    expect(semaforoEmoji("verde")).toBe("🟢");
    expect(semaforoEmoji("grigio")).toBe("⚪");
  });
});

describe("formatScostamentiForChat", () => {
  it("messaggio dedicato quando non ci sono commesse", () => {
    const msg = formatScostamentiForChat(summarizeScostamenti([]), []);
    expect(msg).toContain("Non ho trovato commesse");
  });

  it("include KPI, conteggio perdite e top a rischio", () => {
    const summary = summarizeScostamenti([A, B, C, D]);
    const top = computeScostamenti([A, B, C, D]).slice(0, 3);
    const msg = formatScostamentiForChat(summary, top);
    expect(msg).toContain("Marginalità commesse");
    expect(msg).toContain("🔴 1 in perdita");
    expect(msg).toContain("#ORD-2025-001"); // la commessa in perdita
    expect(msg).toContain("Più a rischio");
    // Cause: nota di portafoglio + causa principale sotto la riga.
    expect(msg).toContain("sforamento costi");
    expect(msg).toContain("errori/rilavorazioni");
    expect(msg).toContain("Costi oltre il preventivo"); // causa sforamento di B
  });
});
