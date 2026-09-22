import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CAPITOLI_EDILI, leggiOrdine, leggiPagineLibere, ordineEffettivo, sposta, type PaginaLibera,
} from "@/components/preventivi/pdf/ordineCapitoli";
import { leggiModello, type AziendaComune, type ProgettoComune } from "@/components/preventivi/pdf/adattatoreEdile";

/**
 * Ordine dei capitoli e pagine libere negli otto moduli edili (21/09/2026):
 * i Serramenti e il Fotovoltaico permettevano già di riordinare, gli edili no.
 */

const leggi = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const chiavi = (o: Array<{ chiave: string }>) => o.map((v) => v.chiave);
const pagina = (id: string, titolo = "Le nostre *certificazioni*."): PaginaLibera => ({ id, occhiello: null, titolo, testoHtml: "<p>Testo</p>", fotoUrl: null, didascalia: null });

describe("ordine dei capitoli", () => {
  it("senza scelte è l'ordine di serie: prima il valore, poi il prezzo", () => {
    expect(chiavi(ordineEffettivo([], []))).toEqual(CAPITOLI_EDILI.map((c) => c.chiave));
  });

  it("l'ordine salvato vale; i capitoli che mancano prendono il loro posto di serie", () => {
    const o = ordineEffettivo([{ chiave: "investimento", visibile: true }, { chiave: "piano", visibile: true }], []);
    // «investimento» e «piano» nell'ordine scelto; «apertura» sempre in testa; il resto al suo posto
    expect(chiavi(o)[0]).toBe("apertura");
    expect(chiavi(o).indexOf("investimento")).toBeLessThan(chiavi(o).indexOf("piano"));
    expect(o).toHaveLength(CAPITOLI_EDILI.length);
  });

  it("l'apertura non si sposta e l'investimento non si nasconde", () => {
    const o = ordineEffettivo([{ chiave: "chiSiamo", visibile: true }, { chiave: "apertura", visibile: true }, { chiave: "investimento", visibile: false }], []);
    expect(o[0].chiave).toBe("apertura");
    expect(o.find((v) => v.chiave === "investimento")?.visibile).toBe(true);
    expect(sposta(o, "chiSiamo", -1)).toEqual(o); // non scavalca l'apertura
  });

  it("le chiavi sconosciute e i doppioni si scartano", () => {
    const o = ordineEffettivo([{ chiave: "inesistente", visibile: true }, { chiave: "piano", visibile: true }, { chiave: "piano", visibile: false }], []);
    expect(chiavi(o)).not.toContain("inesistente");
    expect(chiavi(o).filter((k) => k === "piano")).toHaveLength(1);
    expect(o.find((v) => v.chiave === "piano")?.visibile).toBe(true);
  });

  it("una pagina libera nuova entra prima del prezzo; una eliminata sparisce dall'ordine", () => {
    const o = ordineEffettivo([], [pagina("cert")]);
    expect(chiavi(o).indexOf("libera:cert")).toBe(chiavi(o).indexOf("piano") - 1);
    const senza = ordineEffettivo(o, []);
    expect(chiavi(senza)).not.toContain("libera:cert");
  });

  it("sposta di un posto in su e in giù", () => {
    const o = ordineEffettivo([], []);
    const giu = sposta(o, "chiSiamo", 1);
    expect(chiavi(giu).indexOf("chiSiamo")).toBe(chiavi(o).indexOf("chiSiamo") + 1);
  });

  it("dal database: valori sporchi letti con prudenza; le pagine vuote non vanno al PDF", () => {
    expect(leggiOrdine(null)).toEqual([]);
    expect(leggiOrdine([{ chiave: "piano" }, { x: 1 }, null])).toEqual([{ chiave: "piano", visibile: true }]);
    const pagine = [{ id: "a", titolo: "" }, { id: "b", titolo: "Showroom" }];
    expect(leggiPagineLibere(pagine).map((p) => p.id)).toEqual(["b"]);
    expect(leggiPagineLibere(pagine, { ancheVuote: true }).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("arriva fino al documento passando dal modello", () => {
    const m = leggiModello(
      { pdf_ordine_capitoli: [{ chiave: "investimento", visibile: true }], pdf_pagine_libere: [{ id: "x", titolo: "Lo *showroom*." }] },
      { progetto: { id: "p", code: "X" } as unknown as ProgettoComune, azienda: null as AziendaComune | null },
    );
    expect(m.ordineCapitoli).toEqual([{ chiave: "investimento", visibile: true }]);
    expect(m.pagineLibere.map((p) => p.titolo)).toEqual(["Lo *showroom*."]);
  });
});

describe("il documento segue l'ordine scelto", () => {
  const doc = leggi("src/components/preventivi/pdf/DocumentoEdilePDF.tsx");

  it("i capitoli escono dalla sequenza, non da un elenco scritto a mano", () => {
    expect(doc).toContain("const sequenza = ordine.filter(");
    expect(doc).toMatch(/sequenza\.map\(\(v, i\) =>/);
    expect(doc).not.toContain("numeri.chiSiamo");
  });

  it("i numeri e l'indice seguono la sequenza", () => {
    expect(doc).toContain("const numeroDi = new Map(sequenza.map((v, i) => [v.chiave, i + 1]));");
  });

  it("i modelli portano ordine e pagine libere fino al PDF (il normalizzatore non li butta)", () => {
    for (const hook of ["useRistrutturazioneProgetto", "useBagniProgetto", "useTettiProgetto", "useClimatizzazioneProgetto", "useElettricoProgetto", "useTermoidraulicoProgetto", "usePavimentiProgetto", "usePiscineProgetto"]) {
      const norm = leggi(`src/hooks/${hook}.ts`);
      const fn = norm.slice(norm.indexOf("function normalizeTemplate"));
      expect(fn).toContain("pdf_ordine_capitoli:");
      expect(fn).toContain("pdf_pagine_libere:");
    }
  });

  it("le foto delle pagine libere si incorporano come le altre immagini del modello", () => {
    expect(leggi("src/components/preventivi/pdf/immaginiDocumento.ts")).toContain("pdf_pagine_libere: pagineLiberePronte");
  });

  it("gli otto editor hanno la voce «Ordine e pagine» e una sezione per ogni pagina (22/09/2026)", () => {
    expect(leggi("src/components/preventivi/pagineEditor.ts")).toContain('{ id: "page_ordine", voce: "Ordine e pagine"');
    for (const m of ["bagni/Bagni", "tetti/Tetti", "climatizzazione/Climatizzazione", "elettrico/Elettrico", "termoidraulico/Termoidraulico", "pavimenti/Pavimenti", "piscine/Piscine", "ristrutturazione/Ristrutturazione"]) {
      const src = leggi(`src/components/${m}TemplateEditor.tsx`);
      expect(src).toContain("items: PAGINE_EDITOR_EDILI.map(");
      expect(src).toContain("<OrdineCapitoli");
      expect(src).toContain("<SezionePaginaEdile");
      expect(src).toContain("apriSezione={(sezione) => setActiveSection(");
    }
  });
});
