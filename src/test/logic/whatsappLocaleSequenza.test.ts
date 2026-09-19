import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  leggiFasceOrarie,
  minutiAllaFascia,
  minutiAllaRiapertura,
  type FinestraInvioArgs,
} from "../../../supabase/functions/_shared/openwaFinestraInvio";

// 19/09/2026 — i WhatsApp della sequenza «PDF Vendita» partono da soli da
// Flo 1: nelle fasce del passo (8-12, 14-20), dentro la finestra generale dei
// numeri, e chi risponde su WhatsApp esce dalla sequenza.

const ore = (h: number, m = 0) => h * 60 + m;
// Finestra generale di oggi: 7:30–19:00, weekend chiuso.
const finestra = (weekday: number, minutiOra: number): FinestraInvioArgs => ({
  minutiOra, weekday, startMinuti: ore(7, 30), endMinuti: ore(19), weekendAperto: false, sabatoFinoMinuti: null,
});

describe("fra quanto riapre la finestra dei numeri", () => {
  it("aperta adesso: zero", () => {
    expect(minutiAllaRiapertura(finestra(3, ore(10)))).toBe(0);
  });

  it("martedì sera: mercoledì alle 7:30", () => {
    expect(minutiAllaRiapertura(finestra(2, ore(20)))).toBe(ore(11, 30));
  });

  it("venerdì sera: lunedì mattina, non «fallito» dopo 48 ore", () => {
    const attesa = minutiAllaRiapertura(finestra(5, ore(19, 30)));
    // 4h30 a mezzanotte + sabato + domenica + 7h30 di lunedì = 60 ore
    expect(attesa).toBe(ore(60));
    expect(attesa).toBeGreaterThan(48 * 60);
  });

  it("sabato mattina aperto fino alle 13 se impostato", () => {
    expect(minutiAllaRiapertura({ ...finestra(6, ore(9)), sabatoFinoMinuti: ore(13) })).toBe(0);
    expect(minutiAllaRiapertura({ ...finestra(6, ore(14)), sabatoFinoMinuti: ore(13) })).toBe(ore(41, 30));
  });

  it("finestra che non apre mai: si riprova fra 8 giorni, senza girare all'infinito", () => {
    expect(minutiAllaRiapertura({ ...finestra(1, ore(10)), startMinuti: ore(20), endMinuti: ore(8) })).toBe(8 * 24 * 60);
  });
});

describe("fasce orarie del passo", () => {
  it("si leggono come le scrive una persona", () => {
    expect(leggiFasceOrarie("8-12, 14-20")).toEqual([{ da: ore(8), a: ore(12) }, { da: ore(14), a: ore(20) }]);
    expect(leggiFasceOrarie("14:30–19:30; 8:15-12")).toEqual([{ da: ore(8, 15), a: ore(12) }, { da: ore(14, 30), a: ore(19, 30) }]);
    expect(leggiFasceOrarie("")).toEqual([]);
    expect(leggiFasceOrarie(null)).toEqual([]);
    expect(leggiFasceOrarie("sempre, 12-8, 9-9")).toEqual([]);
  });

  it("dentro una fascia si parte, fuori si aspetta la prossima", () => {
    const fasce = leggiFasceOrarie("8-12, 14-20");
    expect(minutiAllaFascia(ore(9), fasce)).toBe(0);
    expect(minutiAllaFascia(ore(12, 30), fasce)).toBe(90);
    expect(minutiAllaFascia(ore(7, 40), fasce)).toBe(20);
    // Dopo le 20: domani alle 8.
    expect(minutiAllaFascia(ore(21), fasce)).toBe(ore(11));
    // Alle 12 in punto la fascia del mattino è chiusa.
    expect(minutiAllaFascia(ore(12), fasce)).toBe(ore(2));
  });

  it("nessuna fascia: nessun vincolo", () => {
    expect(minutiAllaFascia(ore(23), [])).toBe(0);
  });
});

describe("il motore usa numero scelto, fasce e risposte su WhatsApp", () => {
  const motore = readFileSync(join(__dirname, "../../../supabase/functions/process-automation/index.ts"), "utf8");
  const invio = readFileSync(join(__dirname, "../../../supabase/functions/_shared/openwaSend.ts"), "utf8");

  it("il numero scelto nel passo arriva all'invio", () => {
    expect(motore).toMatch(/numberId: numeroScelto/);
  });

  it("fuori fascia o fuori finestra si rinvia all'apertura, non ogni ora", () => {
    expect(motore).toMatch(/minutiAllaFascia\(romeMinuti\(\), leggiFasceOrarie\(cfg\.fasce_orarie\)\)/);
    expect(motore).toMatch(/res\.motivo === "fuori_orario" && res\.riapreTraMinuti/);
    expect(invio).toMatch(/riapreTraMinuti: minutiAllaRiapertura\(finestra\)/);
  });

  it("chi risponde su WhatsApp esce dalla sequenza", () => {
    expect(motore).toMatch(/from\("openwa_messages"\)\s*\.select\("id"\)\.eq\("contact_id", item\.entity_id\)\.eq\("direction", "inbound"\)/);
  });
});
