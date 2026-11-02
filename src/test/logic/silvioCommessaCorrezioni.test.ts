/**
 * Il registro delle correzioni di Silvio (fase 0, lotto 0.3): dal confronto fra la
 * proposta e quello che la persona conferma alle righe di `silvio_correzioni`.
 * Dati inventati; il database è finto.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const inseriti: { tabella: string; righe: unknown }[] = [];
let errore: { message: string } | null = null;
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => ({
      insert: async (righe: unknown) => { inseriti.push({ tabella, righe }); return { error: errore }; },
    }),
  },
}));

import type { Frammento, Valore } from "../../../shared/silvio-commessa/piano.ts";
import { applica, fondi, pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";
import { correzioniDalPiano, registraCorrezioni, rigaCorrezione } from "@/lib/silvio-commessa/correzioni";

const v = (valore: unknown): Omit<Valore, "fonte"> => ({ valore, fiducia: 1, stato: "fatto" });
const PREVENTIVO = { tipo: "preventivo" as const, id: "q-1", etichetta: "PR-0001" };

function proposta() {
  const fr: Frammento = {
    fonte: PREVENTIVO,
    aree: {
      economia: { "economia.total_amount": v(12000), "economia.vat_rate": v(10) },
      persone: { "persone.squadra": v(["dip-1", "dip-2"]) },
    },
  };
  let p = fondi(pianoVuoto("az-1", "ord-1"), fr);
  p = fondi(p, { fonte: { tipo: "persona", etichetta: "commessa esistente" }, aree: { cliente: { "cliente.nome": v("Cliente Prova") } } });
  return p;
}

beforeEach(() => { inseriti.length = 0; errore = null; });

describe("correzioniDalPiano", () => {
  it("una riga per ogni valore proposto da Silvio: tenuto, cambiato o tolto", () => {
    const p = proposta();
    let b = applica(p, { tipo: "cambia_valore", area: "economia", chiave: "economia.total_amount", valore: 11500 });
    b = applica(b.piano, { tipo: "togli", area: "persone", chiave: "persone.squadra" }, b.storia);
    b = applica(b.piano, { tipo: "cambia_valore", area: "economia", chiave: "economia.vat_rate", valore: 10.001 }, b.storia);
    b = applica(b.piano, { tipo: "cambia_valore", area: "fasi", chiave: "fasi.work_start_date", valore: "2026-11-09" }, b.storia);

    const righe = correzioniDalPiano(p, b.piano, { orderId: "ord-1" });
    // Il nome del cliente era già della persona, l'inizio l'ha aggiunto lei: non sono di Silvio.
    expect(righe.map((r) => [r.chiave, r.proposto, r.tenuto])).toEqual([
      ["economia.total_amount", 12000, 11500],
      ["economia.vat_rate", 10, 10], // stesso valore al centesimo: tenuto così
      ["persone.squadra", ["dip-1", "dip-2"], null],
    ]);
    expect(righe[0]).toMatchObject({ companyId: "az-1", orderId: "ord-1", bozzaId: null, area: "economia", fonte: PREVENTIVO });
  });
});

describe("rigaCorrezione e registraCorrezioni", () => {
  it("traduce nei nomi delle colonne", () => {
    const [c] = correzioniDalPiano(proposta(), proposta(), { bozzaId: "b-1" });
    expect(rigaCorrezione(c)).toEqual({
      company_id: "az-1", order_id: null, bozza_id: "b-1", area: "economia", chiave: "economia.total_amount",
      valore_proposto: 12000, valore_tenuto: 12000, fonte_tipo: "preventivo", fonte: PREVENTIVO,
    });
  });

  it("senza commessa né bozza non si scrive", () => {
    const [c] = correzioniDalPiano(proposta(), proposta(), {});
    expect(() => rigaCorrezione(c)).toThrow("commessa o a una bozza");
  });

  it("scrive tutto in un insert solo; niente da scrivere, niente chiamata", async () => {
    await registraCorrezioni([]);
    expect(inseriti).toEqual([]);
    await registraCorrezioni(correzioniDalPiano(proposta(), proposta(), { orderId: "ord-1" }));
    expect(inseriti).toHaveLength(1);
    expect(inseriti[0].tabella).toBe("silvio_correzioni");
    expect((inseriti[0].righe as unknown[]).length).toBe(3);
  });

  it("un errore del database non si perde", async () => {
    errore = { message: "new row violates row-level security policy" };
    await expect(registraCorrezioni(correzioniDalPiano(proposta(), proposta(), { orderId: "ord-1" })))
      .rejects.toMatchObject({ message: "new row violates row-level security policy" });
  });
});
