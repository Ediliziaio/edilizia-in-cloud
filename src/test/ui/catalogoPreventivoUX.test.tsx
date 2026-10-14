import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProductPicker } from "@/components/marketing/preventivi/ProductPicker";
import { AddItemDialog } from "@/components/marketing/preventivi/AddItemDialog";
import type { CatalogCategory, CatalogItem } from "@/types/catalogItem";
import type { TariffaPro } from "@/hooks/usePreventivoCosti";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import type { MacroListino } from "@/lib/listino/lineeListino";
const stato = vi.hoisted(() => ({
  items: [] as CatalogItem[],
  categorie: [] as CatalogCategory[],
  errore: null as null | Error,
  refetch: vi.fn(),
  macros: [] as MacroListino[],
  erroreAree: false,
}));
vi.mock("@/hooks/useCatalogAree", () => ({
  useCatalogAree: () => ({
    data: stato.macros,
    isError: stato.erroreAree,
    refetch: stato.refetch,
  }),
}));
vi.mock("@/hooks/useCatalogItems", () => ({
  useCatalogItems: () => ({
    items: stato.items,
    isLoading: false,
    error: stato.errore,
    refetch: stato.refetch,
  }),
}));
vi.mock("@/hooks/useCatalogCategories", () => ({
  useCatalogCategories: () => ({
    data: stato.categorie,
    refetch: stato.refetch,
  }),
}));
vi.mock(
  "@/components/marketing/preventivi/configurators/ProductConfigurator",
  () => ({
    ProductConfigurator: ({ onBack }: { onBack: () => void }) => (
      <button onClick={onBack}>Torna al catalogo</button>
    ),
  }),
);
const tariffa: TariffaPro = {
  id: "t1",
  nome: "Posa pavimento",
  tipo: "posa",
  descrizione: "Posa e sigillatura, esclusi materiali",
  prezzo_vendita: 35,
  prezzo_costo: 20,
  unita: "mq",
  unita_fatturazione: "mq",
};
function prodotto(id: string, categoria: string | null = "alu"): CatalogItem {
  return {
    id,
    source: "family",
    nome: "Finestra 1 Anta",
    categoria_id: categoria,
    prezzo_base_vendita: 0,
    modalita_prezzo: "mq",
    family: { codice: id, axes: [] },
  } as CatalogItem;
}
beforeEach(() => {
  stato.items = [
    prodotto("ALU-01"),
    prodotto("SAL-01", "sal"),
    prodotto("ALTRO", null),
  ];
  stato.categorie = [
    { id: "alu", nome: "PVC Aluplast" },
    { id: "sal", nome: "PVC Salamander" },
  ] as CatalogCategory[];
  stato.errore = null;
  stato.macros = [];
  stato.erroreAree = false;
  stato.refetch.mockClear();
});
afterEach(cleanup);
function catalogo() {
  const onSelect = vi.fn();
  render(
    <MemoryRouter>
      <ProductPicker onSelectItem={onSelect} />
    </MemoryRouter>,
  );
  return onSelect;
}
function dialogo(extra: Record<string, unknown> = {}) {
  const onAddTariffa = vi.fn();
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <AddItemDialog
        open
        onClose={onClose}
        tariffe={[tariffa]}
        currentSortOrder={0}
        onAddItems={vi.fn()}
        onAddTariffa={onAddTariffa}
        {...extra}
      />
    </MemoryRouter>,
  );
  return { onAddTariffa, onClose };
}
describe("Catalogo prodotti nel preventivo", () => {
  it("rende leggibili linea, codice e prezzo mancante dei prodotti omonimi", () => {
    catalogo();
    const riga = screen.getByRole("button", {
      name: /Finestra 1 Anta PVC Salamander SAL-01/,
    });
    expect(riga).toHaveTextContent("Prezzo da completare");
    expect(riga).not.toHaveTextContent("0,00");
    fireEvent.click(screen.getByRole("button", { name: "PVC Salamander 1" }));
    expect(screen.getByRole("status")).toHaveTextContent("1 prodotto");
    expect(
      screen.queryByRole("button", {
        name: /Finestra 1 Anta PVC Aluplast ALU-01/,
      }),
    ).toBeNull();
  });
  it("trova il prodotto tramite linea e conserva l'identità quando apre la configurazione", () => {
    const onSelect = catalogo();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Cerca nel catalogo prodotti" }),
      { target: { value: "finestra salamander" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Finestra 1 Anta PVC Salamander/ }),
    );
    expect(onSelect).toHaveBeenCalledWith(stato.items[1], "PVC Salamander");
  });
  it("rende raggiungibili anche i prodotti senza categoria", () => {
    catalogo();
    fireEvent.click(screen.getByRole("button", { name: "Altri prodotti 1" }));
    expect(screen.getByRole("status")).toHaveTextContent("1 prodotto");
    expect(
      screen.getByRole("button", { name: /Finestra 1 Anta ALTRO/ }),
    ).toBeInTheDocument();
  });
  it("la navigazione raggiunge anche i prodotti dopo la prima pagina", () => {
    stato.items = Array.from({ length: 31 }, (_, i) => ({
      ...prodotto(`P-${i}`),
      nome: `Prodotto ${i}`,
    }));
    catalogo();
    fireEvent.click(
      screen.getByRole("button", { name: "Prodotti successivi" }),
    );
    expect(
      screen.getByRole("button", { name: /Prodotto 30/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("31–31 di 31")).toBeInTheDocument();
  });
  it("distingue un errore da un catalogo vuoto e offre Riprova", () => {
    stato.errore = new Error("Connessione interrotta");
    catalogo();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Il catalogo non è disponibile",
    );
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(stato.refetch).toHaveBeenCalledOnce();
  });
});
describe("Prodotti e servizi nello stesso flusso", () => {
  it("conserva la ricerca cambiando scheda e distingue il prodotto anche nella configurazione", () => {
    dialogo();
    const ricerca = screen.getByRole("textbox", {
      name: "Cerca nel catalogo prodotti",
    });
    fireEvent.change(ricerca, { target: { value: "Salamander" } });
    fireEvent.click(screen.getByRole("tab", { name: /Manodopera e servizi/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Prodotti" }));
    expect(
      screen.getByRole("textbox", { name: "Cerca nel catalogo prodotti" }),
    ).toHaveValue("Salamander");
    fireEvent.click(
      screen.getByRole("button", { name: /Finestra 1 Anta PVC Salamander/ }),
    );
    expect(screen.getByText(/PVC Salamander · Configura/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Torna al catalogo" }));
    expect(
      screen.getByRole("textbox", { name: "Cerca nel catalogo prodotti" }),
    ).toHaveValue("Salamander");
  });
  it("aggiunge più servizi con quantità e totale verificati, senza chiudere il catalogo", () => {
    const api = dialogo({ initialTab: "servizi" });
    fireEvent.click(screen.getByRole("button", { name: /Posa pavimento/ }));
    expect(api.onAddTariffa).not.toHaveBeenCalled();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Quantità servizio" }),
      { target: { value: "12,5" } },
    );
    const dettagli = screen.getByRole("complementary", {
      name: "Dettagli del servizio",
    });
    expect(dettagli).toHaveTextContent("437,50");
    expect(dettagli).toHaveTextContent("esclusi materiali");
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi servizio" }));
    expect(api.onAddTariffa).toHaveBeenCalledWith(tariffa, 12.5);
    expect(api.onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Posa pavimento/ }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi servizio" }));
    expect(api.onAddTariffa).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/2 voci inserite/)).toBeInTheDocument();
  });
  it("blocca quantità zero o invalide", () => {
    dialogo({ initialTab: "servizi" });
    fireEvent.click(screen.getByRole("button", { name: /Posa pavimento/ }));
    for (const value of ["0", "-1", "abc"]) {
      fireEvent.change(
        screen.getByRole("textbox", { name: "Quantità servizio" }),
        { target: { value } },
      );
      expect(
        screen.getByRole("button", { name: "Aggiungi servizio" }),
      ).toBeDisabled();
    }
  });
  it("una tariffa a corpo usa un intervento, con importo fisso", () => {
    const t = { ...tariffa, unita: "fisso", unita_fatturazione: "a_corpo" };
    const api = dialogo({ initialTab: "servizi", tariffe: [t] });
    fireEvent.click(screen.getByRole("button", { name: /Posa pavimento/ }));
    expect(
      screen.getByRole("textbox", { name: "Quantità servizio" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi servizio" }));
    expect(api.onAddTariffa).toHaveBeenCalledWith(t, 1);
  });
  it("mantiene distanza e prezzo specifici del preventivo nella selezione del servizio", () => {
    const t = {
      ...tariffa,
      tipo: "trasporto",
      unita: "km",
      unita_fatturazione: "km",
    };
    const api = dialogo({
      initialTab: "servizi",
      tariffe: [t],
      quantitaInizialeTariffa: () => 45,
      prezzoUnitarioTariffa: () => 0.8,
    });
    fireEvent.click(screen.getByRole("button", { name: /Posa pavimento/ }));
    const dettagli = screen.getByRole("complementary", {
      name: "Dettagli del servizio",
    });
    expect(dettagli).toHaveTextContent("36,00");
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi servizio" }));
    expect(api.onAddTariffa).toHaveBeenCalledWith(t, 45);
  });
  it("le schede sono utilizzabili anche con i tasti freccia", () => {
    dialogo();
    const prodotti = screen.getByRole("tab", { name: "Prodotti" });
    fireEvent.keyDown(prodotti, { key: "ArrowRight" });
    expect(
      screen.getByRole("tab", { name: /Manodopera e servizi/ }),
    ).toHaveAttribute("aria-selected", "true");
  });
});

describe("Aree condivise fra prodotti e servizi", () => {
  function preparaAree() {
    stato.categorie[0].macrocategoria_id = "serramenti";
    stato.categorie[1].macrocategoria_id = "bagni";
    stato.macros = [
      {
        id: "serramenti",
        nome: "Infissi",
        verticali_abilitati: ["serramentista"],
      },
      { id: "bagni", nome: "Bagno", verticali_abilitati: ["bagno"] },
    ];
    return [
      { ...tariffa, vertical_associato: "bagno" },
      {
        ...tariffa,
        id: "infissi",
        nome: "Posa infissi",
        vertical_associato: "serramenti",
      },
      {
        ...tariffa,
        id: "trasporto",
        nome: "Trasporto comune",
        tipo: "trasporto",
        vertical_associato: null,
      },
    ];
  }
  it("conserva l'area anche chiudendo e riaprendo il catalogo dalla scheda servizi", () => {
    const tariffe = preparaAree();
    function Harness() {
      const [open, setOpen] = useState(true);
      const [tab, setTab] = useState<"prodotti" | "servizi">("prodotti");
      return (
        <>
          <button
            onClick={() => {
              setTab("servizi");
              setOpen(true);
            }}
          >
            Apri servizi
          </button>
          <AddItemDialog
            open={open}
            initialTab={tab}
            onClose={() => setOpen(false)}
            tariffe={tariffe}
            currentSortOrder={0}
            onAddItems={vi.fn()}
            onAddTariffa={vi.fn()}
          />
        </>
      );
    }
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Area di lavoro" }), {
      target: { value: "area:bagni" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Torna al preventivo" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Apri servizi" }));
    expect(
      screen.getByRole("button", { name: "Bagni: 1 prodotto · 1 servizio" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("tab", { name: /Manodopera e servizi/ }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("button", { name: /Posa infissi/ })).toBeNull();
  });
  it("mantiene l'area al cambio scheda e dopo l'aggiunta, senza perdere la ricerca prodotti", () => {
    const tariffe = preparaAree();
    const api = dialogo({ tariffe });
    fireEvent.click(
      screen.getByRole("button", { name: "Bagni: 1 prodotto · 1 servizio" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Cerca nel catalogo prodotti" }),
      { target: { value: "Salamander" } },
    );
    expect(
      screen.queryByRole("button", { name: /Finestra 1 Anta PVC Aluplast/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /Manodopera e servizi/ }));
    expect(screen.queryByRole("button", { name: /Posa infissi/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /Trasporto comune/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Posa pavimento/ }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Quantità servizio" }),
      { target: { value: "2,5" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi servizio" }));
    expect(api.onAddTariffa).toHaveBeenCalledWith(tariffe[0], 2.5);
    expect(
      screen.getByRole("button", { name: "Bagni: 1 prodotto · 1 servizio" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Prodotti" }));
    expect(
      screen.getByRole("textbox", { name: "Cerca nel catalogo prodotti" }),
    ).toHaveValue("Salamander");
  });
  it("esclude le voci comuni su richiesta e rimuove un servizio selezionato fuori dall'area", () => {
    dialogo({ tariffe: preparaAree(), initialTab: "servizi" });
    fireEvent.click(
      screen.getByRole("button", { name: "Bagni: 1 prodotto · 1 servizio" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Trasporto comune/ }));
    expect(
      screen.getByRole("button", { name: "Aggiungi servizio" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Includi voci comuni" }),
    );
    expect(
      screen.queryByRole("button", { name: /Trasporto comune/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Aggiungi servizio" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Comuni / senza area: 1 prodotto · 1 servizio",
      }),
    );
    expect(
      screen.getByRole("button", { name: /Trasporto comune/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Posa pavimento/ })).toBeNull();
  });
  it("rende navigabili le categorie testuali dei vecchi articoli", () => {
    stato.items = [
      {
        source: "article",
        id: "doccia",
        nome: "Box cristallo",
        categoria_id: null,
        modalita_prezzo: "pz",
        prezzo_base_vendita: 150,
        article: { category: "Doccia" },
      },
    ] as CatalogItem[];
    dialogo();
    fireEvent.click(
      screen.getByRole("button", { name: "Bagni: 1 prodotto · 0 servizi" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Doccia 1" }));
    expect(
      screen.getByRole("button", { name: /Box cristallo Doccia/ }),
    ).toBeInTheDocument();
  });
  it("offre il catalogo completo e un tentativo di recupero se le aree non si caricano", () => {
    stato.erroreAree = true;
    dialogo({ tariffe: preparaAree() });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Organizzazione per area non disponibile",
    );
    expect(
      screen.getByRole("button", { name: /Finestra 1 Anta PVC Aluplast/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Bagni: 1 prodotto · 1 servizio" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Riprova aree" }));
    expect(stato.refetch).toHaveBeenCalledTimes(2);
  });
});
