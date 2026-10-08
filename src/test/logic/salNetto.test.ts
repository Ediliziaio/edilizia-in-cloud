// src/test/logic/salNetto.test.ts
import { describe, expect, it } from "vitest";
import * as app from "@/lib/orders/salNetto";
import * as edge from "../../../supabase/functions/_shared/salNetto";

const sal = (numero_sal: number, stato: string, importo_totale: number) => ({ id: `s${numero_sal}`, numero_sal, stato, importo_totale });
const tutti = [sal(1, "firmato", 10000), sal(2, "approvato", 6000.5), sal(3, "bozza", 99999), sal(4, "emesso", 4000), sal(5, "emesso", 20000)];

describe.each([["app", app], ["edge", edge]])("salNetto (%s)", (_nome, m) => {
  it("il già maturato conta i SAL emessi, approvati o firmati con numero minore; le bozze no", () => {
    expect(m.maturatoPrecedente({ id: "s4", numero_sal: 4 }, tutti)).toBe(16000.5);
    expect(m.maturatoPrecedente({ id: "s1", numero_sal: 1 }, tutti)).toBe(0);
  });
  it("non conta se stesso né i SAL successivi", () => {
    expect(m.maturatoPrecedente({ id: "s2", numero_sal: 2 }, tutti)).toBe(10000);
  });
  it("il netto è il totale meno il già maturato, a due decimali; può essere negativo", () => {
    expect(m.nettoSal(20000, 16000.5)).toEqual({ totale: 20000, precedente: 16000.5, daFatturare: 3999.5 });
    expect(m.nettoSal(5000, 6000)).toEqual({ totale: 5000, precedente: 6000, daFatturare: -1000 });
    expect(m.nettoSal(0.1 + 0.2, 0).daFatturare).toBe(0.3);
  });
  it("un importo non numerico vale zero", () => {
    expect(m.maturatoPrecedente({ id: "x", numero_sal: 9 }, [{ id: "y", numero_sal: 1, stato: "emesso", importo_totale: Number.NaN }])).toBe(0);
  });
});
