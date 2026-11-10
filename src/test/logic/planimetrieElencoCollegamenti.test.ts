import { describe, expect, it, vi } from "vitest";
import { filtraElencoPiante, leggiFiltriElenco, scriviFiltriElenco, type FiltriElencoPiante } from "@/lib/planimetrie/elenco";
import { accessiCollegamenti, cercaCollegamentiPianta, sceltaDaRiga, type MappaCollegamenti } from "@/lib/planimetrie/collegamenti";
import type { RigaPlanimetria } from "@/lib/planimetrie/archivio";

const db = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), select: vi.fn(), eq: vi.fn(), is: vi.fn(), limit: vi.fn(), or: vi.fn(), order: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: db.from, rpc: db.rpc } }));

function pianta(id: string, dati: Partial<RigaPlanimetria> = {}): RigaPlanimetria {
  return { id, company_id: "azienda-A", titolo: id, descrizione: null, stato: "bozza", contact_id: null, customer_id: null, order_id: null, quote_id: null, survey_id: null, computo_upload_id: null, versione_corrente: 1, created_by: "utente", created_at: "2026-11-01", updated_at: "2026-11-01", deleted_at: null, ...dati };
}
const filtri: FiltriElencoPiante = { stato: "attive", collegamento: "tutti", ricerca: "", ordine: "recenti" };

