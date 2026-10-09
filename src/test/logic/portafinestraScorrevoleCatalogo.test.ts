import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { configurazioniStandard } from "@/lib/serramenti/catalogoConfigurazioni";

describe("portafinestra scorrevole nel catalogo pubblicato", () => {
  const base = JSON.parse(readFileSync("supabase/migrations/20261009082822_serramenti_catalogo_configurazioni_comune.sql", "utf8").split("$configurazioni$")[1]) as ReturnType<typeof configurazioniStandard>;
  const sql = readFileSync("supabase/migrations/20261009140322_porta_finestra_scorrevole_due_ante.sql", "utf8");

  it("l'estensione ripristina la parità completa tra motore ed installazione database", () => {
    const source = base.find(c => c.id === "finestra_scorrevole_2_ante")!;
    const door = {
      id: "porta_finestra_scorrevole_2_ante",
      nome: "Porta finestra scorrevole 2 ante",
      assi: [source.assi[0], { codice: "soglia", nome: "Soglia", valori: [{ codice: "con", nome: "Con soglia" }, { codice: "senza", nome: "Senza soglia" }] }, ...source.assi.slice(1)],
    };
    const installed = [...base, door].sort((a, b) => a.id.localeCompare(b.id));
    expect(installed).toEqual(configurazioniStandard().sort((a, b) => a.id.localeCompare(b.id)));
    expect(sql).toContain("'id', 'porta_finestra_scorrevole_2_ante'");
    expect(sql).toContain("jsonb_build_array(source_cfg->'assi'->0");
    expect(sql).toContain("((source_cfg->'assi') - 0)");
  });

  it("completa tutte le linee interessate senza aggiornare prodotti o prezzi già presenti", () => {
    expect(sql).toContain("select distinct company_id, macrocategoria_id, categoria_id");
    expect(sql).toContain("deleted_at is null and attivo and mostra_preventivo");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("then continue; end if");
    expect(sql).not.toMatch(/update\s+public\.article_families/i);
    expect(sql).not.toMatch(/720|Renova|Living/);
    expect(sql).toContain('"prezzo_da_definire":true');
  });
});
