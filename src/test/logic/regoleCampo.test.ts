import { describe, expect, it } from "vitest";
import {
  REGOLE_COME_OGGI, giaCoperto, leggiRegole, operaioSoloOre, oreInTesto, proponiOre, scostamento,
} from "@/lib/campo/regoleCampo";

describe("Regole di cantiere per azienda", () => {
  it("senza scelte vale «come oggi»: nessuna azienda cambia da sola", () => {
    expect(leggiRegole(null)).toEqual(REGOLE_COME_OGGI);
    expect(leggiRegole({})).toEqual(REGOLE_COME_OGGI);
    expect(REGOLE_COME_OGGI).toEqual({ chiCompila: "ognuno", oreDalle: "capo", avvisoScostamentoMinuti: null });
  });

  it("legge le scelte dell'azienda e scarta i valori che non conosce", () => {
    expect(leggiRegole({ chi_compila: "capo", ore_dalle: "timbrature", avviso_scostamento_minuti: 30 }))
      .toEqual({ chiCompila: "capo", oreDalle: "timbrature", avvisoScostamentoMinuti: 30 });
    expect(leggiRegole({ chi_compila: "ore_proprie", ore_dalle: "capo", avviso_scostamento_minuti: null }))
      .toEqual({ chiCompila: "ore_proprie", oreDalle: "capo", avvisoScostamentoMinuti: null });
    expect(leggiRegole({ chi_compila: "tutti", ore_dalle: "boh", avviso_scostamento_minuti: 2 })).toEqual(REGOLE_COME_OGGI);
    expect(leggiRegole({ avviso_scostamento_minuti: 9999 }).avvisoScostamentoMinuti).toBeNull();
    expect(leggiRegole({ avviso_scostamento_minuti: "45" }).avvisoScostamentoMinuti).toBe(45);
  });

  it("scrive le ore come le direbbe una persona", () => {
    expect(oreInTesto(7.5)).toBe("7h 30");
    expect(oreInTesto(8)).toBe("8h");
    expect(oreInTesto(0.25)).toBe("15 min");
    expect(oreInTesto(1 + 5 / 60)).toBe("1h 05");
  });

  it("propone le ore timbrate, ma non se manca la timbratura o è ancora dentro", () => {
    expect(proponiOre(7.5, false)).toBe(7.5);
    expect(proponiOre(7.4999)).toBe(7.5);
    expect(proponiOre(null)).toBe("");
    expect(proponiOre(0)).toBe("");
    expect(proponiOre(6, true)).toBe("");
    expect(proponiOre(30)).toBe(24);
  });

  it("avvisa solo oltre la soglia scelta, e solo se l'avviso è acceso", () => {
    expect(scostamento(8, 6.5, 30)).toEqual({ minuti: 90, fuori: true });
    expect(scostamento(6, 6.5, 30)).toEqual({ minuti: -30, fuori: false });
    expect(scostamento(8, 6.5, null)).toBeNull();
    expect(scostamento("", 6.5, 30)).toBeNull();
    expect(scostamento(8, null, 30)).toBeNull();
  });

  it("con «ore_proprie» l'operaio manda solo le ore, ma solo dove c'è un capo", () => {
    const oreProprie = leggiRegole({ chi_compila: "ore_proprie", ore_dalle: "capo" });
    expect(operaioSoloOre(oreProprie, true)).toBe(true);
    expect(operaioSoloOre(oreProprie, false)).toBe(false); // senza capo: racconta come sempre
    expect(operaioSoloOre(REGOLE_COME_OGGI, true)).toBe(false); // «ognuno»: scrive tutto
    expect(operaioSoloOre(leggiRegole({ chi_compila: "capo" }), true)).toBe(false); // «capo»: non manda nemmeno le ore
  });

  it("una persona non si conta due volte, qualunque sia il flusso", () => {
    expect(giaCoperto({ rapportino_inviato: true })).toBe("suo");
    expect(giaCoperto({ gia_registrato_da_altri: true })).toBe("collega");
    expect(giaCoperto({ rapportino_inviato: true, gia_registrato_da_altri: true })).toBe("suo");
    expect(giaCoperto({})).toBeNull();
  });
});
