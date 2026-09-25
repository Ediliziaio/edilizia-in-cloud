import { describe, expect, it } from "vitest";
import { createFullSerramentiTemplate, upgradeSerramentiModuleTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
import { createSerramentiModuleTemplate } from "@/lib/moduli-vendita/serramentiTemplateModules";
import { leggiBlocco, eFotoDiSerie } from "../../../supabase/functions/_shared/blocchiPreventivo";

const base = { company_id: "qa", ragione_sociale: "Impresa esempio" };
describe("Persiane, edizione completa del modello originale", () => {
  it("abilita le sezioni originali senza introdurre dati di finestre", () => {
    const t = createFullSerramentiTemplate(base, "persiane");
    const enabled = t.pdf_pages_order!.filter(p => p.visible).map(p => p.id);
    expect(enabled).toEqual(expect.arrayContaining(["proposta", "come_funziona", "allegato_tecnico", "investimento", "percorso", "protezione", "controlli", "documenti", "diario", "garanzie", "faq", "cta", "condizioni"]));
    expect(enabled.indexOf("investimento")).toBeGreaterThan(enabled.indexOf("allegato_tecnico"));
    expect(JSON.stringify(t.pdf_blocchi)).not.toMatch(/warm edge|vetrocamera|trasmittanza/);
    expect(t.pdf_cover_overlay_opacity).toBeGreaterThanOrEqual(60);
    expect(t.testimonianze_default).toEqual([]);
    expect(t.confronto_attivo).toBe(false);
  });
  it("non crea una pagina azienda vuota quando manca la presentazione", () => {
    expect(createFullSerramentiTemplate(base, "persiane").chi_siamo_attivo).toBe(false);
    const t = createFullSerramentiTemplate({ ...base, chi_siamo_testo: "La presentazione reale." }, "persiane");
    expect(t.chi_siamo_attivo).toBe(true);
    expect(t.chi_siamo_testo).toBe("La presentazione reale.");
  });
  it("segnala le immagini generate come illustrative nel motore originale", () => {
    const t = createFullSerramentiTemplate(base, "persiane");
    const block = leggiBlocco("comeFunziona", "serramenti", t.pdf_blocchi);
    expect(eFotoDiSerie(block.foto[0])).toBe(true);
    expect(block.nota).toMatch(/illustrativa/);
    expect(block.voci.every(v => !!v.icona)).toBe(true);
  });
  it("aggiorna solo i vecchi default conservando le modifiche dell'utente", () => {
    const old = createSerramentiModuleTemplate(base, "persiane");
    old.pdf_cover_hero = "Persiane di casa mia";
    old.faq_items = [{ domanda: "Domanda nostra", risposta: "Risposta nostra" }];
    old.pdf_blocchi = { ...old.pdf_blocchi, pagina_cta: { foto: ["/mia-foto.jpg"] } };
    const snapshot = JSON.stringify(old);
    const next = upgradeSerramentiModuleTemplate(old, base, "persiane");
    expect(next.pdf_cover_hero).toBe("Persiane di casa mia");
    expect(next.faq_items).toEqual(old.faq_items);
    expect(next.pdf_blocchi).toMatchObject({ pagina_cta: { foto: ["/mia-foto.jpg"] }, modulo_edizione: 2 });
    expect(next.percorso_cliente?.attivo).toBe(true);
    expect(JSON.stringify(old)).toBe(snapshot);
  });
  it("non cambia un ordine pagine personalizzato durante l'aggiornamento", () => {
    const old = createSerramentiModuleTemplate(base, "persiane");
    old.pdf_pages_order = old.pdf_pages_order!.map(p => p.id === "render" ? { ...p, visible: true } : p);
    expect(upgradeSerramentiModuleTemplate(old, base, "persiane").pdf_pages_order).toEqual(old.pdf_pages_order);
  });
  it("ripristina le specifiche Persiane, non il vetro delle finestre", () => {
    const t = createFullSerramentiTemplate(base, "persiane");
    const blocks = { ...t.pdf_blocchi } as Record<string, unknown>;
    delete blocks.comeFunziona;
    const restored = leggiBlocco("comeFunziona", "serramenti", blocks);
    expect(restored.titolo).toMatch(/persiane/);
    expect(JSON.stringify(restored)).not.toMatch(/warm edge|vetrocamera/);
    blocks.comeFunziona = { titolo: "", intro: "Testo mio" };
    expect(leggiBlocco("comeFunziona", "serramenti", blocks).titolo).toMatch(/persiane/);
    expect(leggiBlocco("comeFunziona", "serramenti", blocks).intro).toBe("Testo mio");
  });
  it("corregge l'opacità frazionaria della prima edizione", () => {
    const old = { ...createSerramentiModuleTemplate(base, "persiane"), pdf_cover_overlay_opacity: 0.65 };
    expect(upgradeSerramentiModuleTemplate(old, base, "persiane").pdf_cover_overlay_opacity).toBe(75);
  });
});
