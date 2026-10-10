/**
 * Importa listino: i testi che dicono dove vanno i dati devono dire la verità (10/10/2026).
 *
 * «Prodotti / Articoli» scrive nel catalogo articoli (non nel Listino), «Famiglie Prodotto» nei prodotti del Listino
 * ma sempre «a pezzo» e senza tipologia, e il suo modello non ha le colonne del prezzo mentre ne ha quattro che
 * l'importazione non legge. Questo test legge la edge function e il modello e controlla che i testi dicano lo stesso.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXED_COLUMNS } from "@/lib/catalogo/listinoTemplate";
import {
  COLONNE_NON_LETTE,
  DESTINAZIONI_IMPORT,
  contaElementi,
  fraseConferma,
  nomiColonneNonLette,
} from "@/lib/catalogo/destinazioniImport";
import type { CatalogObjectType } from "@/hooks/useCompanyCustomFields";

const edge = readFileSync(resolve(process.cwd(), "supabase/functions/catalog-import-batch/index.ts"), "utf8");
const corpo = (funzione: string, seguente: string) => {
  const da = edge.indexOf(`async function ${funzione}(`);
  const a = seguente ? edge.indexOf(`async function ${seguente}(`) : edge.indexOf("// Handler");
  expect(da, funzione).toBeGreaterThan(-1);
  expect(a, seguente).toBeGreaterThan(da);
  return edge.slice(da, a);
};
const importatori: Record<CatalogObjectType, string> = {
  product: corpo("importProducts", "importFamilies"),
  family: corpo("importFamilies", "importTariffe"),
  tariffa: corpo("importTariffe", ""),
};
const chiaviLette = (tipo: CatalogObjectType) =>
  new Set([...importatori[tipo].matchAll(/\br\.([a-z_]+)/g)].map((m) => m[1]).filter((k) => k !== "custom_field_values"));

describe("Importa listino: dove vanno i dati", () => {
  it("ogni tipo scrive nella tabella che il testo dice", () => {
    expect(importatori.product).toContain('.from("article_templates")');
    expect(importatori.product).not.toContain('.from("article_families")');
    expect(importatori.family).toContain('.from("article_families")');
    expect(importatori.tariffa).toContain('.from("tariffe_aziendali")');
    expect(DESTINAZIONI_IMPORT.product.dove).toContain("catalogo articoli");
    expect(DESTINAZIONI_IMPORT.product.dove).toContain("Non compare nel Listino");
    expect(DESTINAZIONI_IMPORT.family.dove).toContain("Va nel Listino");
    expect(DESTINAZIONI_IMPORT.tariffa.dove).toContain("Manodopera e servizi");
  });

  it("i nomi del menu non lasciano dubbi su cosa è il Listino e cosa no", () => {
    expect(Object.values(DESTINAZIONI_IMPORT).map((d) => d.nome)).toEqual([
      "Catalogo articoli (ordini e preventivi edili)",
      "Prodotti del Listino",
      "Manodopera e servizi",
    ]);
  });

  it("«Prodotti del Listino» forza «a pezzo», senza tipologia e senza linea: il testo lo dice", () => {
    expect(importatori.family).toContain('modalita_prezzo_base: "pz"');
    expect(importatori.family).not.toMatch(/macrocategoria_id|categoria_id:/);
    const frasi = DESTINAZIONI_IMPORT.family.attenzione.join(" ");
    expect(frasi).toContain("«a pezzo»");
    expect(frasi).toContain("senza tipologia");
    expect(frasi).toContain("senza linea");
  });

  it("il modello di «Prodotti del Listino» non ha le colonne che il server saprebbe leggere (prezzo, costo, IVA, unità): il testo dice che i prodotti nascono a 0 €", () => {
    const nelModello = new Set(FIXED_COLUMNS.family.map((c) => c.key));
    const mancanti = ["base_price", "list_price", "cost", "vat_rate", "unit"];
    for (const chiave of mancanti) {
      expect(chiaviLette("family").has(chiave), `il server non legge più ${chiave}`).toBe(true);
      expect(nelModello.has(chiave), `il modello ora ha la colonna ${chiave}: aggiorna il testo di «Prodotti del Listino»`).toBe(false);
    }
    expect(importatori.family).toContain("prezzo_base_vendita ?? 0");
    expect(importatori.family).toContain("vat_rate ?? 22");
    expect(DESTINAZIONI_IMPORT.family.attenzione.join(" ")).toContain("0 €");
  });
});

describe("Importa listino: le colonne del modello che nessuno legge", () => {
  for (const tipo of ["product", "family", "tariffa"] as const) {
    it(`${tipo}: l'elenco delle colonne ignorate è quello vero`, () => {
      const lette = chiaviLette(tipo);
      const ignorate = FIXED_COLUMNS[tipo].map((c) => c.key).filter((k) => !lette.has(k));
      expect(ignorate.sort()).toEqual([...COLONNE_NON_LETTE[tipo]].sort());
    });
  }

  it("nel testo compaiono con il nome che il titolare vede nel modello", () => {
    expect(nomiColonneNonLette("family")).toEqual(["Codice", "Famiglia Padre", "Margine Default %", "Ricarico Default %"]);
    expect(nomiColonneNonLette("tariffa")).toEqual(["Codice", "Margine %", "Ore/Giorno", "Valida Dal (AAAA-MM-GG)", "Valida Al (AAAA-MM-GG)"]);
    expect(nomiColonneNonLette("product")).toEqual([]);
  });
});

describe("Importa listino: la conferma dice cosa stai per fare", () => {
  it("con il nome vero e il numero giusto", () => {
    expect(contaElementi("product", 1)).toBe("1 articolo");
    expect(contaElementi("product", 12)).toBe("12 articoli");
    expect(contaElementi("family", 1)).toBe("1 prodotto");
    expect(contaElementi("tariffa", 3)).toBe("3 voci");
    expect(fraseConferma("product", 12)).toBe("Stai per importare 12 articoli nel catalogo articoli (ordini e preventivi edili).");
    expect(fraseConferma("family", 1)).toBe("Stai per importare 1 prodotto nel Listino.");
    expect(fraseConferma("tariffa", 2)).toBe("Stai per importare 2 voci in Manodopera e servizi.");
  });

  it("dice come si annulla: per gli articoli non si può, e il motivo è vero (nessuna pagina li cancella)", () => {
    expect(DESTINAZIONI_IMPORT.product.annullare).toContain("non si annulla");
    expect(DESTINAZIONI_IMPORT.family.annullare).toContain("15 giorni nel cestino");
    expect(DESTINAZIONI_IMPORT.tariffa.annullare).toContain("eliminarle a mano");
  });
});
