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
  ore_lavorate: N, fuori_zona: false, cantiere_id: N, cantiere: N, previsto_id: N, previsto: N, ...o,
});

describe("Operai, la giornata", () => {
  it("dice chi lavora, dove, e filtra chi non ha timbrato", () => {
    stato.giornata = [
      riga({ profilo_id: "a", nome: "Luca", cognome: "Barbieri", stato: "al_lavoro", prima_entrata: "07:30:00", ore_lavorate: 3.5, cantiere_id: "o1", cantiere: "ORD-2026-001 · Costruzioni Rossi Srl" }),
      riga({ profilo_id: "b", nome: "Marco", cognome: "Verdi", stato: "in_pausa", prima_entrata: "07:45:00", ultima_ora: "12:05:00", previsto_id: "o2", previsto: "ORD-DEM-RIS01 · Cliente Demo" }),
      riga({ profilo_id: "c", nome: "Anna", cognome: "Neri", stato: "assente", assenza: "ferie" }),
      riga({ profilo_id: "d", nome: "Paolo", cognome: "Gialli", stato: "non_timbrato" }),
    ];
    render(<MemoryRouter><OperaiTab /></MemoryRouter>);

    const tabella = screen.getByRole("table");
    expect(within(tabella).getByText("Al lavoro")).toBeTruthy();
    expect(within(tabella).getByText("In pausa")).toBeTruthy();
    expect(within(tabella).getByText("In ferie")).toBeTruthy();
    expect(within(tabella).getByText("3 h 30 min")).toBeTruthy();
    expect(within(tabella).getByRole("link", { name: "ORD-2026-001 · Costruzioni Rossi Srl" }).getAttribute("href")).toBe("/azienda/ordini/o1");
    expect(within(tabella).getByText("Previsto")).toBeTruthy();

    // Il riquadro «Non hanno timbrato» lascia solo chi non ha timbrato.
    fireEvent.click(screen.getAllByRole("button", { name: /Non hanno timbrato/ })[0]);
    const righe = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(righe).toHaveLength(1);
    expect(righe[0].textContent).toContain("Paolo Gialli");
  });
});

describe("Operai, l'elenco", () => {
  it("mostra costo orario e documenti, e segnala chi non ha il costo", () => {
    stato.operai = [
      { id: "a", nome: "Luca", cognome: "Barbieri", mansione: "Muratore", telefono: "3331234567", email: null, colore_avatar: null, foto_url: null, attivo: true, data_assunzione: null, tipo_contratto: "indeterminato", employee_id: "e1", ha_accesso_app: true, costo_orario: 19.05, costo_orario_scritto: false, documenti_scaduti: 1, documenti_in_scadenza: 0, prossima_scadenza: null, mezzi: "Ducato bianco", cantieri_attivi: 2 },
      { id: "b", nome: "Marco", cognome: "Verdi", mansione: null, telefono: null, email: null, colore_avatar: null, foto_url: null, attivo: true, data_assunzione: null, tipo_contratto: null, employee_id: "e2", ha_accesso_app: false, costo_orario: null, costo_orario_scritto: false, documenti_scaduti: 0, documenti_in_scadenza: 0, prossima_scadenza: null, mezzi: null, cantieri_attivi: 0 },
    ];
    render(<MemoryRouter initialEntries={["/azienda/manodopera?tab=operai&vista=elenco"]}><OperaiTab /></MemoryRouter>);

    const tabella = screen.getByRole("table");
    expect(within(tabella).getByText("1 scaduto")).toBeTruthy();
    expect(within(tabella).getByText("da scrivere")).toBeTruthy();
    expect(within(tabella).getByText("Ducato bianco")).toBeTruthy();
    expect(tabella.textContent).toContain("19,05");
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
