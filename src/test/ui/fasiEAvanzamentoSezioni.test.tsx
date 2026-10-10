// src/test/ui/fasiEAvanzamentoSezioni.test.tsx
// Impostazioni → Fasi e avanzamento, con i componenti veri: i modelli (la cosa principale) per primi, «Quando apri una
// commessa» al secondo posto, le regole per tutte le commesse in fondo; ogni sezione ha il suo indirizzo con l'àncora;
// chi non ha ancora modelli suoi trova scritto il passo da fare.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "company_admin", modifica: false, caricamentoPermessi: false,
  modelli: [] as unknown[], inizializzati: false, disponibile: true, caricamento: false,
  salvaAvvio: vi.fn(), salvaPeso: vi.fn(), salvaChi: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: state.role }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isLoading: state.caricamentoPermessi, canEditSettingsOrders: state.modifica }),
}));
vi.mock("@/hooks/useModelliFasi", () => ({
  useModelliFasi: () => ({
    modelli: state.modelli, inizializzati: state.inizializzati, disponibile: state.disponibile,
    isLoading: state.caricamento, isError: false, refetch: vi.fn(),
    salva: { mutate: vi.fn(), isPending: false }, elimina: { mutate: vi.fn(), isPending: false },
    inizializza: { mutate: vi.fn(), isPending: false, isError: false },
  }),
}));
vi.mock("@/hooks/useImpostazioniAvvio", () => ({
  useImpostazioniAvvio: () => ({
    modelloFasi: null as string | null, controlli: ["indirizzo", "date", "fasi", "chi", "pagamenti"], isLoading: false,
    salva: { mutate: state.salvaAvvio },
  }),
}));
vi.mock("@/hooks/usePesoMediaFasi", () => ({
  usePesoMediaFasi: () => ({ pesoMedia: "uguale", isLoading: false, salva: { mutate: state.salvaPeso, isPending: false } }),
}));
vi.mock("@/hooks/useChiSpunta", () => ({
  useChiSpunta: () => ({ chiSpunta: "tutti", isLoading: false, salva: { mutate: state.salvaChi, isPending: false } }),
}));

import SettingsModelliFasi from "@/pages/azienda/settings/SettingsModelliFasi";

const modelloAzienda = { id: "m1", origine: "azienda", nome: "Ristrutturazione completa", descrizione: "", fasi: [] as unknown[] };

function apri(percorso = "/azienda/impostazioni/modelli-fasi") {
  return render(
    <MemoryRouter initialEntries={[percorso]}>
      <SettingsModelliFasi />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    role: "company_admin", modifica: false, caricamentoPermessi: false,
    modelli: [modelloAzienda], inizializzati: true, disponibile: true, caricamento: false,
  });
});
afterEach(cleanup);

describe("Fasi e avanzamento: l'ordine e i titoli", () => {
  it("tre sezioni di secondo livello: prima i modelli, poi «Quando apri una commessa», poi le regole", () => {
    apri();
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Modelli di fasi",
      "Quando apri una commessa",
      "Regole per tutte le commesse",
    ]);
  });

  it("le due regole sono titoli di terzo livello dentro «Regole per tutte le commesse», e i loro gruppi di scelte hanno un nome", () => {
    apri();
    const regole = document.getElementById("regole") as HTMLElement;
    expect(within(regole).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Come si calcola l'avanzamento della commessa",
      "Chi può spuntare le sottofasi dal cantiere",
    ]);
    expect(screen.getByRole("radiogroup", { name: "Chi può spuntare le sottofasi dal cantiere" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Come si calcola l'avanzamento della commessa" })).toBeInTheDocument();
  });

  it("dice a quali commesse vale ogni sezione e quali si salvano subito", () => {
    apri();
    const nuova = document.getElementById("nuova-commessa") as HTMLElement;
    expect(within(nuova).getByText("Commesse nuove")).toBeInTheDocument();
    expect(within(nuova).getByText("Si salva subito")).toBeInTheDocument();
    const regole = document.getElementById("regole") as HTMLElement;
    expect(within(regole).getByText("Tutte le commesse")).toBeInTheDocument();
    expect(within(regole).getByText("Si salvano subito")).toBeInTheDocument();
  });

  it("la regola «chi spunta» parla in parole del cantiere, senza il database", () => {
    apri();
    const regole = document.getElementById("regole") as HTMLElement;
    expect(regole).toHaveTextContent("L'ufficio spunta sempre. Questa regola vale per chi lavora in cantiere (operai, squadre, ditte) e vale subito, anche per chi ha l'app già aperta.");
    expect(regole.textContent).not.toMatch(/database/i);
  });

  it("la regola dell'avanzamento dice che la percentuale è quella che si vede sulla commessa", () => {
    apri();
    expect(screen.getByText(/La percentuale che vedi sulla commessa è la media delle sue fasi/)).toBeInTheDocument();
  });
});

