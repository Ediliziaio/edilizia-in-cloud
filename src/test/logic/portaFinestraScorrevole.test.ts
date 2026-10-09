import { describe, expect, it } from "vitest";
import { TIPOLOGIE_DISEGNO } from "@/lib/serramenti/disegnoSerramento";
import { configurazioniStandard, GRUPPI_CONFIGURAZIONI } from "@/lib/serramenti/catalogoConfigurazioni";
import { apertureDellaTipologia } from "@/lib/serramenti/assiDisegno";
import { tipologiaDaNome } from "@/lib/serramenti/tipologiaDaNome";
import { disegnoDaConfig } from "@/lib/serramenti/disegnoDaFamiglia";

const id = "porta_finestra_scorrevole_2_ante";
describe("porta finestra scorrevole due ante", () => {
  it.each(["Porta finestra scorrevole 2 ante", "Portafinestra scorrevole 2 ante", "Porta-finestra scorrevole 2 ante"])("recognizes %s before the window rule", (name) => {
    expect(tipologiaDaNome(name)).toBe(id);
    expect(tipologiaDaNome("Finestra scorrevole 2 ante")).toBe("finestra_scorrevole_2_ante");
  });
  it("has door height, two sliding leaves, threshold and both directions", () => {
    const t = TIPOLOGIE_DISEGNO.find((t) => t.id === id)!;
    expect(t.altezzaMm).toBe(2200);
    expect(t.soglia).toBe(true);
    expect(t.ante).toHaveLength(2);
    expect(t.ante.every((a) => a.tipo === "scorrevole")).toBe(true);
    expect(apertureDellaTipologia(id).map((a) => a.codice)).toEqual(["scorre_dx", "scorre_sx"]);
    expect(configurazioniStandard().find((c) => c.id === id)?.assi.map((a) => a.codice)).toContain("soglia");
    expect(GRUPPI_CONFIGURAZIONI.find((g) => g.titolo === "Scorrevoli e alzanti")?.voci.map(([id]) => id)).toContain(id);
  });
  it("renders both saved views without changing the window", () => {
    const d = disegnoDaConfig({ v: 1, tipologia: id }, 1800, 2400);
    expect(d?.tipo).toBe("serramento");
    if (d?.tipo === "serramento") {
      expect(d.viste).toHaveLength(2);
      expect(d.viste[0].disegno.soglia).toBe(true);
      expect(d.viste[0].disegno.ante).toHaveLength(2);
    }
    expect(TIPOLOGIE_DISEGNO.find((t) => t.id === "finestra_scorrevole_2_ante")?.altezzaMm).toBe(1200);
  });
});
