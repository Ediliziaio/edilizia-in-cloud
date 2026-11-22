import { describe, expect, it } from "vitest";
import { ripartoCarburante } from "@/lib/mezzi/ripartoCarburante";
import type { TrattaViaggio, Viaggio } from "@/lib/mezzi/viaggi";

const tratta = (id: string, da: string, a: string, km: number, ordine: string | null): TrattaViaggio =>
  ({ id, da, a, km, destinazione: ordine ? "commessa" : "generale", order_id: ordine, fonte: "dichiarati", minuti: null });

function viaggio(id: string, tratte: TrattaViaggio[], stato: Viaggio["stato"] = "verificato"): Viaggio {
  return { id, stato, tratte, company_id: "azienda", mezzo_id: "mezzo", mezzo_nome: "Furgone", versione: 1,
    conducente: null, partenza: "2026-11-22T08:00:00+01:00", arrivo: "2026-11-22T09:00:00+01:00",
    contatore_inizio: null, contatore_fine: null, note: "", updated_at: "2026-11-22T10:00:00+01:00" };
}

describe("riparto carburante fatturato", () => {
  it("include il rientro del giro a commessa unica, mantiene il generale ed esclude i viaggi in attesa", () => {
    const lambrate = viaggio("v1", [tratta("a", "Deposito", "Lambrate", 18, "lambrate"), tratta("b", "Lambrate", "Deposito", 29, null)]);
    const garibaldi = viaggio("v2", [tratta("a", "Deposito", "Garibaldi", 33, "garibaldi")]);
    const generale = viaggio("v3", [tratta("a", "Deposito", "Officina", 20, null)]);
    const sospeso = viaggio("v4", [tratta("a", "Deposito", "Lambrate", 400, "lambrate")], "inviato");
    const r = ripartoCarburante([lambrate, garibaldi, generale, sospeso, lambrate], 12000);
    expect(r.metriTotali).toBe(100_000);
    expect(r.viaggiDaVerificare).toBe(1);
    expect(r.quote.map(q => [q.chiave, q.centesimi])).toEqual([["lambrate", 5640], ["garibaldi", 3960], ["generale", 2400]]);
  });

  it("ripartisce lo storno ai centesimi e lascia il ritorno generale del giro con più commesse", () => {
    const multi = viaggio("v1", [tratta("a", "Sede", "A", 1, "A"), tratta("b", "A", "B", 1, "B"), tratta("c", "B", "Sede", 1, null)]);
    const r = ripartoCarburante([multi], -100);
    expect(r.quote.map(q => q.chiave)).toContain("generale");
    expect(r.quote.map(q => q.centesimi).sort()).toEqual([-33, -33, -34]);
    expect(r.quote.reduce((somma, q) => somma + q.centesimi, 0)).toBe(-100);
    expect(ripartoCarburante([], -100).daRipartire).toBe(-100);
  });
});
