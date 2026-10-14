// src/test/ui/modelliPagamentoPagina.test.tsx
// Impostazioni → Modelli di pagamento, con i componenti veri: le sezioni e i loro indirizzi, la sola lettura onesta,
// la finestra del modello che non perde il lavoro, l'eliminazione che aspetta l'esito.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  modelliPagamentoDaOffrire,
  type ModelloPagamento,
  type RataModello,
} from "@/lib/orders/modelliPagamento";

const state = vi.hoisted(() => ({
  role: "company_admin",
  modifica: false,
  caricamentoPermessi: false,
  modelli: [] as unknown[],
  inizializzati: true,
  predefinito: null as string | null,
  disponibile: true,
  elimina: vi.fn(),
  salva: vi.fn(),
  impostazioni: vi.fn(),
  inizializza: vi.fn(),
  salPending: false,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/confirm-dialog",()=>({useConfirm:()=>async()=>true}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ role: state.role }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    isLoading: state.caricamentoPermessi,
    canEditSettingsOrders: state.modifica,
  }),
}));
vi.mock("@/hooks/useModelliPagamento", () => ({
  useModelliPagamento: () => ({
    modelli: state.modelli,
    offerti: modelliPagamentoDaOffrire(
      state.inizializzati,
      state.modelli as ModelloPagamento[],
    ),
    inizializzati: state.inizializzati,
    predefinito: state.predefinito,
    salMatura: "emesso",
    disponibile: state.disponibile,
    isLoading: false,
    refetch: vi.fn(),
    salva: { mutate: state.salva, isPending: false },
    elimina: { mutate: state.elimina, isPending: false },
    inizializza: {
      mutate: state.inizializza,
      isPending: false,
      isError: false,
    },
    impostazioni: { mutate: state.impostazioni, isPending: state.salPending },
  }),
}));

import SettingsModelliPagamento from "@/pages/azienda/settings/SettingsModelliPagamento";

const rata = (
  nome: string,
  percent: number,
  tipo: RataModello["tipo"],
  evento: RataModello["evento"],
  numero: number | null = null,
): RataModello => ({ nome, percent, tipo, evento, numero, preavviso: 7 });
const mio: ModelloPagamento = {
  id: "m1",
  origine: "azienda",
  nome: "Tre rate",
  descrizione: "",
  righe: [
    rata("Alla firma", 30, "deposit", "firma_contratto"),
    rata("SAL 1", 40, "deposit", "sal_numero", 1),
    rata("Saldo", 30, "balance", "fine_lavori"),
  ],
};
const senzaSal: ModelloPagamento = {
  id: "m2",
  origine: "azienda",
  nome: "Due rate",
  descrizione: "",
  righe: [
    rata("Acconto", 50, "deposit", "firma_contratto"),
    rata("Saldo", 50, "balance", "fine_lavori"),
  ],
};