describe("Fasi e avanzamento: gli indirizzi con l'àncora", () => {
  it.each(["modelli", "nuova-commessa", "regole"])("l'indirizzo con #%s evidenzia la sezione giusta e nessun'altra", (ancora) => {
    apri(`/azienda/impostazioni/modelli-fasi#${ancora}`);
    const evidenziate = Array.from(document.querySelectorAll("[data-evidenziata='true']")).map((e) => e.id);
    expect(evidenziate).toEqual([ancora]);
  });

  it("l'indice in cima porta alle sezioni", () => {
    apri();
    fireEvent.click(screen.getByRole("link", { name: "Regole" }));
    expect((document.getElementById("regole") as HTMLElement).getAttribute("data-evidenziata")).toBe("true");
  });
});

describe("Fasi e avanzamento: «Fasi di partenza» senza modelli suoi", () => {
  beforeEach(() => { state.modelli = []; state.inizializzati = false; });

  it("dice qual è il passo da fare e porta alla sezione dei modelli", () => {
    apri();
    const nuova = document.getElementById("nuova-commessa") as HTMLElement;
    const suggerimento = within(nuova).getByRole("note");
    expect(suggerimento).toHaveTextContent("Non hai ancora modelli tuoi. Importa quelli standard o creane uno nella sezione «Modelli di fasi», poi scegli qui.");
    fireEvent.click(within(suggerimento).getByRole("link", { name: "«Modelli di fasi»" }));
    expect((document.getElementById("modelli") as HTMLElement).getAttribute("data-evidenziata")).toBe("true");
  });

  it("chi non può modificare non ha il passo da fare: lo scrive a chi tocca", () => {
    state.role = "staff";
    apri();
    const nuova = document.getElementById("nuova-commessa") as HTMLElement;
    expect(within(nuova).getByRole("note")).toHaveTextContent("Non ci sono ancora modelli dell'azienda: li prepara chi gestisce le impostazioni delle commesse.");
    expect(within(nuova).queryByRole("link")).toBeNull();
  });

  it("con almeno un modello suo il suggerimento non c'è", () => {
    state.modelli = [modelloAzienda];
    state.inizializzati = true;
    apri();
    expect(within(document.getElementById("nuova-commessa") as HTMLElement).queryByRole("note")).toBeNull();
  });

  it("mentre i modelli si caricano, o se non si riescono a leggere, il suggerimento non c'è (non si sa ancora)", () => {
    state.caricamento = true;
    const { unmount } = apri();
    expect(within(document.getElementById("nuova-commessa") as HTMLElement).queryByRole("note")).toBeNull();
    unmount();
    state.caricamento = false; state.disponibile = false;
    apri();
    expect(within(document.getElementById("nuova-commessa") as HTMLElement).queryByRole("note")).toBeNull();
  });
});

describe("Fasi e avanzamento: sola lettura onesta", () => {
  it("chi non modifica vede la frase e tutte le scelte spente", () => {
    state.role = "staff";
    apri();
    expect(screen.getByText(/Stai consultando queste impostazioni: le cambia chi ha «Configurazione Ordini» in modifica\./)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Fasi di partenza" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Come si paga" })).toBeDisabled();
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Nuovo modello" })).toBeNull();
  });

  it("mentre i permessi si caricano non dice niente", () => {
    state.role = "staff"; state.caricamentoPermessi = true;
    apri();
    expect(screen.queryByText(/Stai consultando queste impostazioni/)).toBeNull();
  });

  it("chi non è amministratore ma ha «Configurazione Ordini» in modifica può scegliere", () => {
    state.role = "staff"; state.modifica = true;
    apri();
    expect(screen.queryByText(/Stai consultando queste impostazioni/)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Solo il capocantiere/ }));
    expect(state.salvaChi).toHaveBeenCalledWith("capi");
  });

  it("chi modifica non vede la frase e può scegliere", () => {
    apri();
    expect(screen.queryByText(/Stai consultando queste impostazioni/)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Solo il capocantiere/ }));
    expect(state.salvaChi).toHaveBeenCalledWith("capi");
  });
});
