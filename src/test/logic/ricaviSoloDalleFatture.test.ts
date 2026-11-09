/**
 * I ricavi sono le fatture emesse (09/11/2026).
 *
 * La vista dei ricavi aveva un ramo che leggeva `orders.total_amount` per le
 * aziende senza fatture nell'anno: l'intero valore del contratto in un solo
 * giorno, cancellate comprese. Questo test sorveglia che quel ramo non torni,
 * e che il valore delle commesse resti disponibile col suo nome.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { serveAvvisoRicavi } from "@/components/controllo-gestione/ui/AvvisoRicaviCommesse";

const ROOT = join(__dirname, "../../..");
const sql = readFileSync(
  join(ROOT, "supabase/migrations/20290116130000_ricavi_solo_dalle_fatture.sql"),
  "utf8",
);

describe("La vista dei ricavi", () => {
  it("legge solo le fatture: nessun ramo sugli ordini", () => {
    const corpo = sql.slice(sql.indexOf("create or replace view public.v_cg_ricavi_classificati"));
    const vista = corpo.slice(0, corpo.indexOf("comment on view"));
    expect(vista).toContain("from invoices i");
    expect(vista).not.toContain("ricavi_orders");
    expect(vista).not.toContain("from orders");
    expect(vista).not.toContain("union all");
  });

  it("tiene il segno delle note di credito e lascia fuori le cancellate", () => {
    const segni = sql.match(/case when i\.document_type = 'credit_note' then -1 else 1 end/g);
    expect(segni).toHaveLength(2);
    expect(sql).toContain("i.deleted_at is null");
  });

  it("conserva la colonna source, così chi la legge non si rompe", () => {
    expect(sql).toContain("'invoice'::text as source");
  });
});

describe("Il portafoglio commesse", () => {
  it("esiste come vista a parte, e non si chiama ricavo", () => {
    expect(sql).toContain("create or replace view public.v_cg_portafoglio_commesse");
    const commento = sql.slice(sql.indexOf("comment on view public.v_cg_portafoglio_commesse"));
    expect(commento).toContain("non un ricavo");
  });

  it("lascia fuori le commesse cancellate e le bozze", () => {
    const corpo = sql.slice(sql.indexOf("create or replace view public.v_cg_portafoglio_commesse"));
    const vista = corpo.slice(0, corpo.indexOf("comment on view"));
    expect(vista).toContain("o.deleted_at is null");
    expect(vista).toContain("<> 'bozza'");
    expect(vista).toContain("> 0::numeric");
  });

  it("si legge col permesso di chi chiede, non del creatore", () => {
    expect(sql).toContain(
      "alter view public.v_cg_portafoglio_commesse set (security_invoker = on)",
    );
  });
});

describe("La RPC che dice da dove vengono i ricavi", () => {
  it("non è aperta ad anon", () => {
    expect(sql).toMatch(/revoke all on function public\.cg_ricavi_provenienza[^\n]*from public, anon/);
    expect(sql).toMatch(/grant execute on function public\.cg_ricavi_provenienza[^\n]*to authenticated/);
  });

  it("rifiuta l'azienda di un altro, come le altre RPC del modulo", () => {
    expect(sql).toContain("Accesso negato: company_id non autorizzato");
    expect(sql).toContain("has_role(auth.uid(), 'super_admin'::public.app_role)");
  });
});

describe("Quando mostrare l'avviso in pagina", () => {
  const base = {
    anno: 2026, mese_da: 1, mese_a: 12,
    fatture_righe: 0, fatture_imponibile: 0,
    commesse_righe: 0, commesse_valore: 0,
  };

  it("nessuna fattura ma commesse sì: si avvisa", () => {
    expect(serveAvvisoRicavi({ ...base, commesse_righe: 29, commesse_valore: 24_642_814 })).toBe(true);
  });

  it("ci sono fatture: niente avviso, anche con commesse", () => {
    expect(
      serveAvvisoRicavi({
        ...base, fatture_righe: 345, fatture_imponibile: 1_488_837,
        commesse_righe: 10, commesse_valore: 100_000,
      }),
    ).toBe(false);
  });

  it("azienda nuova, senza niente: niente avviso, resta lo stato vuoto normale", () => {
    expect(serveAvvisoRicavi(base)).toBe(false);
  });

  it("dato mancante: niente avviso", () => {
    expect(serveAvvisoRicavi(null)).toBe(false);
    expect(serveAvvisoRicavi(undefined)).toBe(false);
  });
});
