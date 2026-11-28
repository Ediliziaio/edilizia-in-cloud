/**
 * Il popup «Pagamenti e residuo» e l'elenco Fatture ricevute usano la stessa regola (28/11/2026).
 *
 * Una rata «pagata» senza scrittura di prima nota (flag acceso dal gestionale o da un'operazione
 * in blocco) resta da pagare: l'elenco (`fatture_ricevute_saldi`) e la riconciliazione lo facevano,
 * `dettaglio_pagamento_costo` no, e il popup diceva «Pagato · Residuo 0,00 · Nessun pagamento
 * registrato». Provato in produzione in transazione annullata: 4 costi scoperti tornano uguali
 * all'elenco, 5 costi di controllo restituiscono lo stesso identico JSON di prima.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20290630150000_dettaglio_pagamento_come_elenco.sql", "utf8");

describe("dettaglio_pagamento_costo come l'elenco", () => {
  it("rimette nel residuo le rate pagate con il residuo vero scoperto", () => {
    expect(sql).toMatch(/private\.fornitore_residuo_rata\(r\)/);
    expect(sql).toMatch(/r\.stato = 'pagata' and x\.residuo > 0\.005/);
    expect(sql).toMatch(/least\(coalesce\(s\.pagato, 0\) \+ s\.residuo, s\.residuo \+ sc\.importo\)/);
  });
  it("lo dice al pannello e non cambia firma né sicurezza", () => {
    expect(sql).toMatch(/'segnata_non_registrata'/);
    expect(sql).toMatch(/'rate_segnate_non_registrate'/);
    expect(sql).toMatch(/create or replace function public\.dettaglio_pagamento_costo\(p_costo uuid\)\s+returns jsonb/);
    expect(sql).toMatch(/security definer\s+set search_path to ''/);
    expect(sql).toMatch(/raise exception 'Costo non disponibile' using errcode='42501'/);
  });
});