const apri = (percorso = "/azienda/impostazioni/modelli-pagamento") =>
  render(
    <MemoryRouter initialEntries={[percorso]}>
      <SettingsModelliPagamento />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    role: "company_admin",
    modifica: false,
    caricamentoPermessi: false,
    modelli: [mio, senzaSal],
    inizializzati: true,
    predefinito: null,
    disponibile: true,
  });
  state.salPending = false;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Modelli di pagamento: le sezioni", () => {
  it("nessun titolo di primo livello; due sezioni di secondo livello, i modelli per primi", () => {
    apri();
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["Come si paga", "Quando matura la rata di un SAL"]);
  });

  it("la regola del SAL dice che vale per tutte le commesse, senza parlare del database", () => {
    apri();
    const sal = document.getElementById("sal") as HTMLElement;
    expect(within(sal).getByText("Tutte le commesse")).toBeInTheDocument();
    expect(within(sal).getByRole("status")).toHaveTextContent("Salvataggio con conferma");
    expect(sal).toHaveTextContent(
      "La scelta vale per tutte le commesse dell'azienda, anche per quelle già aperte.",
    );
    expect(sal.textContent).not.toMatch(/database/i);
    expect(
      screen.getByRole("radiogroup", {
        name: "Quando matura la rata di un SAL",
      }),
    ).toBeInTheDocument();
  });

  it.each(["modelli", "sal"])(
    "l'indirizzo con #%s evidenzia la sezione giusta e nessun'altra",
    (ancora) => {
      apri(`/azienda/impostazioni/modelli-pagamento#${ancora}`);
      expect(
        Array.from(document.querySelectorAll("[data-evidenziata='true']")).map(
          (e) => e.id,
        ),
      ).toEqual([ancora]);
    },
  );

  it("l'indice in cima porta alla regola del SAL", () => {
    apri();
    fireEvent.click(screen.getByRole("link", { name: "Quando matura un SAL" }));
    expect(
      (document.getElementById("sal") as HTMLElement).getAttribute(
        "data-evidenziata",
      ),
    ).toBe("true");
  });

  it("la stella ha un nome anche passandoci sopra, e si spiega con la frase della sezione", () => {
    apri();
    expect(
      screen.getByRole("button", {
        name: "Usa Tre rate per le commesse nuove",
      }),
    ).toHaveAttribute("title", "Usa per le commesse nuove");
    expect(
      screen.getByText(
        /Con la stella scegli quello con cui partono le commesse nuove/,
      ),
    ).toBeInTheDocument();
  });
});

describe("Modelli di pagamento: sola lettura onesta", () => {
  it("chi non modifica vede la frase giusta, la regola del SAL spenta e nessun comando di scrittura", () => {
    state.role = "staff";
    apri();
    expect(
      screen.getByText(
        /Stai consultando queste impostazioni: le cambia chi ha «Configurazione Ordini» in modifica\./,
      ),
    ).toBeInTheDocument();
    for (const radio of screen.getAllByRole("radio"))
      expect(radio).toBeDisabled();
    for (const nome of [
      "Nuovo modello",
      "Modifica Tre rate",
      "Elimina Tre rate",
      "Importa modelli standard",
    ]) {
      expect(screen.queryByRole("button", { name: nome })).toBeNull();
    }
  });
  it("chi non è amministratore ma ha «Configurazione Ordini» in modifica può cambiare", () => {
    state.role = "staff";
    state.modifica = true;
    apri();
    expect(
      screen.queryByText(/Stai consultando queste impostazioni/),
    ).toBeNull();
    for (const radio of screen.getAllByRole("radio"))
      expect(radio).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Nuovo modello" }),
    ).toBeInTheDocument();
  });
  it("mentre i permessi si caricano non dice niente", () => {
    state.role = "staff";
    state.caricamentoPermessi = true;
    apri();
    expect(
      screen.queryByText(/Stai consultando queste impostazioni/),
    ).toBeNull();
  });
});

describe("Modelli di pagamento: la finestra del modello", () => {
  const apriNuovo = () => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Nuovo modello" }));
    return screen.getByRole("dialog");
  };

  it("con modifiche, «Annulla» chiede conferma; se non si conferma la finestra resta con quello che si è scritto", () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    const dialogo = apriNuovo();
    fireEvent.change(within(dialogo).getByLabelText("Nome del modello"), {
      target: { value: "Il mio piano" },
    });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Annulla" }));
    expect(conferma).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getByLabelText("Nome del modello"),
    ).toHaveValue("Il mio piano");
  });

  it("se si conferma la finestra si chiude", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const dialogo = apriNuovo();
    fireEvent.change(within(dialogo).getByLabelText("Nome del modello"), {
      target: { value: "Il mio piano" },
    });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Annulla" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("senza modifiche si chiude subito, senza chiedere", () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    const dialogo = apriNuovo();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Annulla" }));
    expect(conferma).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Esc con modifiche chiede conferma come «Annulla»", () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    const dialogo = apriNuovo();
    fireEvent.change(within(dialogo).getByLabelText("Nome del modello"), {
      target: { value: "Il mio piano" },
    });
    fireEvent.keyDown(dialogo, { key: "Escape" });
    expect(conferma).toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("una rata «al SAL» rimanda a dove si sceglie quando matura; senza SAL la nota non c'è", () => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Modifica Due rate" }));
    expect(screen.queryByText(/Quando matura il SAL/)).toBeNull();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Annulla",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Modifica Tre rate" }));
    expect(
      within(screen.getByRole("dialog")).getByText(
        /lo scegli nella sezione «Quando matura la rata di un SAL»/,
      ),
    ).toBeInTheDocument();
  });
});

