// src/test/ui/convertiInCommessaCard.test.tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({ converti: vi.fn(), convertiFv: vi.fn() }));
vi.mock("@/lib/moduli/convertiInCommessa", () => ({
  convertiRstInCommessa: stato.converti,
  convertiFvInCommessa: stato.convertiFv,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ConvertiInCommessaCard } from "@/components/moduli/ConvertiInCommessaCard";

beforeEach(() => {
  vi.clearAllMocks();
  stato.converti.mockResolvedValue({ orderId: "o1", righe: 4 });
  stato.convertiFv.mockResolvedValue({ orderId: "o2", righe: 2 });
});
afterEach(cleanup);

describe("ConvertiInCommessaCard", () => {
  it("ristrutturazione con più capitoli: «una fase per capitolo» è già spuntata e va alla conversione", async () => {
    render(<ConvertiInCommessaCard modulo="rst" progettoId="p1" capitoli={3} />);
    expect(screen.getByRole("checkbox", { name: "Una fase per ogni capitolo" })).toBeChecked();
    expect(screen.getByText(/Una fase per ognuno dei 3 capitoli del computo/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Crea la commessa/ }));
    await waitFor(() => expect(stato.converti).toHaveBeenCalledWith("p1", "u1", { fasiDaCapitoli: true }));
  });

  it("si può togliere la spunta", async () => {
    render(<ConvertiInCommessaCard modulo="rst" progettoId="p1" capitoli={3} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Una fase per ogni capitolo" }));
    fireEvent.click(screen.getByRole("button", { name: /Crea la commessa/ }));
    await waitFor(() => expect(stato.converti).toHaveBeenCalledWith("p1", "u1", { fasiDaCapitoli: false }));
  });

  it("con un capitolo solo (o nessuno) non si offre, e non si chiede", async () => {
    render(<ConvertiInCommessaCard modulo="rst" progettoId="p1" capitoli={1} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Crea la commessa/ }));
    await waitFor(() => expect(stato.converti).toHaveBeenCalledWith("p1", "u1", { fasiDaCapitoli: false }));
  });

  it("il fotovoltaico non ha capitoli: stessa conversione di sempre", async () => {
    render(<ConvertiInCommessaCard modulo="fv" progettoId="p2" capitoli={5} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Crea la commessa/ }));
    await waitFor(() => expect(stato.convertiFv).toHaveBeenCalledWith("p2", "u1"));
    expect(stato.converti).not.toHaveBeenCalled();
  });

  it("se la conversione è bloccata la scelta non compare", () => {
    render(<ConvertiInCommessaCard modulo="rst" progettoId="p1" capitoli={3} bloccoMotivo="Aggiungi voci al computo." />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
