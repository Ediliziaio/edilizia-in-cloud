/** Dal preventivo di un cliente alle righe del nuovo lavoro, per ogni tipo di preventivo (09/11/2026). */
import { describe, expect, it } from "vitest";
import {
  cercaPreventiviDelCliente, filtroCliente, righeDaComputo, righeDaFotovoltaico, righeDaSerramenti, righeDelPreventivo,
} from "@/lib/orders/preventiviDelCliente";

function dbFinto(tabelle: Record<string, Array<Record<string, unknown>>>, letture: string[] = []) {
  return {
    from: (t: string) => {
      letture.push(t);
      let cond: Array<[string, unknown]> = [];
      const q: Record<string, unknown> = {};
      for (const m of ["select", "is", "order", "or", "limit"]) q[m] = () => q;
      q.eq = (k: string, v: unknown) => { cond = [...cond, [k, v]]; return q; };
      const righe = () => (tabelle[t] ?? []).filter((r) => cond.every(([k, v]) => r[k] === undefined || r[k] === v));
      q.maybeSingle = async () => ({ data: righe()[0] ?? null, error: null as null });
      q.then = (ok: (v: unknown) => unknown) => ok({ data: righe(), error: tabelle[t] ? null : { message: "manca" } });
      return q;
    },
  };
}

describe("preventivi del cliente", () => {
  it("il filtro riconosce scheda, email, codice fiscale e nome, con i dati fra virgolette", () => {
    const f = filtroCliente({ id: "c1", email: "a,b@x.it", fiscal_code: "RSS", first_name: "Mario", last_name: "D'Amico" });
    expect(f).toContain("cliente_id.eq.c1");
    expect(f).toContain('cliente_email.eq."a,b@x.it"');
    expect(f).toContain('and(cliente_nome.eq."Mario",cliente_cognome.eq."D\'Amico")');
  });
  it("mette insieme classici e moduli, dal più recente; un modulo illeggibile non ferma gli altri", async () => {
    const r = await cercaPreventiviDelCliente(dbFinto({
      quotes: [{ id: "q", quote_number: "PRV-1", title: "Bagno", created_at: "2025-01-01T10:00:00Z" }],
      rst_progetti: [{ id: "p", code: "RST-1", tipo_intervento: "Casa", created_at: "2025-06-01T10:00:00Z" }],
      fv_progetti: [{ id: "f", numero: "FV-1", titolo: "Tetto", created_at: "2024-06-01T10:00:00Z" }],
    }), "az", { id: "c", email: "g@x.it" }, "Giulia");
    expect(r.map((x) => x.valore)).toEqual(["modulo:rst:p", "preventivo:q", "modulo:fv:f"]);
    expect(r[0].etichetta).toContain("Ristrutturazione · RST-1 · Casa");
  });
  it("computo: prezzi e capitoli sì, voci facoltative no", () => {
    const r = righeDaComputo([{ descrizione: "Demolizione", quantita: 10, unita_misura: "mq", prezzo_unitario: 20, sconto_pct: 5, capitolo_nome: "Opere" }, { descrizione: "Extra", opzionale: true }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ name: "Demolizione", quantity: 10, unit_price: 20, discount_percent: 5, unita_misura: "mq", categoria: "Opere", status: "da_ordinare" });
  });
  it("serramenti: misure nella descrizione, prezzo anche dal totale", () => {
    const [r] = righeDaSerramenti([{ tipologia_label: "Finestra 2 ante", ambiente: "Cucina", larghezza_mm: 1200, altezza_mm: 1400, quantita: 2, prezzo_totale: 1000 }]);
    expect(r).toMatchObject({ name: "Finestra 2 ante", quantity: 2, unit_price: 500, unita_misura: "cad" });
    expect(r.description).toContain("1200 x 1400 mm");
  });
  it("fotovoltaico: il prezzo di vendita, non quello netto", () => {
    expect(righeDaFotovoltaico([{ descrizione: "Pannello", quantita: 10, prezzo_unitario_netto: 80, prezzo_unitario_vendita: 120, categoria: "Moduli" }])[0]).toMatchObject({ unit_price: 120, categoria: "Moduli" });
  });
  it("un preventivo di un'altra azienda non si legge", async () => {
    const letture: string[] = [];
    await expect(righeDelPreventivo(dbFinto({ rst_progetti: [{ id: "p", company_id: "altra" }], rst_computo_voci: [{ descrizione: "X" }] }, letture), "az", "modulo:rst:p")).rejects.toThrow("non trovato");
    expect(letture).not.toContain("rst_computo_voci");
  });
  it("una sigla inventata non diventa una tabella", async () => {
    await expect(righeDelPreventivo(dbFinto({}), "az", "modulo:profiles:x")).rejects.toThrow("non riconosciuto");
  });
});
