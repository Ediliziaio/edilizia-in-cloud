import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppCantiere, periodoAccesso } from "@/components/orders/AppCantiere";

const state = vi.hoisted(() => ({
  accessi: [] as unknown[],
  loading: false,
  error: false,
  scegli: vi.fn(),
  togli: vi.fn(),
}));

vi.mock("@/hooks/useAccessiCommessa", async (importOriginal) => {
  const vero = await importOriginal<typeof import("@/hooks/useAccessiCommessa")>();
  return {
    ...vero,
    useAccessiCommessa: () => ({ data: state.accessi, isLoading: state.loading, isError: state.error, refetch: vi.fn() }),
    useScegliCapocantiere: () => ({ mutate: state.scegli, isPending: false }),
    useTogliAccessoAMano: () => ({ mutate: state.togli, isPending: false }),
  };
});

const persona = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({
  id: `a-${id}`, user_id: id, role_type: "employee", data_inizio: null as string | null, data_fine_prevista: null as string | null,
  is_capocantiere: false, da_squadra_id: null as string | null, da_lavori: false,
  profile: { id, first_name: nome, last_name: "Rossi", email: null as string | null }, ...extra,
});

const draw = (modificabile = true) =>
  render(<AppCantiere orderId="o1" modificabile={modificabile} nomiSquadre={new Map([["sq1", "Squadra Muratori"]])} />);

afterEach(cleanup);
beforeEach(() => {
  state.accessi = []; state.loading = false; state.error = false;
  state.scegli.mockReset(); state.togli.mockReset();
});

describe("Nell'app: chi vede il cantiere", () => {
  it("le date si leggono come le dice un capocantiere", () => {
    expect(periodoAccesso({ data_inizio: "2026-10-15", data_fine_prevista: "2026-10-30" })).toBe("dal 15 ott al 30 ott");
    expect(periodoAccesso({ data_inizio: "2026-10-15", data_fine_prevista: "2026-10-15" })).toBe("il 15 ott");
    expect(periodoAccesso({ data_inizio: null, data_fine_prevista: null })).toBe("per tutta la commessa");
    expect(periodoAccesso({ data_inizio: null, data_fine_prevista: "2026-11-02" })).toBe("fino al 2 nov");
  });

  it("senza nessuno spiega che basta mettere le persone al lavoro", () => {
    draw();
    expect(screen.getByText("Nell'app non la vede ancora nessuno")).toBeInTheDocument();
    expect(screen.getByText(/Chi metti al lavoro su una fase la trova da solo/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Capocantiere")).not.toBeInTheDocument();
  });

  it("elenca chi e quando, da dove arriva, e si toglie solo chi è stato aggiunto a mano", () => {
    state.accessi = [
      persona("u1", "Mario", { da_squadra_id: "sq1", data_inizio: "2026-10-15", data_fine_prevista: "2026-10-21", is_capocantiere: true }),
      persona("u2", "Luca", { da_lavori: true, data_inizio: "2026-10-22", data_fine_prevista: "2026-10-30" }),
      persona("u3", "Anna"),
    ];
    draw();
    expect(screen.getByText("Nell'app la vedono 3 persone")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Chi e quando" }));
    const righe = screen.getAllByRole("listitem");
    expect(righe[0]).toHaveTextContent("Mario Rossi");
    expect(righe[0]).toHaveTextContent("Capocantiere");
    expect(righe[0]).toHaveTextContent("dal 15 ott al 21 ott");
    expect(righe[0]).toHaveTextContent("con Squadra Muratori");
    const luca = righe.find((r) => r.textContent?.includes("Luca"))!;
    expect(luca).toHaveTextContent("sulle fasi");
    expect(within(luca).queryByRole("button", { name: "Togli" })).not.toBeInTheDocument();
    const anna = righe.find((r) => r.textContent?.includes("Anna"))!;
    expect(anna).toHaveTextContent("aggiunto a mano");
    fireEvent.click(within(anna).getByRole("button", { name: "Togli" }));
    fireEvent.click(screen.getByRole("button", { name: "Togli" }));
    expect(state.togli).toHaveBeenCalledWith("a-u3", expect.any(Object));
  });

  it("chi non può modificare vede ma non cambia il capocantiere", () => {
    state.accessi = [persona("u1", "Mario", { da_lavori: true })];
    draw(false);
    expect(screen.getByLabelText("Capocantiere")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Chi e quando" }));
    expect(screen.queryByRole("button", { name: "Togli" })).not.toBeInTheDocument();
  });

  it("se la lettura non riesce lo dice e offre di riprovare", () => {
    state.error = true;
    draw();
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a leggere chi vede il cantiere");
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument();
  });
});
