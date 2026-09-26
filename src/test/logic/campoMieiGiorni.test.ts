import { describe, expect, it } from "vitest";
import { lavoroQuelGiorno } from "@/lib/campo/mieiGiorni";

describe("Calendario dell'app: i miei giorni", () => {
  it("con le mie date conta solo quel periodo", () => {
    const mio = { dal: "2026-10-15", al: "2026-10-21" };
    expect(lavoroQuelGiorno(mio, "2026-10-14")).toBe(false);
    expect(lavoroQuelGiorno(mio, "2026-10-15")).toBe(true);
    expect(lavoroQuelGiorno(mio, "2026-10-21")).toBe(true);
    expect(lavoroQuelGiorno(mio, "2026-10-22")).toBe(false);
  });
  it("una data sola lascia aperto l'altro lato", () => {
    expect(lavoroQuelGiorno({ dal: "2026-10-15", al: null }, "2026-12-01")).toBe(true);
    expect(lavoroQuelGiorno({ dal: null, al: "2026-10-21" }, "2026-01-01")).toBe(true);
  });
  it("senza le mie date decide la commessa", () => {
    expect(lavoroQuelGiorno(undefined, "2026-10-15")).toBeNull();
    expect(lavoroQuelGiorno({ dal: null, al: null }, "2026-10-15")).toBeNull();
  });
});
