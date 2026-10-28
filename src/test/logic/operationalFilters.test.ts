import { describe, expect, it } from "vitest";
import {
  inOperationalPeriod,
  operationalPage,
  operationalPeriod,
  updateOperationalParams,
} from "@/lib/orders/operationalFilters";

describe("Filtri documenti operativi", () => {
  const now = new Date(2026, 9, 26, 18);
  it("include gli estremi del periodo, esclude date mancanti, future o non valide", () => {
    expect(inOperationalPeriod("2026-09-26", "30", now)).toBe(true);
    expect(inOperationalPeriod("2026-10-26T23:00:00Z", "30", now)).toBe(true);
    for (const day of [null, "invalid", "2026-09-25", "2026-10-27"])
      expect(inOperationalPeriod(day, "30", now)).toBe(false);
    expect(inOperationalPeriod("2026-01-01", "anno", now)).toBe(true);
    expect(inOperationalPeriod("2025-12-31", "anno", now)).toBe(false);
    expect(operationalPeriod("nonsense")).toBe("tutto");
  });
  it("isola i filtri delle schede e resetta la pagina soltanto cambiando filtro", () => {
    const initial = new URLSearchParams(
      "tab=ddt&vista=elenco&periodo=90&rdo_cerca=ferro&ddt_pagina=3",
    );
    const changed = updateOperationalParams(initial, "ddt", {
      stato: "ricevuto",
    });
    expect(changed.get("rdo_cerca")).toBe("ferro");
    expect(changed.get("periodo")).toBe("90");
    expect(changed.has("ddt_pagina")).toBe(false);
    expect(
      updateOperationalParams(initial, "ddt", { vista: "elenco" }).get(
        "ddt_pagina",
      ),
    ).toBe("3");
    expect(
      updateOperationalParams(changed, "ddt", { stato: "tutti" }).has(
        "ddt_stato",
      ),
    ).toBe(false);
    expect(initial.get("ddt_pagina")).toBe("3");
  });
  it("limita le pagine disponibili e scarta valori non interi", () => {
    expect(operationalPage("500", 27)).toBe(2);
    for (const value of [null, "-1", "NaN", "1.5"])
      expect(operationalPage(value, 27)).toBe(1);
    expect(operationalPage("10", 0)).toBe(1);
  });
});
