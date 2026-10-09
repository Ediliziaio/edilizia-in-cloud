import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { costruisciListino, filtraListino, risolviSelezione } from "@/lib/listino/lineeListino";
import { FILTRI_LISTINO_INIZIALI, rigaPassa } from "@/lib/listino/filtriListino";
import { articoloEsempio, asseEsempio, valoreEsempio } from "@/lib/listino/esempiListino";

const macro = [{ id: "macro", nome: "Serramenti", verticali_abilitati: ["serramenti"] }];
const categorie = [{ id: "cat", nome: "PVC Salamander", macrocategoria_id: "macro" }, { id: "vuota", nome: "Rehau nuova", macrocategoria_id: "macro" }];
const families = [
  articoloEsempio("vecchio", "Finestra 1 anta", { macrocategoria_id: "macro", attivo: false,
    axes: [asseEsempio("linea", "Linea", [valoreEsempio("v1", "PVC Salamander"), valoreEsempio("v2", "PVC Aluplast")])] }),
  articoloEsempio("nuovo", "Finestra 1 anta", { macrocategoria_id: "macro", categoria_id: "cat", prezzo_base_vendita: 720 }),
];
const aree = costruisciListino(families, macro, categorie);
const filtra = (stato = FILTRI_LISTINO_INIZIALI.stato) => filtraListino(aree, (r) => rigaPassa(r, "", { ...FILTRI_LISTINO_INIZIALI, stato }), true);

describe("listino attivi senza doppioni disattivati", () => {
  it("la vista normale elimina le linee dei vecchi articoli, non i loro dati", () => {
    const a = filtra();
    expect(a[0].articoli).toBe(1);
    expect(a[0].tipologie[0].linee.map((l) => l.chiave)).toEqual(["cat:cat", "cat:vuota"]);
    expect(families[0].attivo).toBe(false);
    expect(aree[0].articoli).toBe(2);
  });
  it("Tutti e Solo disattivati permettono di ritrovare e riattivare il vecchio listino", () => {
    expect(filtra("all")[0].articoli).toBe(2);
    const spenti = filtra("disattivi")[0].tipologie[0].linee.flatMap((l) => l.righe);
    expect(spenti.map((r) => r.famiglia.id)).toEqual(["vecchio", "vecchio"]);
  });
  it("un link a una vecchia linea passa alla linea attiva e conserva le linee nuove vuote", () => {
    expect(risolviSelezione(filtra(), { area: "serramenti", linea: "linea:pvc_salamander" }).linea?.chiave).toBe("cat:cat");
    expect(risolviSelezione(filtra(), { area: "serramenti", linea: "cat:vuota" }).linea?.chiave).toBe("cat:vuota");
    expect(filtraListino(aree, () => false)).toEqual([]);
  });
});

describe("contratto server dei prezzi mancanti", () => {
  const sql = readFileSync("supabase/migrations/20261009090423_serramenti_linee_attive_prezzi_mancanti.sql", "utf8");
  it("scrive solo vendita mq senza prezzo, attiva, non archiviata, nella propria categoria", () => {
    expect(sql).toContain("has_permission_for_company");
    expect(sql).toContain("f.company_id = v_company and f.macrocategoria_id = p_macrocategoria_id");
    expect(sql).toContain("f.categoria_id = p_categoria_id");
    expect(sql).toContain("f.deleted_at is null and f.attivo and f.mostra_preventivo");
    expect(sql).toContain("f.modalita_prezzo_base = 'mq' and f.prezzo_base_mode = 'vendita'");
    expect(sql).toContain("coalesce(f.prezzo_base_vendita, 0) = 0");
    expect(sql).not.toMatch(/set\s+(prezzo_base_acquisto|attivo|deleted_at)|update public\.(sr_|article_family_axis_values)/i);
  });
  it("non inventa una tariffa globale e non riaccende una linea disattivata", () => {
    expect(sql).not.toContain("720");
    expect(sql).toContain("v_frequenza, 0) * 2 <= v_prezzati");
    expect(sql).toContain("Linea disattivata: riattiva prima un prodotto");
    expect(sql).toContain("from public, anon");
  });
});
