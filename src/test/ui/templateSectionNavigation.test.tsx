import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import fs from "node:fs";
import { TemplateSectionNavigation } from "@/components/preventivi/TemplateSectionNavigation";
import { edileSectionExcluded, orderedSectionExcluded, orderTemplateNavigationItems } from "@/components/preventivi/templateNavigationState";
import { PAGINE_EDITOR } from "@/components/preventivi/pagineEditor";

afterEach(cleanup);

describe("navigazione comune dei modelli", () => {
  it("ordina solo il menu delle pagine, preservando dati, gruppi tecnici e sezioni sconosciute", () => {
    const items = [{ id: "page_documenti" }, { id: "page_come_funziona" }, { id: "page_cover" }, { id: "page_percorso" }, { id: "custom_a" }, { id: "custom_b" }];
    expect(orderTemplateNavigationItems(items).map(item => item.id)).toEqual(["page_cover", "page_percorso", "page_come_funziona", "page_documenti", "custom_a", "custom_b"]);
    expect(items[0].id).toBe("page_documenti");
    const settings = [{ id: "default" }, { id: "garanzie" }, { id: "macro" }];
    expect(orderTemplateNavigationItems(settings)).toEqual(settings);
  });
  it("mantiene editabili le pagine escluse, con etichetta stabile e stato accessibile", () => {
    const select = vi.fn();
    render(<TemplateSectionNavigation groups={[{ label: "PAGINE DEL PDF", items: [
      { id: "page_cover", label: "Copertina", emoji: "🖼️", descr: "Prima pagina" },
      { id: "page_lavori", label: "I nostri lavori", emoji: "📸", descr: "Lavori autentici" },
    ] }]} activeSection="page_cover" onSelect={select} isExcluded={id => id === "page_lavori"} />);
    const cover = screen.getByRole("button", { name: "Copertina" });
    const excluded = screen.getByRole("button", { name: "I nostri lavori" });
    expect(cover).toHaveAttribute("aria-current", "page");
    expect(within(excluded).getByLabelText("Esclusa dal PDF")).toBeInTheDocument();
    expect(excluded).toHaveAccessibleDescription(/Puoi modificarla senza riattivarla/);
    expect(excluded).toBeEnabled();
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(excluded);
    expect(select).toHaveBeenCalledExactlyOnceWith("page_lavori");
    expect(screen.getByText(/L’anteprima mostra l’ordine finale/)).toBeInTheDocument();
  });

  it("usa gli stessi nomi senza cambiare le chiavi dei tre motori", () => {
    for (const pages of Object.values(PAGINE_EDITOR)) {
      expect(new Set(pages.map(page => page.id)).size).toBe(pages.length);
      for (const [id, label] of Object.entries({ page_cover: "Copertina", page_percorso: "Come lavoriamo", page_come_funziona: "Come funziona", page_protezione: "Protezione degli ambienti" })) {
        expect(pages.find(page => page.id === id)?.voce).toBe(label);
      }
      expect(pages.find(page => ["page_domande", "page_faq"].includes(page.id))?.voce).toBe("Domande e risposte");
      expect(pages.find(page => ["page_chiusura", "page_cta"].includes(page.id))?.voce).toBe("I prossimi passi");
    }
    expect(PAGINE_EDITOR.serramenti.find(page => page.id === "page_garanzie")?.pagina).toBe("garanzie");
    expect(PAGINE_EDITOR.fotovoltaico.find(page => page.id === "page_chi_siamo")?.voce).toBe("Chi siamo e garanzie");
  });

  it("legge esclusioni e interruttori edili senza mutare valori né inventare pagine presenti", () => {
    const form = { show_garanzie: false, pdf_ordine_capitoli: [{ chiave: "recensioni", visibile: false, extra: "keep" }] };
    const before = JSON.stringify(form);
    expect(edileSectionExcluded(form, "garanzie")).toBe(true);
    expect(edileSectionExcluded(form, "page_domande")).toBe(true);
    expect(edileSectionExcluded(form, "page_testimonianze")).toBe(true);
    expect(edileSectionExcluded(form, "page_cover")).toBe(false);
    expect(edileSectionExcluded(form, "opzioni")).toBe(false);
    expect(edileSectionExcluded({}, "page_chi_siamo")).toBe(false);
    expect(edileSectionExcluded({ show_chi_siamo: false }, "page_chi_siamo")).toBe(true);
    expect(edileSectionExcluded({ show_percorso: false }, "page_percorso")).toBe(true);
    expect(edileSectionExcluded({ show_cronoprogramma: false }, "page_crono")).toBe(true);
    expect(JSON.stringify(form)).toBe(before);
  });

  it("rispetta l'eredità delle FAQ e gli ID diversi dei motori originali", () => {
    expect(edileSectionExcluded({ pdf_ordine_capitoli: [{ chiave: "garanzie", visibile: false }] }, "page_domande")).toBe(true);
    const pages = [{ id: "iter", visible: false }, { id: "garanzie", visible: false }, { id: "cover", visible: false }];
    expect(orderedSectionExcluded("fotovoltaico", pages, "page_percorso")).toBe(true);
    expect(orderedSectionExcluded("fotovoltaico", pages, "page_chi_siamo")).toBe(true);
    expect(orderedSectionExcluded("serramenti", pages, "page_garanzie")).toBe(true);
    expect(orderedSectionExcluded("serramenti", pages, "garanzie")).toBe(false);
    expect(orderedSectionExcluded("serramenti", pages, "page_cover")).toBe(true);
    expect(orderedSectionExcluded("fotovoltaico", pages, "page_conversione")).toBe(false);
    expect(orderedSectionExcluded("serramenti", [], "page_confronto", { confronto_attivo: false })).toBe(true);
    expect(orderedSectionExcluded("serramenti", [], "page_chi_siamo", { chi_siamo_attivo: false })).toBe(true);
    expect(orderedSectionExcluded("serramenti", [], "page_percorso", { percorso_cliente: { attivo: false } })).toBe(true);
    expect(orderedSectionExcluded("fotovoltaico", [], "page_confronto", { confronto_attivo: false })).toBe(false);
  });

  for (const module of ["bagni/Bagni", "tetti/Tetti", "climatizzazione/Climatizzazione", "termoidraulico/Termoidraulico", "elettrico/Elettrico", "pavimenti/Pavimenti", "piscine/Piscine", "ristrutturazione/Ristrutturazione", "serramenti/Serramenti", "fotovoltaico/Fotovoltaico", "facciate/Facciate"]) {
    it(`${module}: un solo menu e lo stesso selettore mobile`, () => {
      const source = fs.readFileSync(`src/components/${module}TemplateEditor.tsx`, "utf8");
      expect(source.match(/<TemplateSectionNavigation\s/g)).toHaveLength(1);
      expect(source.match(/<TemplateEditorNavigation>/g)).toHaveLength(1);
      expect(source).not.toContain("mobileSidebarOpen");
    });
  }
});
