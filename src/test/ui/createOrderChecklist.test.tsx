import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CreateOrderChecklist } from "@/components/orders/CreateOrderChecklist";
import { CreateOrderActions } from "@/components/orders/CreateOrderActions";

afterEach(cleanup);
const checks = [
  { label: "cliente", done: false },
  { label: "descrizione", done: false },
  { label: "importo", done: false },
  { label: "stato iniziale", done: true },
  { label: "righe da correggere", done: true },
];

describe("cosa manca alla commessa, in una riga accanto a «Crea commessa» (14/11/2026)", () => {
  it("si legge solo quello che manca", () => {
    render(<CreateOrderChecklist checks={checks} />);
    expect(screen.getByText("Manca: cliente · descrizione · importo")).toBeInTheDocument();
    expect(screen.queryByText(/stato iniziale/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Controlli commessa: manca cliente, descrizione, importo")).toBeInTheDocument();
  });

  it("quando non manca niente dice «Tutto pronto»", () => {
    render(<CreateOrderChecklist checks={checks.map((c) => ({ ...c, done: true }))} />);
    expect(screen.getByText("Tutto pronto")).toBeInTheDocument();
  });

  it("sta nella barra di «Crea commessa», non in una scheda in cima", () => {
    render(<form><CreateOrderActions pending={false} created={false} onCancel={() => {}} onOpenCreated={() => {}} checks={checks} totale="€ 1.100,00" /></form>);
    const barra = screen.getByTestId("create-order-actions");
    expect(barra).toHaveTextContent("Manca: cliente · descrizione · importo");
    expect(barra).toHaveTextContent("Totale con IVA");
  });

  it("a commessa creata non la mostra più", () => {
    render(<form><CreateOrderActions pending={false} created onCancel={() => {}} onOpenCreated={() => {}} checks={checks} /></form>);
    expect(screen.queryByText(/Manca:/)).not.toBeInTheDocument();
  });
});
