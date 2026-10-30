import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const finto = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/hooks/useWarehouses", () => ({
  useWarehouses: () => ({ warehouses: [{ id: "w1", name: "Magazzino centrale", type: "main", is_default: true, linked_order_id: null }] }),
}));
vi.mock("@/hooks/useConsumiMateriali", () => ({ useRientroMateriale: () => ({ mutate: finto.mutate, isPending: false }) }));

import RientroMagazzinoDialog from "@/components/orders/materiali/RientroMagazzinoDialog";

const riga = { id: "r1", nome: "Cemento", unita: "sacco", avanzano: 2, posati: 8, quantita: 10, rientrati: 0, daGiacenza: false };

describe("rientro in magazzino", () => {
  it("propone quanto avanza e manda anche i già rientrati che si vedevano", () => {
    render(<RientroMagazzinoDialog orderId="o1" riga={riga} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Quanti rientrano")).toHaveValue("2");
    fireEvent.click(screen.getByRole("button", { name: /Fai rientrare 2/ }));
    expect(finto.mutate).toHaveBeenCalledWith(expect.objectContaining({ riga: "r1", quantita: 2, magazzino: "w1", giaRientrati: 0 }), expect.anything());
  });

  it("non lascia rientrare più di quanto avanza: il resto è già posato", () => {
    finto.mutate.mockReset();
    render(<RientroMagazzinoDialog orderId="o1" riga={riga} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Quanti rientrano"), { target: { value: "10" } });
    expect(screen.getByText(/Ne avanzano 2: il resto è già posato/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fai rientrare/ })).toBeDisabled();
  });

  it("la merce presa dal magazzino torna nella sua scheda: niente scelta del magazzino", () => {
    finto.mutate.mockReset();
    render(<RientroMagazzinoDialog orderId="o1" riga={{ ...riga, daGiacenza: true }} onClose={vi.fn()} />);
    expect(screen.queryByLabelText("Magazzino")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Fai rientrare 2/ }));
    expect(finto.mutate).toHaveBeenCalledWith(expect.objectContaining({ magazzino: null }), expect.anything());
  });
});
