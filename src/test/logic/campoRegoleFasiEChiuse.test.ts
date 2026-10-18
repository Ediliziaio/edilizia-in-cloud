import { describe, expect, it } from "vitest";
import { puoSpuntareInCantiere } from "@/lib/orders/chiSpunta";
import { commessaChiusa, cantieriAperti } from "@/lib/campo/cantieriAperti";

describe("chi spunta dal cantiere (stessa regola del database)", () => {
  it("con «tutti» spunta chiunque lavori sulla commessa", () => {
    expect(puoSpuntareInCantiere("tutti", { esiste_capo: true }, false)).toBe(true);
  });
  it("con «capi» spunta il capocantiere, gli altri no", () => {
    expect(puoSpuntareInCantiere("capi", { capocantiere: true, esiste_capo: true }, false)).toBe(true);
    expect(puoSpuntareInCantiere("capi", { esiste_capo: true }, true)).toBe(false);
  });
  it("senza capocantiere sulla commessa spunta chiunque", () => {
    expect(puoSpuntareInCantiere("capi", { esiste_capo: false }, false)).toBe(true);
  });
  it("con «chi_la_fa» spunta chi è assegnato a quella fase", () => {
    expect(puoSpuntareInCantiere("chi_la_fa", { esiste_capo: true }, true)).toBe(true);
    expect(puoSpuntareInCantiere("chi_la_fa", { esiste_capo: true }, false)).toBe(false);
  });
});

describe("commesse chiuse fuori dall'app cantiere", () => {
  it("completata, chiusa e annullata sono chiuse; in corso e confermata no", () => {
    for (const s of ["completato", "Completato", "chiuso", "annullato"]) expect(commessaChiusa(s)).toBe(true);
    for (const s of ["in_corso", "confermato", "active", null, undefined]) expect(commessaChiusa(s)).toBe(false);
  });
  it("cantieriAperti scarta le completate", () => {
    const righe = [
      { id: "a", order_id: "a", order: { id: "a", status: "completato" } },
      { id: "b", order_id: "b", order: { id: "b", status: "in_corso" } },
    ] as unknown as Parameters<typeof cantieriAperti>[0];
    expect(cantieriAperti(righe).map(r => r.order_id)).toEqual(["b"]);
  });
});

import { giorniSceglibili, reportDayAllowed, messaggioScadenzaRapportino } from "@/lib/campo/workDay";
describe("giorni indietro del rapportino", () => {
  const adesso = new Date("2026-10-18T10:00:00Z");
  it("con 1 vale oggi e ieri, come prima", () => {
    expect(giorniSceglibili(adesso, 1)).toEqual(["2026-10-18", "2026-10-17"]);
    expect(reportDayAllowed("2026-10-16", adesso, 1)).toBe(false);
  });
  it("con 3 copre il weekend; mai il futuro", () => {
    expect(reportDayAllowed("2026-10-15", adesso, 3)).toBe(true);
    expect(reportDayAllowed("2026-10-14", adesso, 3)).toBe(false);
    expect(reportDayAllowed("2026-10-19", adesso, 3)).toBe(false);
  });
  it("con 0 solo oggi; un valore strano vale 1", () => {
    expect(giorniSceglibili(adesso, 0)).toEqual(["2026-10-18"]);
    expect(giorniSceglibili(adesso, Number.NaN)).toHaveLength(2);
    expect(messaggioScadenzaRapportino(3)).toContain("entro 3 giorni");
  });
});
