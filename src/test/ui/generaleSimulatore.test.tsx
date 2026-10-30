import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ipotesiDiPartenza } from "@/lib/orders/generali/simulatore";
import type { IpotesiSalvata } from "@/hooks/useGeneraleSimulatore";

/**
 * Simulatore prima dell'acquisto: cosa vede chi usa l'app. I conti sono quelli veri
 * (simulatore → pianoConti, investitoriConti); finte solo le letture dal database.
 */
const m = vi.hoisted(() => ({
  margini: true,
  modifica: true,
  telefono: false,
  modelli: ["sviluppo"] as string[],
  salvate: [] as unknown[],
  salva: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda", name: "Edil Srl" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: false, isLoading: false, canViewMargins: m.margini, canEditOrders: m.modifica }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => m.telefono }));
vi.mock("@/hooks/useCommesseGenerali", () => ({
  useImpostazioniCommesseGenerali: () => ({ modelli: m.modelli }),
  messaggioGenerale: () => "errore",
}));
vi.mock("@/hooks/useGeneraleSimulatore", () => {
  const muta = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  return {
    useIpotesiSalvate: () => ({ data: m.salvate, isPending: false }),
    useSalvaIpotesi: () => ({ mutate: vi.fn(), mutateAsync: m.salva, isPending: false }),
    useEliminaIpotesi: muta,
    useDiventaOperazione: muta,
  };
});

const { SimulatorePagina } = await import("@/components/orders/generali/simulatore/SimulatorePagina");

const salvata = (id: string, nome: string, quante: number): IpotesiSalvata => {
  const ip = ipotesiDiPartenza("sviluppo", "2027-01");
  ip.tipologie = [{ id: "a", nome: "Appartamenti", quante, mq: 100, prezzoMq: 3_200, costoMq: null }];
  return { id, nome, modello: "sviluppo", ipotesi: ip, generaleId: null, creataIl: "2026-10-30T10:00:00Z", aggiornataIl: "2026-10-30T10:00:00Z" };
};

const monta = () => render(<MemoryRouter><SimulatorePagina /></MemoryRouter>);
const numero = (titolo: string) => screen.getByText(titolo).parentElement!;

beforeEach(() => {
  m.margini = true; m.modifica = true; m.telefono = false; m.modelli = ["sviluppo"]; m.salvate = [];
  m.salva = vi.fn().mockResolvedValue("nuova-id");
});
afterEach(cleanup);

describe("Valuta un'operazione", () => {
  it("parte con un'ipotesi di sviluppo e mostra subito i risultati", () => {
    monta();
    expect(screen.getByRole("heading", { name: "Valuta un'operazione" })).toBeTruthy();
    expect(within(numero("Ricavi")).getByText(/1\.920\.000/)).toBeTruthy();
    expect(screen.getByText("Capitale massimo impegnato")).toBeTruthy();
    expect(screen.getByText("ROE · TIR dei mezzi propri")).toBeTruthy();
    expect(screen.getByText("E se va diversamente?")).toBeTruthy();
    expect(screen.getByText("Prezzi −10%")).toBeTruthy();
  });

  it("i risultati cambiano mentre si scrive", () => {
    monta();
    fireEvent.change(screen.getByLabelText("Vendo a"), { target: { value: "3.500" } });
    expect(within(numero("Ricavi")).getByText(/2\.100\.000/)).toBeTruthy();
  });

  it("salva l'ipotesi col suo nome", async () => {
    monta();
    fireEvent.change(screen.getByLabelText(/Nome dell'ipotesi/), { target: { value: "Via Roma" } });
    fireEvent.click(screen.getByRole("button", { name: /Salva l'ipotesi/ }));
    await vi.waitFor(() => expect(m.salva).toHaveBeenCalled());
    expect(m.salva.mock.calls[0][0]).toMatchObject({ id: null, nome: "Via Roma" });
    expect(m.salva.mock.calls[0][0].ipotesi.modello).toBe("sviluppo");
  });

  it("senza permesso margini non mostra numeri", () => {
    m.margini = false;
    monta();
    expect(screen.getByRole("alert").textContent).toContain("permesso di vedere i margini");
    expect(screen.queryByText("Ricavi")).toBeNull();
  });

  it("senza «Ordini e Commesse» non offre Diventa operazione", () => {
    m.modifica = false;
    monta();
    expect(screen.queryByRole("button", { name: /Diventa operazione/ })).toBeNull();
    expect(screen.getByText(/serve il permesso «Ordini e Commesse»/)).toBeTruthy();
  });

  it("confronto: due ipotesi salvate affiancate, la migliore evidenziata", () => {
    m.salvate = [salvata("s6", "Sei appartamenti", 6), salvata("s4", "Quattro appartamenti", 4)];
    monta();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Confronto" }));
    fireEvent.click(screen.getByRole("tab", { name: "Confronto" }));
    const tabella = screen.getByRole("table");
    expect(within(tabella).getAllByText("Sei appartamenti").length).toBeGreaterThan(0);
    const riga = within(tabella).getByText("Ricavi").closest("tr")!;
    expect(riga.textContent).toContain("1.920.000");
    expect(riga.textContent).toContain("1.280.000");
  });

  it("da telefono: solo lettura delle ipotesi salvate", () => {
    m.telefono = true;
    m.salvate = [salvata("s6", "Sei appartamenti", 6)];
    monta();
    expect(screen.getByText(/si guardano soltanto/)).toBeTruthy();
    expect(screen.queryByLabelText("Vendo a")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Sei appartamenti/ }));
    expect(screen.getByText("Capitale massimo impegnato")).toBeTruthy();
  });
});
