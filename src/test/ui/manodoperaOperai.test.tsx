/**
 * Manodopera e Mezzi → Operai (26/09/2026). La giornata dice chi è al lavoro,
 * chi è in pausa, chi non ha timbrato e in quale cantiere è (o è previsto); i
 * riquadri in cima filtrano. L'elenco mostra costo orario e documenti. Chi può
 * solo guardare non vede «Nuovo operaio». La pagina mostra solo le schede che
 * la persona può aprire.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({
  giornata: [] as unknown[],
  operai: [] as unknown[],
  permessi: {
    canViewOperai: true, canEditOperai: true, canViewOrders: true, canViewSubappaltatori: true, canViewMezzi: false,
    isAdmin: false, solaLettura: false, isLoading: false,
  },
  schede: ["operai", "subappaltatori"] as string[],
  squadre: [] as unknown[],
  diario: [] as unknown[],
}));

vi.mock("@/hooks/useOperai", async (orig) => {
  const vero = await orig<typeof import("@/hooks/useOperai")>();
  const mutazione = () => ({ mutate: vi.fn(), isPending: false });
  return {
    ...vero,
    oggiRoma: () => "2026-09-25",
    useGiornataOperai: () => ({ data: stato.giornata, isLoading: false, error: null as Error | null, refetch: vi.fn(), isFetching: false }),
    useOperai: () => ({ data: stato.operai, isLoading: false, error: null as Error | null, refetch: vi.fn(), isFetching: false }),
    useSalvaOperaio: mutazione,
    useSalvaSquadra: mutazione,
    useSciogliSquadra: mutazione,
    useSquadraSuCommessa: mutazione,
    useSquadre: () => ({ data: stato.squadre, isLoading: false, error: null as Error | null, refetch: vi.fn(), isFetching: false }),
    usePersoneSquadra: () => ({ data: [] as unknown[] }),
    useDiarioGiorno: () => ({ data: stato.diario, isLoading: false, error: null as Error | null }),
  };
});
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => stato.permessi }));
vi.mock("@/hooks/useSchedeManodopera", () => ({ useSchedeManodopera: () => ({ schede: stato.schede, inCaricamento: false }) }));
vi.mock("@/hooks/useStatoPiano", () => ({ useStatoPiano: () => ({ isScopriPlan: false }) }));
vi.mock("@/pages/azienda/SubappaltatoriPage", () => ({ default: () => <p>pagina subappaltatori</p> }));
vi.mock("@/pages/azienda/MezziList", () => ({ default: () => <p>pagina mezzi</p> }));

import OperaiTab from "@/pages/azienda/manodopera/OperaiTab";
import ManodoperaPage from "@/pages/azienda/manodopera/ManodoperaPage";

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});
afterAll(() => vi.restoreAllMocks());
afterEach(() => cleanup());

const N = null as unknown;
const riga = (o: Record<string, unknown>) => ({
  profilo_id: "p", nome: "Nome", cognome: "Cognome", mansione: "Muratore", colore_avatar: N,
  stato: "non_timbrato", assenza: N, prima_entrata: N, ultima_uscita: N, ultimo_tipo: N, ultima_ora: N,
  ore_lavorate: N, fuori_zona: false, cantiere_id: N, cantiere: N, previsto_id: N, previsto: N,
  squadra_id: N, squadra: N, squadra_colore: N, mezzi: N, rapportino: N, ...o,
});

describe("Operai, la giornata", () => {
  it("divide per squadra, dice chi lavora e dove, e filtra chi non ha timbrato", () => {
    stato.giornata = [
      riga({ profilo_id: "a", nome: "Luca", cognome: "Barbieri", stato: "al_lavoro", prima_entrata: "07:30:00", ore_lavorate: 3.5, cantiere_id: "o1", cantiere: "ORD-2026-001 · Costruzioni Rossi Srl", squadra_id: "s1", squadra: "Squadra Posa Nord", squadra_colore: "#EA580C" }),
      riga({ profilo_id: "b", nome: "Marco", cognome: "Verdi", stato: "in_pausa", prima_entrata: "07:45:00", previsto_id: "o1", previsto: "ORD-2026-001 · Costruzioni Rossi Srl", squadra_id: "s1", squadra: "Squadra Posa Nord", squadra_colore: "#EA580C" }),
      riga({ profilo_id: "c", nome: "Anna", cognome: "Neri", stato: "assente", assenza: "ferie" }),
      riga({ profilo_id: "d", nome: "Paolo", cognome: "Gialli", stato: "non_timbrato" }),
    ];
    render(<MemoryRouter><OperaiTab /></MemoryRouter>);

    const posa = screen.getByRole("region", { name: "Squadra Posa Nord" });
    expect(within(posa).getByText(/2 su 2 al lavoro/)).toBeTruthy(); // oggi (mock) conta chi lavora ora
    expect(within(posa).getByText("Al lavoro")).toBeTruthy();
    expect(within(posa).getByText("In pausa")).toBeTruthy();
    expect(within(posa).getAllByText(/3 h 30 min/).length).toBeGreaterThan(0);
    for (const l of within(posa).getAllByRole("link", { name: "ORD-2026-001 · Costruzioni Rossi Srl" })) {
      expect(l.getAttribute("href")).toBe("/azienda/ordini/o1");
    }
    expect(within(posa).getByText("Previsto:")).toBeTruthy();
    const senza = screen.getByRole("region", { name: "Senza squadra" });
    expect(within(senza).getByText("In ferie")).toBeTruthy();

    // Il riquadro «Non hanno timbrato» lascia solo chi non ha timbrato.
    fireEvent.click(screen.getAllByRole("button", { name: /Non hanno timbrato/ })[0]);
    expect(screen.queryByRole("region", { name: "Squadra Posa Nord" })).toBeNull();
    expect(within(screen.getByRole("region", { name: "Senza squadra" })).getByText("Paolo Gialli")).toBeTruthy();
  });

  it("«Cosa è successo»: rapportini, guasti e uscite non timbrate, e la ricerca li filtra", () => {
    stato.giornata = [
      riga({ profilo_id: "a", nome: "Luca", cognome: "Barbieri", stato: "uscita_mancante", prima_entrata: "07:30:00", mezzi: "Ducato bianco" }),
      riga({ profilo_id: "b", nome: "Anna", cognome: "Neri", stato: "uscito", prima_entrata: "07:30:00", ultima_uscita: "16:30:00" }),
    ];
    stato.diario = [
      { quando: "2026-09-24T06:10:00Z", tipo: "segnalazione", titolo: "Guasto · Generatore 3 kW", testo: "Non parte a freddo", chi: "Davide Costa", order_id: null, cantiere: null, mezzo_id: "m1", mezzo: "Generatore 3 kW" },
      { quando: "2026-09-24T15:00:00Z", tipo: "rapportino", titolo: "Rapportino · 7 h", testo: "Montate le ultime 2 finestre", chi: "Luca Ferrari", order_id: "o1", cantiere: "ORD-2026-029 · Fabio Riva", mezzo_id: null, mezzo: null },
    ];
    render(<MemoryRouter><OperaiTab /></MemoryRouter>);

    const diario = screen.getByRole("region", { name: "Cosa è successo" });
    expect(within(diario).getByText("Guasto · Generatore 3 kW")).toBeTruthy();
    expect(within(diario).getByText("Uscita non timbrata")).toBeTruthy();
    expect(screen.getByText("Ducato bianco")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Cerca nella giornata"), { target: { value: "generatore" } });
    expect(within(diario).queryByText("Rapportino · 7 h")).toBeNull();
    expect(within(diario).getByText("Guasto · Generatore 3 kW")).toBeTruthy();
    stato.diario = [];
  });

  it("nel giorno di riposo non dice «non ha timbrato» a nessuno", () => {
    stato.giornata = [riga({ profilo_id: "a", stato: "riposo" }), riga({ profilo_id: "b", stato: "riposo" })];
    render(<MemoryRouter><OperaiTab /></MemoryRouter>);
    expect(screen.getByText(/giorno di riposo per tutti/)).toBeTruthy();
    expect(screen.queryByText("Non ha timbrato")).toBeNull();
    expect(screen.getAllByText("A riposo").length).toBe(2);
  });
});

describe("Operai, le squadre", () => {
  it("mostra responsabile fuori squadra, componenti e commesse, e chi è senza squadra", () => {
    stato.squadre = [{
      id: "s1", nome: "Squadra Posa Nord", colore: "#EA580C",
      responsabile: { id: "g", nome: "Giulia", cognome: "Ufficio", mansione: "Geometra", colore_avatar: null, e_componente: false },
      componenti: [{ id: "a", nome: "Luca", cognome: "Barbieri", mansione: "Posatore", colore_avatar: null, ha_accesso_app: true }],
      commesse: [{ order_id: "o1", codice: "ORD-2026-001", cliente: "Costruzioni Rossi Srl", dal: "2026-09-20", al: null, oggi: true }],
    }];
    stato.operai = [
      { id: "a", nome: "Luca", cognome: "Barbieri", attivo: true, squadra_id: "s1", squadra: "Squadra Posa Nord", colore_avatar: null },
      { id: "z", nome: "Piero", cognome: "Libero", attivo: true, squadra_id: null, squadra: null, colore_avatar: null },
    ];
    stato.giornata = [];
    render(<MemoryRouter initialEntries={["/azienda/manodopera?tab=operai&vista=squadre"]}><OperaiTab /></MemoryRouter>);

    const card = screen.getByRole("article", { name: "Squadra Posa Nord" });
    expect(card.textContent).toContain("Giulia Ufficio");
    expect(card.textContent).toContain("(Geometra)");
    expect(within(card).getByRole("link", { name: /ORD-2026-001 · Costruzioni Rossi Srl/ }).getAttribute("href")).toBe("/azienda/ordini/o1");
    expect(screen.getByRole("region", { name: "Operai senza squadra" }).textContent).toContain("Piero Libero");
    expect(screen.getByRole("button", { name: /Nuova squadra/ })).toBeTruthy();
  });
});

describe("Operai, l'elenco", () => {
  it("mostra squadra, documenti e mezzo, e il costo NON c'è (sta nel Personale)", () => {
    stato.operai = [
      { id: "a", nome: "Luca", cognome: "Barbieri", mansione: "Muratore", telefono: "3331234567", email: null, colore_avatar: null, foto_url: null, attivo: true, data_assunzione: null, tipo_contratto: "indeterminato", employee_id: "e1", ha_accesso_app: true, documenti_scaduti: 1, documenti_in_scadenza: 0, prossima_scadenza: null, mezzi: "Ducato bianco", cantieri_attivi: 2, squadra_id: "s1", squadra: "Squadra Posa Nord", squadra_colore: "#EA580C" },
      { id: "b", nome: "Marco", cognome: "Verdi", mansione: null, telefono: null, email: null, colore_avatar: null, foto_url: null, attivo: true, data_assunzione: null, tipo_contratto: null, employee_id: "e2", ha_accesso_app: false, documenti_scaduti: 0, documenti_in_scadenza: 0, prossima_scadenza: null, mezzi: null, cantieri_attivi: 0, squadra_id: null, squadra: null, squadra_colore: null },
    ];
    render(<MemoryRouter initialEntries={["/azienda/manodopera?tab=operai&vista=elenco"]}><OperaiTab /></MemoryRouter>);

    const tabella = screen.getByRole("table");
    expect(within(tabella).getByText("1 scaduto")).toBeTruthy();
    expect(within(tabella).getByText("Ducato bianco")).toBeTruthy();
    expect(within(tabella).getByText("Squadra Posa Nord")).toBeTruthy();
    expect(tabella.textContent).not.toMatch(/costo|€/i);
    expect(screen.getAllByText("Senza squadra").length).toBeGreaterThan(0);
  });

  it("chi può solo guardare non vede «Nuovo operaio»", () => {
    stato.permessi = { ...stato.permessi, solaLettura: true };
    stato.giornata = [];
    render(<MemoryRouter><OperaiTab /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: /Nuovo/ })).toBeNull();
    expect(screen.getByText("Non ci sono ancora operai")).toBeTruthy();
    stato.permessi = { ...stato.permessi, solaLettura: false };
  });
});

describe("Manodopera e Mezzi", () => {
  it("mostra solo le schede che la persona può aprire", () => {
    stato.giornata = [];
    render(<MemoryRouter initialEntries={["/azienda/manodopera?tab=mezzi"]}><ManodoperaPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Manodopera e Mezzi" })).toBeTruthy();
    const schede = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(schede).toEqual(["Operai", "Subappaltatori"]);
    // «?tab=mezzi» senza il permesso dei mezzi apre la prima scheda disponibile.
    expect(screen.getByRole("tab", { name: "Operai" }).getAttribute("aria-selected")).toBe("true");
  });
});
