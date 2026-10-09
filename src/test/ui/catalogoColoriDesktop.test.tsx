import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { finestraSalamander, COLORI_STANDARD, idColore } from "../fixtures/finestraSalamander";
import { CHIAVE_CATALOGO_COLORI, catalogoVuoto, chiaveColore } from "@/lib/serramenti/catalogoColori";
import { stessoColore } from "@/lib/serramenti/coloriDentroFuori";
import type { CatalogItemFamily } from "@/types/catalogItem";

const mock = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/hooks/useFamilyMutations", () => ({ useFamilyMutations: () => ({ saveColorCatalog: { mutateAsync: mock.save, isPending: false } }) }));
vi.mock("@tanstack/react-query", async orig => ({ ...await orig<typeof import("@tanstack/react-query")>(), useQuery: () => ({ data: [] as unknown[], isLoading: false, isError: false }) }));
vi.mock("@/hooks/useFamilyPricing", async orig => ({ ...await orig<typeof import("@/hooks/useFamilyPricing")>(), useFamilyGrid: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "demo" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { CatalogoColoriEditor } from "@/components/listino/CatalogoColoriEditor";
import { PaletteColore } from "@/components/serramenti/PaletteColore";
import { FamilyConfigurator } from "@/components/marketing/preventivi/configurators/FamilyConfigurator";
import { FamilyPricePreview } from "@/components/listino/FamilyPricePreview";

afterEach(() => { cleanup(); localStorage.clear(); });
beforeEach(() => { vi.clearAllMocks(); mock.save.mockResolvedValue("f2a"); });
const ids = idColore("f2a");
const family = () => finestraSalamander();
const matrix = () => ({ ...catalogoVuoto(), modalita: "combinazioni" as const, combinazioni: [{
  interno: chiaveColore(ids.bianco, null), esterno: chiaveColore(ids.standard, COLORI_STANDARD[0]), fasciaId: ids.unLato,
}] });
const item = (f = family()): CatalogItemFamily => ({ ...f, family: f, source: "family", modalita_prezzo: f.modalita_prezzo_base, ha_posa_automatica: false, posa_linked: false });

describe("catalogo colori desktop", () => {
  it("apre un pannello compatto, cerca per nome e salva solo il catalogo", async () => {
    render(<CatalogoColoriEditor family={family()} />);
    expect(screen.queryByLabelText("Cerca campione nel catalogo")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Colori e finiture/ }));
    fireEvent.change(screen.getByLabelText("Cerca campione nel catalogo"), { target: { value: "Bianco" } });
    fireEvent.change(screen.getByLabelText("Codice Bianco Bianco"), { target: { value: "BI-001" } });
    fireEvent.change(screen.getByLabelText("Finitura Bianco Bianco"), { target: { value: "Opaco" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva colori" }));
    await waitFor(() => expect(mock.save).toHaveBeenCalledOnce());
    const args = mock.save.mock.calls[0][0];
    expect(args.id).toBe("f2a");
    expect(args.expected).toBeNull();
    expect(args.catalogo.campioni[0]).toMatchObject({ codice: "BI-001", finitura: "Opaco", confermato: false });
    expect(args.patch).toBeUndefined();
  });
  it("non salva un campione HEX non valido", () => {
    render(<CatalogoColoriEditor family={family()} />);
    fireEvent.click(screen.getByRole("button", { name: /Colori e finiture/ }));
    fireEvent.change(screen.getByLabelText("Campione Bianco Bianco"), { target: { value: "rosso" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva colori" }));
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("mantiene la revisione iniziale della bozza anche se arrivano colori aggiornati", async () => {
    const { rerender } = render(<CatalogoColoriEditor family={family()} />);
    fireEvent.click(screen.getByRole("button", { name: /Colori e finiture/ }));
    fireEvent.change(screen.getByLabelText("Codice Bianco Bianco"), { target: { value: "MIA-BOZZA" } });
    rerender(<CatalogoColoriEditor family={finestraSalamander("f2a", { custom_field_values: { [CHIAVE_CATALOGO_COLORI]: catalogoVuoto() } })} />);
    fireEvent.click(screen.getByRole("button", { name: "Salva colori" }));
    await waitFor(() => expect(mock.save).toHaveBeenCalledOnce());
    expect(mock.save.mock.calls[0][0].expected).toBeNull();
  });
  it("Annulla ripristina anche la disponibilità per lato", () => {
    render(<CatalogoColoriEditor family={family()} />);
    fireEvent.click(screen.getByRole("button", { name: /Colori e finiture/ }));
    fireEvent.click(screen.getByLabelText("interno Bianco Bianco"));
    expect(screen.getByLabelText("interno Bianco Bianco")).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Annulla modifiche" }));
    expect(screen.getByLabelText("interno Bianco Bianco")).toBeChecked();
  });
  it("ricerca un campione per codice fornitore, senza proporre quello vietato sul lato", () => {
    const asse = family().axes[0];
    const catalogo = { ...catalogoVuoto(), campioni: [{ chiave: chiaveColore(ids.standard, COLORI_STANDARD[0]), codice: "NOCE21", finitura: "Spazzolato", hex: "#705432", lati: ["esterno"] as ("interno" | "esterno")[], attivo: true, confermato: true }] };
    const onChange = vi.fn();
    const props = { asse, catalogo, scelta: stessoColore(ids.bianco, null).interno, onChange };
    const { rerender } = render(<PaletteColore {...props} lato="esterno" />);
    fireEvent.click(screen.getByRole("button", { name: "Campioni colore esterno" }));
    fireEvent.change(screen.getByLabelText("Cerca colore esterno"), { target: { value: "NOCE21" } });
    fireEvent.click(screen.getByRole("button", { name: /Nussbaum/ }));
    expect(onChange).toHaveBeenCalledWith(ids.standard, COLORI_STANDARD[0]);
    rerender(<PaletteColore {...props} lato="interno" />);
    fireEvent.click(screen.getByRole("button", { name: "Campioni colore interno" }));
    fireEvent.change(screen.getByLabelText("Cerca colore interno"), { target: { value: "NOCE21" } });
    expect(screen.queryByRole("button", { name: /Nussbaum/ })).not.toBeInTheDocument();
  });
  it("il generico serializza i due lati e usa la tariffa bicolore del fornitore", () => {
    const f = finestraSalamander("f2a", { custom_field_values: { [CHIAVE_CATALOGO_COLORI]: matrix() } });
    const onAddItems = vi.fn();
    render(<FamilyConfigurator item={item(f)} tariffe={[]} currentSortOrder={0} onBack={vi.fn()} onAddItems={onAddItems} />);
    expect(screen.getByRole("button", { name: "Aggiungi al preventivo" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Campioni colore esterno" }));
    // La stessa voce può stare in due fasce: si sceglie quella Standard.
    fireEvent.click(screen.getAllByRole("button", { name: /Nussbaum/ })[0]);
    expect(screen.getByRole("button", { name: "Aggiungi al preventivo" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi al preventivo" }));
    const riga = onAddItems.mock.calls[0][0][0].quote_item;
    expect(riga.axis_selections.colore).toBe(ids.unLato);
    expect(JSON.parse(riga.axis_selections.__colore_esterno).valueId).toBe(ids.standard);
    expect(riga.description).toContain(COLORI_STANDARD[0]);
    expect(riga.unit_price).toBe(1128.96);
  });
  it("il simulatore propone gli stessi lati e non dichiara disponibile una combinazione mancante", () => {
    const f = finestraSalamander("f2a", { custom_field_values: { [CHIAVE_CATALOGO_COLORI]: matrix() } });
    render(<FamilyPricePreview family={f} />);
    expect(screen.getByRole("combobox", { name: "Colore interno" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Colore esterno" })).toBeInTheDocument();
    expect(screen.getAllByText(/Combinazione interno\/esterno da quotare/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Campioni colore esterno" }));
    fireEvent.click(screen.getAllByRole("button", { name: /Nussbaum/ })[0]);
    expect(screen.queryByText(/Combinazione interno\/esterno da quotare/)).not.toBeInTheDocument();
    expect(screen.getByText("Totale vendita (1 pz)").parentElement).toHaveTextContent("1.128,96");
  });
  it("un prodotto non serramento conserva una sola scelta colore", () => {
    const f = finestraSalamander("f2a", { vertical: "pavimenti", disegno_tipologia: null });
    render(<FamilyConfigurator item={item(f)} tariffe={[]} currentSortOrder={0} onBack={vi.fn()} onAddItems={vi.fn()} />);
    expect(screen.queryByRole("combobox", { name: "Colore interno" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Campioni colore esterno" })).not.toBeInTheDocument();
  });
});