describe("Archivio planimetrie", () => {
  it("separa le archiviate, filtra i riferimenti e ordina senza modificare i dati originali", () => {
    const righe = [pianta("Villa", { customer_id: "c1", stato: "in_uso", updated_at: "2026-11-02" }), pianta("Appartamento"), pianta("Vecchia", { stato: "archiviata" })];
    expect(filtraElencoPiante(righe, filtri).map((p) => p.id)).toEqual(["Villa", "Appartamento"]);
    expect(filtraElencoPiante(righe, { ...filtri, collegamento: "cliente" }).map((p) => p.id)).toEqual(["Villa"]);
    expect(filtraElencoPiante(righe, { ...filtri, collegamento: "libere" }).map((p) => p.id)).toEqual(["Appartamento"]);
    expect(filtraElencoPiante(righe, { ...filtri, stato: "archiviata" }).map((p) => p.id)).toEqual(["Vecchia"]);
    expect(filtraElencoPiante(righe, { ...filtri, ordine: "nome" }).map((p) => p.id)).toEqual(["Appartamento", "Villa"]);
    expect(righe.map((p) => p.id)).toEqual(["Villa", "Appartamento", "Vecchia"]);
  });

  it("cerca più parole anche nei nomi collegati disponibili all'utente", () => {
    const righe = [pianta("Villa", { contact_id: "c1" }), pianta("Altro")];
    const mappa: MappaCollegamenti = { contatto: { c1: { id: "c1", nome: "Mario Rossi", percorso: "/c1" } }, cliente: {}, preventivo: {}, commessa: {}, computo: {} };
    expect(filtraElencoPiante(righe, { ...filtri, ricerca: "rossi villa" }, mappa).map((p) => p.id)).toEqual(["Villa"]);
    expect(filtraElencoPiante(righe, { ...filtri, ricerca: "Rossi" })).toEqual([]);
  });

  it("distingue clienti e contatti e costruisce i collegamenti alle schede giuste", () => {
    expect(sceltaDaRiga("computo", { id: "k1", titolo: "Computo esecutivo" })).toEqual({ id: "k1", nome: "Computo esecutivo" });
    expect(sceltaDaRiga("cliente", { id: "c1", business_name: "Impresa Rossi" })).toMatchObject({ nome: "Impresa Rossi", percorso: "/azienda/clienti/c1" });
    expect(sceltaDaRiga("contatto", { id: "c1", first_name: "Mario", last_name: "Rossi" }).percorso).toBe("/azienda/marketing/contatti/c1");
    expect(sceltaDaRiga("preventivo", { id: "q1", quote_number: "OFF-1", title: "Villa" }).nome).toBe("OFF-1 · Villa");
    expect(accessiCollegamenti({ canViewCustomers: true, canViewMarketingContacts: false, canViewPreventivi: false, canViewOrders: true })).toEqual({ cliente: true, contatto: false, preventivo: false, commessa: true, computo: true });
  });

  it("cerca sul server con limite e filtro azienda, senza scaricare tutto il CRM", async () => {
    const query = { select: db.select, eq: db.eq, is: db.is, limit: db.limit, or: db.or, order: db.order };
    for (const fn of [db.from, db.select, db.eq, db.is, db.limit, db.or]) fn.mockReturnValue(query);
    db.order.mockResolvedValue({ data: [{ id: "q1", quote_number: "OFF-1", title: "Villa" }], error: null });
    expect(await cercaCollegamentiPianta("azienda-A", "preventivo", "Villa")).toHaveLength(1);
    expect(db.eq).toHaveBeenCalledWith("company_id", "azienda-A");
    expect(db.is).toHaveBeenCalledWith("deleted_at", null);
    expect(db.limit).toHaveBeenCalledWith(20);
    db.rpc.mockResolvedValue({ data: { rows: [{ id: "cliente-1", first_name: "Mario" }] }, error: null });
    await cercaCollegamentiPianta("azienda-A", "cliente", "Mario");
    expect(db.rpc).toHaveBeenCalledWith("get_customers_paginated", expect.objectContaining({ p_company_id: "azienda-A", p_search: "Mario", p_limit: 20 }));
  });
  it("combina periodo, autore e scheda esistente senza confondere clienti diversi", () => {
    const rows = [pianta("Casa A", { customer_id: "c1", created_by: "me", updated_at: "2026-11-10T12:00:00Z" }), pianta("Casa B", { customer_id: "c2", created_by: "me", updated_at: "2026-11-10T12:00:00Z" }), pianta("Casa C", { customer_id: "c1", created_by: "altro", updated_at: "2026-11-10T12:00:00Z" }), pianta("Casa D", { customer_id: "c1", created_by: "me", updated_at: "2026-10-01T12:00:00Z" })];
    expect(filtraElencoPiante(rows, { ...filtri, collegamento: "cliente", riferimento: "c1", soloMie: true, dal: "2026-11-01", al: "2026-11-10" }, undefined, "me").map((row) => row.id)).toEqual(["Casa A"]);
    expect(filtraElencoPiante(rows, { ...filtri, soloMie: true }, undefined, undefined)).toEqual([]);
  });
  it("include tutto il giorno scelto, anche ai confini, ed esclude date non leggibili", () => {
    const rows = [pianta("inizio", { updated_at: new Date(2026, 10, 10, 0, 0, 1).toISOString() }), pianta("fine", { updated_at: new Date(2026, 10, 10, 23, 59, 59).toISOString() }), pianta("ieri", { updated_at: new Date(2026, 10, 9, 23, 59, 59).toISOString() }), pianta("errata", { updated_at: "non-data" })];
    expect(filtraElencoPiante(rows, { ...filtri, dal: "2026-11-10", al: "2026-11-10" }).map((row) => row.id)).toEqual(["fine", "inizio"]);
    expect(filtraElencoPiante(rows, { ...filtri, dal: "2026-11-11", al: "2026-11-10" })).toEqual([]);
  });
  it("conserva vista e filtri nell’indirizzo e pulisce una scheda quando cambia tipo", () => {
    const params = new URLSearchParams("vista=elenco&collegamento=cliente&scheda=c1&dal=2026-11-01&al=2026-11-10&mie=1&pagina=3");
    expect(leggiFiltriElenco(params)).toMatchObject({ collegamento: "cliente", riferimento: "c1", soloMie: true, pagina: 2, dal: "2026-11-01" });
    const next = scriviFiltriElenco(params, { collegamento: "commessa", pagina: 0 });
    expect(next.has("scheda")).toBe(false); expect(next.get("vista")).toBe("elenco"); expect(next.get("mie")).toBe("1"); expect(next.has("pagina")).toBe(false);
    expect(leggiFiltriElenco(new URLSearchParams("dal=2026-02-30&al=bad&mie=no&collegamento=libere&scheda=c1"))).toMatchObject({ dal: "", al: "", soloMie: false, riferimento: "" });
  });
  it("trova i nomi accentati e include le archiviate solo con una scelta esplicita", () => {
    const rows = [pianta("Città", { stato: "archiviata" }), pianta("Villa")];
    expect(filtraElencoPiante(rows, { ...filtri, ricerca: "citta", stato: "tutte" }).map((row) => row.id)).toEqual(["Città"]);
    expect(filtraElencoPiante(rows, { ...filtri, ricerca: "citta" })).toEqual([]);
  });

});
