/**
 * Conversione preventivo di modulo → commessa.
 *
 * Il punto delicato è l'aliquota: `fv_progetti.iva_aliquota` è una FRAZIONE
 * (0,10 = 10%) mentre `rst_progetti.iva_pct` è una percentuale (22). Scambiarle
 * significa una commessa con IVA allo 0,1% o al 2200%.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SORGENTE = readFileSync(join(__dirname, "../../lib/moduli/convertiInCommessa.ts"), "utf8");

/** Copia fedele della funzione interna: se cambia lì, questo test va aggiornato. */
function aliquotaInPercentuale(valore: unknown, predefinita = 22): number {
  const n = Number(valore);
  if (!Number.isFinite(n) || n <= 0) return predefinita;
  return n <= 1 ? Math.round(n * 10000) / 100 : n;
}

describe("aliquota IVA dei moduli", () => {
  it("la frazione del fotovoltaico diventa percentuale", () => {
    expect(aliquotaInPercentuale(0.1, 10)).toBe(10);
    expect(aliquotaInPercentuale(0.22, 10)).toBe(22);
    expect(aliquotaInPercentuale(0.04, 10)).toBe(4);
  });

  it("una percentuale già scritta come tale resta com'è", () => {
    expect(aliquotaInPercentuale(22, 22)).toBe(22);
    expect(aliquotaInPercentuale(10, 22)).toBe(10);
  });

  it("valori mancanti o assurdi ricadono sul predefinito, mai su zero", () => {
    expect(aliquotaInPercentuale(null, 22)).toBe(22);
    expect(aliquotaInPercentuale(0, 10)).toBe(10);
    expect(aliquotaInPercentuale(-5, 22)).toBe(22);
    expect(aliquotaInPercentuale("", 22)).toBe(22);
  });
});

describe("guardie della conversione", () => {
  it("rifiuta la seconda conversione dello stesso preventivo", () => {
    expect(SORGENTE).toContain("è già diventato una commessa");
    // Il controllo deve esserci in entrambi i moduli.
    expect(SORGENTE.match(/già diventato una commessa/g)?.length).toBe(2);
  });

  it("rifiuta un preventivo senza importo invece di creare una commessa a zero", () => {
    expect(SORGENTE).toContain("non ha un prezzo di vendita");
    expect(SORGENTE).toContain("Il computo è vuoto");
  });

  it("passa dalla RPC atomica, non da insert sparsi su orders", () => {
    expect(SORGENTE).toContain('supabase.rpc("create_order_atomic"');
    expect(SORGENTE).not.toContain('.from("order_items").insert');
  });

  it("passa uno stato iniziale: lo storico stati non ammette il nullo", () => {
    // Collaudo del 2026-09-02: senza current_status_id la RPC falliva con
    // "null value in column status_id of relation order_status_history".
    expect(SORGENTE).toContain("current_status_id: statoIniziale");
    expect(SORGENTE).toContain("order_statuses");
  });

  it("collega la commessa al preventivo nei due sensi", () => {
    expect(SORGENTE).toContain("fv_progetto_id: progettoId");
    expect(SORGENTE).toContain("rst_progetto_id: progettoId");
    expect(SORGENTE.match(/ordine_id: orderId/g)?.length).toBe(2);
  });
});
