/**
 * Cadenza dei generatori AI dell'outreach: un follow-up ogni 4 giorni, qualunque
 * cosa proponga il modello (regola del founder del 25/09/2026).
 */
import { describe, expect, it } from "vitest";
import {
  applicaCadenzaFlusso, giornoDelPassoLineare, GIORNI_TRA_FOLLOWUP,
} from "../../../supabase/functions/_shared/outreach-cadenza";

type Nodo = { key: string; type: "email" | "whatsapp" | "sms" | "wait" | "condition" | "end"; delay_days?: number | null; delay_hours?: number | null };

const attese = (nodi: Nodo[]) => Object.fromEntries(nodi.map((n) => [n.key, [n.delay_days ?? null, n.delay_hours ?? null]]));

describe("sequenza lineare", () => {
  it("giorni dall'iscrizione 0, 4, 8, 12…", () => {
    expect(GIORNI_TRA_FOLLOWUP).toBe(4);
    expect([0, 1, 2, 3, 7].map(giornoDelPassoLineare)).toEqual([0, 4, 8, 12, 28]);
  });
  it("indici strani non producono giorni negativi", () => {
    expect(giornoDelPassoLineare(-2)).toBe(0);
    expect(giornoDelPassoLineare(2.7)).toBe(8);
  });
});

describe("flusso a grafo", () => {
  it("struttura tipica: attese di 4 giorni, invio dopo l'attesa subito", () => {
    const nodi: Nodo[] = [
      { key: "apertura", type: "email", delay_days: 2, delay_hours: 5 },
      { key: "attesa1", type: "wait", delay_days: 3 },
      { key: "cond_aperto", type: "condition" },
      { key: "reinvio", type: "email", delay_days: 1 },
      { key: "followup", type: "email", delay_days: 6 },
      { key: "attesa2", type: "wait", delay_days: 2, delay_hours: 12 },
      { key: "cond_risposta", type: "condition" },
      { key: "chiusura", type: "email", delay_days: 5 },
      { key: "fine", type: "end" },
    ];
    const archi = [
      { from_key: "apertura", to_key: "attesa1" },
      { from_key: "attesa1", to_key: "cond_aperto" },
      { from_key: "cond_aperto", to_key: "reinvio" },
      { from_key: "cond_aperto", to_key: "followup" },
      { from_key: "reinvio", to_key: "fine" },
      { from_key: "followup", to_key: "attesa2" },
      { from_key: "attesa2", to_key: "cond_risposta" },
      { from_key: "cond_risposta", to_key: "fine" },
      { from_key: "cond_risposta", to_key: "chiusura" },
      { from_key: "chiusura", to_key: "fine" },
    ];
    expect(attese(applicaCadenzaFlusso(nodi, archi))).toEqual({
      apertura: [0, 0],
      attesa1: [4, 0],
      cond_aperto: [null, null],
      reinvio: [0, 0],
      followup: [0, 0],
      attesa2: [4, 0],
      cond_risposta: [null, null],
      chiusura: [0, 0],
      fine: [null, null],
    });
  });

  it("invio subito dopo un altro invio, anche attraverso un bivio: 4 giorni", () => {
    const nodi: Nodo[] = [
      { key: "a", type: "email" },
      { key: "b", type: "sms", delay_days: 1 },
      { key: "c", type: "condition" },
      { key: "d", type: "whatsapp", delay_days: 9 },
    ];
    const archi = [
      { from_key: "a", to_key: "b" },
      { from_key: "b", to_key: "c" },
      { from_key: "c", to_key: "d" },
    ];
    expect(attese(applicaCadenzaFlusso(nodi, archi))).toMatchObject({ a: [0, 0], b: [4, 0], d: [4, 0] });
  });

  it("un giro chiuso fra bivi non manda in loop", () => {
    const nodi: Nodo[] = [
      { key: "a", type: "email" },
      { key: "c1", type: "condition" },
      { key: "c2", type: "condition" },
      { key: "b", type: "email" },
    ];
    const archi = [
      { from_key: "a", to_key: "c1" },
      { from_key: "c1", to_key: "c2" },
      { from_key: "c2", to_key: "c1" },
      { from_key: "c2", to_key: "b" },
    ];
    expect(attese(applicaCadenzaFlusso(nodi, archi))).toMatchObject({ b: [4, 0] });
  });

  it("non modifica i nodi ricevuti", () => {
    const nodi: Nodo[] = [{ key: "w", type: "wait", delay_days: 1 }];
    applicaCadenzaFlusso(nodi, []);
    expect(nodi[0].delay_days).toBe(1);
  });
});
