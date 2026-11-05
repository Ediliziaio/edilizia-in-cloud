import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import { AddItemDialog } from "@/components/marketing/preventivi/AddItemDialog";
import { areaDaTipoLavoro } from "@/lib/preventivi/areeCatalogoPreventivo";
import { descrizioneCommerciale } from "@/lib/preventivi/configurazioneSemplice";
import { voceDaProdotto } from "@/lib/preventivi/riepilogoAggiunte";
import type { CatalogItem, ConfiguredItem } from "@/types/catalogItem";
import type { QuoteItemPro } from "@/types/quoteItem";

const articolo = {
  id: "a1",
  source: "article",
  nome: "Vetrata su misura",
  categoria_id: null,
  prezzo_base_vendita: 100,
  modalita_prezzo: "mq",
  unit_of_measure: "mq",
  article: {
    id: "a1",
    name: "Vetrata su misura",
    prezzo_vendita: 100,
    prezzo_acquisto_netto: 50,
    unit_of_measure: "mq",
    vat_rate: 22,
    category: "Doccia",
    description: "Vetrata",
  },
} as unknown as CatalogItem;
const senzaPrezzo = {
  ...articolo,
  id: "a2",
  nome: "Parete a misura",
  prezzo_base_vendita: 0,
  article: { ...(articolo as never as { article: object }).article, id: "a2", name: "Parete a misura", prezzo_vendita: 0, category: "Serramenti" },
} as unknown as CatalogItem;
const stato = vi.hoisted(() => ({ items: [] as unknown[], macros: [] as unknown[] }));
vi.mock("@/hooks/useCatalogAree", () => ({
  useCatalogAree: () => ({ data: stato.macros, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/hooks/useCatalogItems", () => ({
  useCatalogItems: () => ({ items: stato.items, isLoading: false, error: null as Error | null, refetch: vi.fn() }),
}));
vi.mock("@/hooks/useCatalogCategories", () => ({
  useCatalogCategories: () => ({ data: [] as unknown[], refetch: vi.fn() }),
}));

function apri(extra: Record<string, unknown> = {}) {
  const ricevuti: ConfiguredItem[][] = [];
  const chiudi = vi.fn();
  function Harness() {
    const [righe, setRighe] = useState<ConfiguredItem[]>([]);
    return (
      <AddItemDialog
        open
        onClose={chiudi}
        tariffe={[]}
        currentSortOrder={righe.length}
        onAddItems={(c) => {
          ricevuti.push(c);
          setRighe((p) => [...p, ...c]);
        }}
        {...extra}
        existingItems={[...((extra.existingItems as QuoteItemPro[]) ?? []), ...righe.map((r) => r.quote_item)]}
      />
    );
  }
  render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>,
  );
  return { ricevuti, chiudi };
}
const scrivi = (etichetta: string, value: string) =>
  fireEvent.change(screen.getByLabelText(etichetta), { target: { value } });

beforeEach(() => {
  localStorage.clear();
  stato.items = [articolo, senzaPrezzo];
  stato.macros = [];
});
afterEach(cleanup);

describe("Popup prodotti del preventivo", () => {
  it("duplica: aggiunge il pezzo, resta sul prodotto e riparte dalle misure con quantità 1", () => {
    const { ricevuti, chiudi } = apri();
    fireEvent.click(screen.getByRole("button", { name: /Vetrata su misura/ }));
    scrivi("Larghezza (mm)", "2000");
    scrivi("Altezza (mm)", "1000");
    scrivi("Quantità", "3");
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi e duplica con altre misure" }));
    expect(ricevuti).toHaveLength(1);
    expect(ricevuti[0][0].quote_item).toMatchObject({ misura_x: 2000, quantity: 3, unit_price: 200 });
    expect(chiudi).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Quantità")).toHaveValue(1);
    const larghezza = screen.getByLabelText("Larghezza (mm)");
    expect(larghezza).toHaveValue(2000);
    expect(document.activeElement).toBe(larghezza);
    expect(screen.getByText(/scrivi le misure del prossimo pezzo/)).toBeInTheDocument();
  });

  it("il riepilogo elenca misure, quantità e importi di ciò che è stato aggiunto", () => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: /Vetrata su misura/ }));
    scrivi("Larghezza (mm)", "2000");
    scrivi("Altezza (mm)", "1000");
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi e duplica con altre misure" }));
    scrivi("Larghezza (mm)", "1000");
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi e scegli un altro" }));
    expect(screen.getByText(/2 voci inserite/)).toBeInTheDocument();
    expect(screen.getByText("Vetrata su misura · 2000×1000 mm · 1 mq")).toBeInTheDocument();
    expect(screen.getByText("Vetrata su misura · 1000×1000 mm · 1 mq")).toBeInTheDocument();
    expect(screen.getByText(/Vedi cosa hai aggiunto/)).toHaveTextContent("300,00");
  });

  it("stesse misure e stesse scelte: l'avviso resta anche duplicando", () => {
    const { ricevuti } = apri();
    fireEvent.click(screen.getByRole("button", { name: /Vetrata su misura/ }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi e duplica con altre misure" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi e duplica con altre misure" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Prodotto già presente");
    expect(ricevuti).toHaveLength(1);
  });

  describe("manodopera non collegata al prodotto", () => {
    const tariffa = { id: "t1", nome: "Posa", tipo: "posa", prezzo_vendita: 30, prezzo_costo: 10, unita: "h", attivo: true };
    const conPosa = { ...articolo, ha_montaggio_automatico: true, posa_linked: false, article: { ...(articolo as never as { article: object }).article, montaggio_tariffa_id: "t1" } };
    it("i pezzi duplicati hanno ciascuno la propria: nessun falso avviso, fino all'ultimo", () => {
      stato.items = [conPosa];
      const { ricevuti } = apri({ tariffe: [tariffa] });
      fireEvent.click(screen.getByRole("button", { name: /Vetrata su misura/ }));
      fireEvent.click(screen.getByRole("button", { name: "Aggiungi e duplica con altre misure" }));
      scrivi("Larghezza (mm)", "1500");
      fireEvent.click(screen.getByRole("button", { name: "Aggiungi e duplica con altre misure" }));
      scrivi("Larghezza (mm)", "1700");
      fireEvent.click(screen.getByRole("button", { name: "Aggiungi e scegli un altro" }));
      expect(screen.queryByRole("alert")).toBeNull();
      expect(ricevuti).toHaveLength(3);
    });
    it("se la stessa manodopera era già nel preventivo l'avviso resta, anche duplicando", () => {
      stato.items = [conPosa];
      const { ricevuti } = apri({
        tariffe: [tariffa],
        existingItems: [{ item_type: "service", item_category: "posa", name: "Posa", tariffa_id: "t1", quantity: 1, unit_of_measure: "h" }],
      });
      fireEvent.click(screen.getByRole("button", { name: /Vetrata su misura/ }));
      fireEvent.click(screen.getByRole("button", { name: "Aggiungi e duplica con altre misure" }));
      expect(screen.getByRole("alert")).toHaveTextContent("Possibile doppia voce");
      expect(ricevuti).toHaveLength(0);
    });
  });

  it("se nell'area non c'è, la ricerca si allarga a tutte le aree senza perdere ciò che è scritto", () => {
    stato.items = [
      articolo,
      { ...senzaPrezzo, article: { ...(senzaPrezzo as never as { article: object }).article, category: "Serramenti" } },
    ];
    apri({ areaSuggerita: "area:bagni" });
    const area = screen.getByRole("combobox", { name: "Area di lavoro" });
    expect(area).toHaveValue("area:bagni");
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca nel catalogo prodotti" }), { target: { value: "Parete" } });
    expect(screen.queryByRole("button", { name: /Parete a misura/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cerca in tutte le aree" }));
    expect(area).toHaveValue("all");
    expect(screen.getByRole("textbox", { name: "Cerca nel catalogo prodotti" })).toHaveValue("Parete");
    expect(screen.getByRole("button", { name: /Parete a misura/ })).toBeInTheDocument();
  });

  it("tornando dalla configurazione l'elenco riparte dal punto in cui era", () => {
    stato.items = Array.from({ length: 40 }, (_, i) => ({ ...(articolo as object), id: `p${i}`, nome: `Prodotto ${i}` }));
    apri();
    const lista = screen.getByLabelText("Prodotti del catalogo");
    Object.defineProperty(lista, "clientHeight", { configurable: true, value: 300 });
    lista.scrollTop = 500;
    fireEvent.scroll(lista);
    fireEvent.click(screen.getByRole("button", { name: /Prodotto 3\b/ }));
    lista.scrollTop = 0; // Quello che fa il browser quando l'elenco si nasconde.
    fireEvent.click(screen.getByRole("button", { name: "Cambia prodotto" }));
    expect(lista.scrollTop).toBe(500);
  });

  it("senza prezzo lo dice accanto al totale, senza mostrare zero come prezzo", () => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: /Parete a misura/ }));
    const riepilogo = screen.getByRole("complementary", { name: "Riepilogo del prodotto" });
    expect(riepilogo).toHaveTextContent("Prezzo non impostato nel listino");
    expect(riepilogo).toHaveTextContent("Da completare");
    expect(riepilogo).not.toHaveTextContent("0,00");
  });

  it("si apre sull'area del lavoro, altrimenti sull'ultima usata, e la scelta a mano vince", () => {
    const area = () => screen.getByRole("combobox", { name: "Area di lavoro" });
    const primo = apri();
    expect(area()).toHaveValue("all");
    fireEvent.change(area(), { target: { value: "area:bagni" } });
    cleanup();
    apri();
    expect(area()).toHaveValue("area:bagni");
    cleanup();
    apri({ areaSuggerita: "area:serramenti" });
    expect(area()).toHaveValue("area:serramenti");
    fireEvent.change(area(), { target: { value: "all" } });
    expect(area()).toHaveValue("all");
    expect(primo.ricevuti).toHaveLength(0);
  });

  it("un'area che l'azienda non ha torna a tutte le aree", () => {
    localStorage.setItem("eic.preventivo.ultimaArea", "area:fotovoltaico");
    apri();
    expect(screen.getByRole("combobox", { name: "Area di lavoro" })).toHaveValue("all");
  });

  it("riconosce il tipo di lavoro solo se è una categoria nota", () => {
    expect(areaDaTipoLavoro("Serramenti")).toBe("area:serramenti");
    expect(areaDaTipoLavoro("")).toBeNull();
    expect(areaDaTipoLavoro("Cose varie")).toBeNull();
  });

  it("la nota dei prodotti di partenza non arriva al cliente", () => {
    expect(
      descrizioneCommerciale("Fornitura di scossalina. Base da personalizzare, non offerta commerciale."),
    ).toBe("Fornitura di scossalina.");
  });

  it("il prodotto con la manodopera è una voce sola con l'importo sommato", () => {
    const riga = (quote_item: object) => ({ client_temp_id: "x", parent_temp_id: null, quote_item }) as ConfiguredItem;
    expect(
      voceDaProdotto([
        riga({ name: "Finestra", misura_x: 1200, misura_y: 1400, quantity: 2, unit_of_measure: "pz", unit_price: 100, discount_percent: 0 }),
        riga({ name: "Manodopera", quantity: 2, unit_of_measure: "h", unit_price: 30, discount_percent: 0 }),
      ]),
    ).toEqual({ nome: "Finestra", dettaglio: "1200×1400 mm · 2 pz", importo: 260 });
  });
});
