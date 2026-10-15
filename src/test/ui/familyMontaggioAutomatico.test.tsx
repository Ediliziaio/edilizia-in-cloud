import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CatalogItemFamily } from "@/types/catalogItem";
import type { TariffaPro } from "@/hooks/usePreventivoCosti";
vi.mock("@/hooks/useFamilyPricing", () => ({ useFamilyGrid: () => ({ data: [] }), cellaGriglia: () => null, calcolaPrezzoFamiglia: () => ({ unit_price_vendita: 100, unit_price_acquisto: 40, totale_vendita: 100, warnings: [], fuori_listino: false, calcolo_disponibile: true }) }));
vi.mock("@/hooks/useColoriFamiglia", () => ({ useColoriFamiglia: () => ({ selezione: {}, testi: null }) }));
vi.mock("@/lib/serramenti/disegnoDaFamiglia", () => ({ disegnoDaFamiglia: () => null, haDisegno: () => false, configDaFamiglia: () => null, disegnoDaConfig: () => null }));
import { FamilyConfigurator } from "@/components/marketing/preventivi/configurators/FamilyConfigurator";
const item = { source: "family", id: "family", nome: "Porta", modalita_prezzo: "pz", ha_posa_automatica: true, posa_linked: true, family: { id: "family", nome: "Porta", axes: [], modalita_prezzo_base: "pz", prezzo_base_mode: "vendita", prezzo_base_vendita: 100, prezzo_base_acquisto: 40, vat_rate: 22, unit_of_measure: "pz", manodopera_modalita: "tariffa", posa_tariffa_default_id: "posa", posa_quantita_default: 2 } } as CatalogItemFamily;
const tariffa = { id: "posa", nome: "Montaggio porta", tipo: "posa", prezzo_vendita: 30, prezzo_costo: 12, unita: "h", unita_fatturazione: "h" } as TariffaPro;
afterEach(cleanup);
describe("Manodopera collegata alle famiglie", () => {
  it("crea la posa prevista con quantità per prodotto e collegamento padre-figlio", () => {
    const aggiungi = vi.fn();
    render(<FamilyConfigurator item={item} tariffe={[tariffa]} currentSortOrder={0} onBack={vi.fn()} onAddItems={aggiungi} />);
    expect(screen.getByRole("checkbox", { name: "Includi manodopera nel preventivo" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi al preventivo" }));
    const righe = aggiungi.mock.calls[0][0];
    expect(righe).toHaveLength(2);
    expect(righe[1].quote_item).toMatchObject({ quantity: 2, unit_price: 30, prezzo_acquisto: 12, tariffa_id: "posa" });
    expect(righe[1].parent_temp_id).toBe(righe[0].client_temp_id);
  });
  it("non dimentica la manodopera manuale quando prezzi e costi devono ancora essere compilati", () => {
    const aggiungi = vi.fn();
    const manuale = { ...item, ha_posa_automatica: false, family: { ...item.family, manodopera_modalita: "manuale", manodopera_prezzo_vendita: 0, manodopera_costo_acquisto: 0, manodopera_unita: "h" } } as CatalogItemFamily;
    render(<FamilyConfigurator item={manuale} tariffe={[]} currentSortOrder={0} onBack={vi.fn()} onAddItems={aggiungi} />);
    expect(screen.getByRole("checkbox", { name: "Includi manodopera nel preventivo" })).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("Prezzo cliente della manodopera da completare");
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi al preventivo" }));
    expect(aggiungi.mock.calls[0][0]).toHaveLength(2);
    expect(aggiungi.mock.calls[0][0][1].quote_item.unit_price).toBe(0);
  });
  it("avvisa e non omette silenziosamente una tariffa non disponibile", () => {
    render(<FamilyConfigurator item={item} tariffe={[]} currentSortOrder={0} onBack={vi.fn()} onAddItems={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("La tariffa collegata non è disponibile");
    expect(screen.getByRole("button", { name: "Aggiungi al preventivo" })).toBeDisabled();
  });
});
