import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { BatchProductConfigurator } from "@/components/marketing/preventivi/configurators/BatchProductConfigurator";
import { SimpleProductConfigurator } from "@/components/marketing/preventivi/configurators/SimpleProductConfigurator";
import { descrizioneCommerciale, prezziVenditaCompleti, prodottoSemplice } from "@/lib/preventivi/configurazioneSemplice";
import type { CatalogItem } from "@/types/catalogItem";
import type { QuoteItemPro } from "@/types/quoteItem";

const prodotti: CatalogItem[] = ["Collante", "Rasante"].map((nome, index) => ({
  id: String(index), source: "article", nome, modalita_prezzo: "pz", unit_of_measure: "pz",
  prezzo_base_vendita: 0, ha_montaggio_automatico: false,
  descrizione: "Uso interno ed esterno\nStorico costi unitari da fatture: 10 €\nRiconciliazione Palma: Solo costo acquisto.",
  article: { id: String(index), prezzo_acquisto_netto: 10 + index, vat_rate: 22 },
} as CatalogItem));
afterEach(cleanup);

describe("Prodotti semplici e selezione multipla", () => {
  it("non propone il costo come vendita e inserisce solo il prezzo cliente esplicito", () => {
    const aggiungi = vi.fn();
    render(<SimpleProductConfigurator item={prodotti[0]} currentSortOrder={4} onBack={vi.fn()} onAddItems={aggiungi} />);
    expect(screen.getByLabelText("Prezzo di vendita unitario (€)")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Aggiungi al preventivo" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Prezzo di vendita unitario (€)"), { target: { value: "18,0044" } });
    fireEvent.change(screen.getByLabelText("Quantità (pz)"), { target: { value: "2,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi al preventivo" }));
    expect(aggiungi.mock.calls[0][0][0].quote_item).toMatchObject({ unit_price: 18.0044, prezzo_acquisto: 10, quantity: 2.5, sort_order: 4, description: "Uso interno ed esterno", article_template_id: "0", family_id: null });
    expect(aggiungi.mock.calls[0][1]).toBe(5);
  });
  it("modifica insieme quantità e vendita, mantiene i costi distinti e aggiunge righe ordinate", () => {
    const aggiungi = vi.fn();
    render(<BatchProductConfigurator items={prodotti} currentSortOrder={7} onBack={vi.fn()} onRemove={vi.fn()} onAddItems={aggiungi} />);
    expect(screen.getByRole("button", { name: /Aggiungi 2 prodotti/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Quantità per tutti"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Prezzo cliente per tutti"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Applica a tutti" }));
    fireEvent.change(screen.getByLabelText("Prezzo cliente Rasante"), { target: { value: "25" } });
    expect(screen.getByText(/135,00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi 2 prodotti/ }));
    const righe = aggiungi.mock.calls[0][0];
    expect(righe.map((r: { quote_item: QuoteItemPro }) => [r.quote_item.unit_price, r.quote_item.prezzo_acquisto, r.quote_item.sort_order])).toEqual([[20, 10, 7], [25, 11, 8]]);
    expect(righe[0].client_temp_id).not.toBe(righe[1].client_temp_id);
    expect(aggiungi.mock.calls[0][1]).toBe(9);
  });
  it("conserva le modifiche quando la selezione cambia e rimuove la riga giusta", () => {
    function Harness() {
      const [items, setItems] = useState([prodotti[0]]);
      return <><button onClick={() => setItems(prodotti)}>Seleziona altro</button><BatchProductConfigurator items={items} currentSortOrder={0} onBack={vi.fn()} onAddItems={vi.fn()} onRemove={item => setItems(prev => prev.filter(p => p.id !== item.id))} /></>;
    }
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Prezzo cliente Collante"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Seleziona altro" }));
    expect(screen.getByLabelText("Prezzo cliente Collante")).toHaveValue("15");
    expect(screen.getByLabelText("Prezzo cliente Rasante")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi Collante" }));
    expect(screen.queryByLabelText("Prezzo cliente Collante")).toBeNull();
    expect(screen.getByLabelText("Prezzo cliente Rasante")).toBeInTheDocument();
  });
  it("non semplifica prodotti con varianti, posa o markup", () => {
    expect(prodottoSemplice(prodotti[0])).toBe(true);
    expect(prodottoSemplice({ ...prodotti[0], modalita_prezzo: "mq" })).toBe(false);
    expect(prodottoSemplice({ ...prodotti[0], ha_montaggio_automatico: true } as CatalogItem)).toBe(false);
    const family = { ...prodotti[0], source: "family", ha_posa_automatica: false, family: { axes: [], prezzo_base_mode: "vendita", manodopera_modalita: "nessuna" } } as CatalogItem;
    expect(prodottoSemplice(family)).toBe(true);
    expect(prodottoSemplice({ ...family, family: { ...(family.source === "family" ? family.family : {}), manodopera_modalita: "manuale" } } as CatalogItem)).toBe(false);
  });
  it("separa descrizioni commerciali e blocca offerte senza vendita, salvo totale manuale esplicito", () => {
    expect(descrizioneCommerciale(prodotti[0].descrizione)).toBe("Uso interno ed esterno");
    const righe = [{ item_category: "prodotto", unit_price: 0, prezzo_acquisto: 80 }] as QuoteItemPro[];
    expect(prezziVenditaCompleti(righe, null)).toBe(false);
    expect(prezziVenditaCompleti(righe, 100)).toBe(true);
    expect(prezziVenditaCompleti(righe, 0)).toBe(false);
  });
});
