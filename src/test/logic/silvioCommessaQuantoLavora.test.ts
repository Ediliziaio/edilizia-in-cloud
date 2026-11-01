/**
 * «Quanto lavora Silvio» (fase 5, lotto 5.4): il punteggio nel database è quello del popup, i
 * numeri che mancano sono zero (mai inventati), la stima del tempo dice la sua regola.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { sqlPunteggio } from "../../../shared/silvio-commessa/completezza.ts";
import {
  durataInParole, MINUTI_PER_VOCE, minutiRisparmiati, quantoLavoraDaRisposta, quotaTenuta, senzaDati,
} from "../../../shared/silvio-commessa/quantoLavora.ts";

const migrazione = readFileSync(resolve(__dirname, "../../../supabase/migrations/20281106142000_silvio_quanto_lavora.sql"), "utf8");
const spazi = (s: string) => s.replace(/\s+/g, " ");

describe("la RPC", () => {
  it("il punteggio di completezza è l'espressione di sqlPunteggio()", () => {
    expect(spazi(migrazione)).toContain(spazi(sqlPunteggio("o")));
  });
  it("a pagine (al massimo 50 righe), coi controlli dentro e chiusa ad anon", () => {
    expect(migrazione).toMatch(/least\(greatest\(coalesce\(p_per_pagina, 20\), 1\), 50\)/);
    expect(migrazione).toMatch(/offset \(v_pagina - 1\) \* v_per limit v_per/);
    expect(migrazione).toMatch(/get_effective_company_id\(\)/);
    expect(migrazione).toMatch(/'can_edit_orders'/);
    expect(migrazione).toMatch(/can_see_order\(o\.id, o\.assigned_to, o\.destination_warehouse_id\)/);
    expect(migrazione).toMatch(/revoke all on function public\.silvio_quanto_lavora\([^)]*\) from public, anon/);
    expect(migrazione).toMatch(/task_key in \('silvio_commessa_lettura', 'silvio_commessa_chat'\)/);
  });
});

describe("i numeri", () => {
  it("una risposta vuota è tutta zeri e «nessun dato», non 100 %", () => {
    const q = quantoLavoraDaRisposta(null);
    expect(q.totali).toEqual({ commesse_create: 0, commesse_completate: 0, punteggio_medio: null, voci_scritte: 0 });
    expect(q.costo_ai_eur).toBe(0);
    expect(senzaDati(q)).toBe(true);
    expect(quotaTenuta(q.correzioni)).toBeNull();
  });
  it("con i dati: quota tenuta, tempo con la regola", () => {
    const q = quantoLavoraDaRisposta({
      totali: { commesse_create: 3, commesse_completate: 2, punteggio_medio: 71, voci_scritte: 95 },
      correzioni: { totale: 40, tenute_cosi: 34, cambiate: 6, per_area: { fasi: 4, pagamenti: 2 } }, costo_ai_eur: 0.37,
      piano_volo: { confermata: 4, aperta: 1 }, commesse: [], totale_righe: 5, pagina: 1, per_pagina: 20,
    });
    expect(senzaDati(q)).toBe(false);
    expect(quotaTenuta(q.correzioni)).toBe(85);
    expect(MINUTI_PER_VOCE).toBe(2);
    expect(minutiRisparmiati(q.totali.voci_scritte)).toBe(190);
    expect(durataInParole(190)).toBe("3 h 10 min");
    expect(durataInParole(45)).toBe("45 min");
    expect(durataInParole(120)).toBe("2 h");
  });
});
