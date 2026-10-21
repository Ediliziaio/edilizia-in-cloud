/** Fatture in Cloud con più aziende nello stesso account: si collega quella giusta (21/10/2026). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scegliAziendaFic } from "../../../supabase/functions/_shared/ficSceltaAzienda";

const vecchia = { id: 1, name: "DIMORA s.r.l.", vat_number: "IT11111111111" };
const nuova = { id: 2, name: "Dimora Torino s.r.l.", vat_number: "22222222222" };

describe("Fatture in Cloud: quale azienda collegare", () => {
  it("una sola azienda: quella", () => {
    expect(scegliAziendaFic([vecchia], ["99999999999"])).toEqual({ azienda: vecchia });
  });
  it("più aziende: quella con la nostra partita IVA, anche col prefisso IT", () => {
    expect(scegliAziendaFic([vecchia, nuova], ["IT 22222222222"])).toEqual({ azienda: nuova });
    expect(scegliAziendaFic([vecchia, nuova], [null, "11111111111"])).toEqual({ azienda: vecchia });
  });
  it("più aziende e nessuna corrisponde: sceglie chi collega, mai la prima a caso", () => {
    expect(scegliAziendaFic([vecchia, nuova], ["33333333333"])).toEqual({ daScegliere: [vecchia, nuova] });
    expect(scegliAziendaFic([vecchia, nuova], [])).toEqual({ daScegliere: [vecchia, nuova] });
  });
  it("nessuna azienda", () => {
    expect(scegliAziendaFic([], ["1"])).toEqual({ nessuna: true });
  });
  it("il collegamento non prende più companies[0]", () => {
    const f = readFileSync(join(__dirname, "../../../supabase/functions/billing-connect/index.ts"), "utf8");
    expect(f).not.toContain("companies?.[0]");
    expect(f).toContain("scegliAziendaFic(");
  });
});