describe("Modelli di pagamento: eliminare", () => {
  it("la conferma resta aperta finché l'eliminazione non è riuscita", () => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Elimina Tre rate" }));
    fireEvent.click(screen.getByRole("button", { name: "Elimina il modello" }));
    expect(state.elimina).toHaveBeenCalledWith(
      "m1",
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    // il database non ha ancora risposto (o ha rifiutato): la domanda non sparisce come se fosse fatto
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});

describe("Modelli: confronto e simulazione", () => {
  it("occupa la larghezza disponibile con elenco e anteprima degli importi", () => {
    const { container } = apri();
    expect(container.firstElementChild?.className).not.toContain("max-w-3xl");
    const preview = screen.getByRole("region", {
      name: "Anteprima del modello",
    });
    expect(preview).toHaveTextContent("3.000,00");
    expect(preview).toHaveTextContent("4.000,00");
    fireEvent.change(
      within(preview).getByLabelText("Totale di esempio IVA inclusa"),
      { target: { value: "10.000,01" } },
    );
    expect(preview).toHaveTextContent("3.000,01");
    expect(preview).toHaveTextContent("10.000,01");
    fireEvent.click(screen.getByRole("button", { name: "Anteprima Due rate" }));
    expect(preview).toHaveTextContent("5.000,00");
    expect(preview).toHaveTextContent("5.000,01");
    expect(state.salva).not.toHaveBeenCalled();
  });
  it("trova i modelli per momento d'incasso e filtra quelli con SAL", () => {
    apri();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Filtra modelli per SAL" }),
      { target: { value: "sal" } },
    );
    expect(
      screen.queryByRole("button", { name: "Anteprima Due rate" }),
    ).toBeNull();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Cerca modelli di pagamento" }),
      { target: { value: "inesistente" } },
    );
    expect(
      screen.getByText("Nessun modello corrisponde alla ricerca."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Azzera i filtri" }));
    expect(
      screen.getByRole("button", { name: "Anteprima Due rate" }),
    ).toBeInTheDocument();
  });
  it("un importo non valido non produce importi di incasso inventati", () => {
    apri();
    const preview = screen.getByRole("region", {
      name: "Anteprima del modello",
    });
    fireEvent.change(
      within(preview).getByLabelText("Totale di esempio IVA inclusa"),
      { target: { value: "abc" } },
    );
    expect(preview).toHaveTextContent("Inserisci un importo positivo");
    expect(within(preview).queryByText("Totale IVA inclusa")).toBeNull();
  });
  it("il preavviso di ciascuna rata si modifica e arriva al salvataggio", () => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Modifica Tre rate" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("Preavviso rata 2"), {
      target: { value: "15" },
    });
    expect(
      within(dialogo).getByRole("region", { name: "Anteprima della bozza" }),
    ).toHaveTextContent("15 giorni prima");
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Salva modello" }),
    );
    expect(state.salva.mock.calls[0][0].righe[1].preavviso).toBe(15);
  });
  it("non mostra una regola SAL predefinita come letta se il caricamento fallisce", () => {
    state.disponibile = false;
    apri();
    const sal = document.getElementById("sal")!;
    expect(sal).toHaveTextContent("La regola SAL non è disponibile");
    expect(within(sal).queryByRole("radiogroup")).toBeNull();
    expect(state.impostazioni).not.toHaveBeenCalled();
  });
  it("blocca altri cambi SAL mentre sta salvando", () => {
    state.salPending = true;
    apri();
    expect(
      screen.getByRole("radio", { name: /Quando emetto il verbale/ }),
    ).toBeDisabled();
    expect(document.getElementById("sal")).toHaveTextContent("Salvataggio…");
  });
});
