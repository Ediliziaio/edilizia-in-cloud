import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ArticleConfigurator } from "@/components/marketing/preventivi/configurators/ArticleConfigurator";
import type { CatalogItemArticle } from "@/types/catalogItem";
import type { TariffaPro } from "@/hooks/usePreventivoCosti";
const item = { source: "article", id: "prodotto", nome: "Porta", modalita_prezzo: "pz", ha_montaggio_automatico: true, posa_linked: true, article: { id: "prodotto", name: "Porta", prezzo_vendita: 200, prezzo_acquisto_netto: 100, vat_rate: 22, unit_of_measure: "pz", montaggio_tariffa_id: "posa" } } as CatalogItemArticle;
const tariffa = { id: "posa", nome: "Montaggio porta", tipo: "posa", prezzo_vendita: 40, prezzo_costo: 20, unita: "pz", unita_fatturazione: "pz" } as TariffaPro;
afterEach(cleanup);
describe("Montaggio collegato all’inserimento del prodotto", () => {
  it("propone il montaggio già selezionato e crea due righe collegate", () => {
    const aggiungi = vi.fn();
    render(<ArticleConfigurator item={item} tariffe={[tariffa]} currentSortOrder={2} onBack={vi.fn()} onAddItems={aggiungi} />);
    expect(screen.getByRole("checkbox", { name: "Includi montaggio nel preventivo" })).toBeChecked();
    expect(screen.getByText(/Verrà aggiunta una riga di montaggio collegata/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi al preventivo" }));
    const righe = aggiungi.mock.calls[0][0];
    expect(righe).toHaveLength(2);
    expect(righe[1].parent_temp_id).toBe(righe[0].client_temp_id);
    expect(righe[1].quote_item).toMatchObject({ tariffa_id: "posa", unit_price: 40, prezzo_acquisto: 20, sort_order: 3 });
  });
  it("se il collegamento quantità è spento aggiunge comunque la posa, come riga indipendente", () => {
    const aggiungi = vi.fn();
    render(<ArticleConfigurator item={{ ...item, posa_linked: false }} tariffe={[tariffa]} currentSortOrder={0} onBack={vi.fn()} onAddItems={aggiungi} />);
    expect(screen.getByRole("checkbox", { name: "Includi montaggio nel preventivo" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi al preventivo" }));
    expect(aggiungi.mock.calls[0][0]).toHaveLength(2);
    expect(aggiungi.mock.calls[0][0][1].parent_temp_id).toBeNull();
  });
  it("non salta silenziosamente una posa mancante o archiviata", () => {
    const aggiungi = vi.fn();
    render(<ArticleConfigurator item={item} tariffe={[{ ...tariffa, attivo: false }]} currentSortOrder={0} onBack={vi.fn()} onAddItems={aggiungi} />);
    expect(screen.getByRole("alert")).toHaveTextContent("non è disponibile o è inattiva");
    expect(screen.getByRole("button", { name: "Aggiungi al preventivo" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Includi montaggio nel preventivo" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi al preventivo" }));
    expect(aggiungi.mock.calls[0][0]).toHaveLength(1);
  });
  it("avvisa sul prezzo mancante senza copiare il costo d’acquisto", () => {
    const aggiungi = vi.fn();
    render(<ArticleConfigurator item={item} tariffe={[{ ...tariffa, prezzo_vendita: 0 }]} currentSortOrder={0} onBack={vi.fn()} onAddItems={aggiungi} />);
    expect(screen.getByRole("status")).toHaveTextContent("Prezzo cliente del montaggio da completare");
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi al preventivo" }));
    expect(aggiungi.mock.calls[0][0][1].quote_item).toMatchObject({ unit_price: 0, prezzo_acquisto: 20 });
  });
});
