import { describe, it, expect } from "vitest";
import { CATALOGO_PRODOTTI_STANDARD, verticaliProdottoStandard } from "./catalogoProdottiStandard";
import { MANODOPERA_STANDARD } from "./manodoperaStandard";
import { AREE_STANDARD } from "./areeStandard";
import { loadCatalogPages } from "./loadCatalogPages";
import { lavorazioneStandardDaCompletare } from "./statoCatalogoStandard";

describe("Basi merceologiche", () => {
  it("distingue basi senza prezzo, tariffe archiviate e standard già completati", () => {
    const base = { attivo: false, fonte: "Base standard da personalizzare", prezzo_vendita: 0 };
    expect(lavorazioneStandardDaCompletare(base)).toBe(true);
    expect(lavorazioneStandardDaCompletare({ ...base, attivo: true })).toBe(false);
    expect(lavorazioneStandardDaCompletare({ ...base, prezzo_vendita: 90 })).toBe(false);
    expect(lavorazioneStandardDaCompletare({ ...base, fonte: null })).toBe(false);
  });
  it("copre ogni tipologia delle nove aree da sviluppare", () => {
    for (const a of AREE_STANDARD.filter(a => !["serramenti", "fotovoltaico"].includes(a.chiave))) {
      for (const t of a.tipologie) expect(CATALOGO_PRODOTTI_STANDARD.some(g => g.area === a.chiave && g.tipologia === t.nome), `${a.chiave}/${t.nome}`).toBe(true);
    }
  });
  it("contiene prodotti fisici distinti, con unità e verifiche, senza listini inventati", () => {
    const keys = new Set<string>();
    for (const g of CATALOGO_PRODOTTI_STANDARD) {
      expect(g.verifiche.length).toBeGreaterThan(20);
      expect(g.prodotti.length).toBeGreaterThan(0);
      for (const p of g.prodotti) {
        const key = `${g.area}:${g.tipologia}:${p.nome}`;
        expect(keys.has(key)).toBe(false); keys.add(key);
        expect(["pz", "mq", "ml", "kg", "mc"]).toContain(p.unita);
        expect(p.nome).not.toMatch(/^(posa |installazione |smaltimento |manodopera )/i);
        expect(p).not.toHaveProperty("prezzo");
      }
    }
  });
  it("mantiene il verticale principale e abilita gli interventi trasversali", () => {
    expect(verticaliProdottoStandard("bagni")).toEqual(["bagno", "ristrutturazione"]);
    expect(verticaliProdottoStandard("pavimenti")).toEqual(["pavimenti", "ristrutturazione", "bagno"]);
    expect(verticaliProdottoStandard("piscine")).toEqual(["piscine"]);
  });
  it("separa la manodopera e copre tutte le undici aree", () => {
    for (const a of AREE_STANDARD) expect(MANODOPERA_STANDARD.some(l => l.area === a.chiave)).toBe(true);
    expect(new Set(MANODOPERA_STANDARD.map(l => `${l.area}:${l.nome}`)).size).toBe(MANODOPERA_STANDARD.length);
    expect(MANODOPERA_STANDARD.every(l => l.descrizione.includes("Sola lavorazione"))).toBe(true);
  });
});

describe("Paginazione listino", () => {
  it("non perde prodotti oltre 1.000 righe", async () => {
    const source = Array.from({ length: 1201 }, (_, i) => ({ id: String(i) }));
    const result = await loadCatalogPages(async (a, b) => ({ data: source.slice(a, b + 1), error: null }));
    expect(result).toEqual(source);
  });
  it("gestisce pagina esatta e listino vuoto", async () => {
    const rows = [{ id: "a" }, { id: "b" }];
    expect(await loadCatalogPages(async (a, b) => ({ data: rows.slice(a, b + 1), error: null }), 2)).toEqual(rows);
    expect(await loadCatalogPages(async () => ({ data: [], error: null }))).toEqual([]);
  });
  it("non restituisce risultati parziali quando una pagina fallisce", async () => {
    await expect(loadCatalogPages(async from => from === 0 ? { data: [{ id: "a" }], error: null } : { data: null, error: { message: "Errore rete" } }, 1)).rejects.toThrow("Errore rete");
  });
  it("interrompe pagine duplicate invece di entrare in un ciclo infinito", async () => {
    await expect(loadCatalogPages(async () => ({ data: [{ id: "a" }], error: null }), 1)).rejects.toThrow("Il listino è cambiato");
  });
});
