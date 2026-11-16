// La categoria del costo viene dal TIPO del fornitore (migrazione 20290417160000).
//
// Prima `contabilizza_fattura_ricevuta` scriveva `coalesce(categoria_ai, 'materiali')`,
// e siccome l'AI non classifica quasi mai (17 fatture su 14.829 da contabilizzare, il
// 16/11/2026) in pratica scriveva sempre «materiali»: su Impresa Vulcano 791.140,67 €
// di subappalti risultavano merce da magazzino.
//
// Questa è una guardia sul testo della migrazione, non una prova del comportamento:
// serve a non perdere la precedenza in una riscrittura successiva della funzione.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { TIPI_FORNITORE } from "@/lib/fornitori/tipiFornitore";

const radice = join(__dirname, "..", "..", "..");
const sql = readFileSync(
  join(radice, "supabase/migrations/20290417160000_categoria_costo_dal_tipo_fornitore.sql"),
  "utf8",
);

describe("categoria del costo dal tipo del fornitore", () => {
  it("il tipo viene prima della categoria dell'AI, e 'materiali' resta solo l'ultima spiaggia", () => {
    expect(sql).toContain("coalesce(v_tipo_forn, nullif(f.categoria_ai, ''), 'materiali')");
    // La vecchia forma non deve sopravvivere da nessuna parte nel file.
    expect(sql).not.toContain("coalesce(nullif(f.categoria_ai, ''), 'materiali')");
  });

  it("il tipo si legge dal fornitore già risolto, non dalla fattura", () => {
    const lettura = sql.slice(sql.indexOf("if v_supplier_id is not null then"));
    expect(lettura).toContain("select nullif(btrim(s.tipo), '') into v_tipo_forn");
    expect(lettura).toContain("from public.suppliers s where s.id = v_supplier_id");
    // Senza fornitore riconosciuto la variabile resta nulla e la coalesce ricade sull'AI.
    expect(sql).toContain("v_tipo_forn      text;");
  });

  it("tocca solo il ramo che crea il costo: quello che aggiorna un costo da ordine non scrive la categoria", () => {
    const aggiorna = sql.slice(
      sql.indexOf("v_esito   := 'costo_aggiornato'") - 1400,
      sql.indexOf("v_esito   := 'costo_aggiornato'"),
    );
    expect(aggiorna).toContain("update public.company_costs");
    expect(aggiorna).not.toContain("category");
  });

  it("la funzione resta idempotente e con lo stesso contratto", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.contabilizza_fattura_ricevuta(p_fattura_id uuid)");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO 'public'");
    expect(sql).toContain("perform public.assert_company_access(f.company_id)");
  });

  it("le otto famiglie sono valori ammessi per la categoria del costo", () => {
    // `company_costs.category` è testo libero: il vincolo è che il tipo ci entri tale e quale.
    for (const tipo of TIPI_FORNITORE) expect(tipo).toMatch(/^[a-z_]+$/);
    expect(TIPI_FORNITORE).toContain("subappalto");
    expect(TIPI_FORNITORE).toContain("materiali");
  });
});
