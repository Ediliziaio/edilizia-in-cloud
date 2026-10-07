// src/test/ui/salMaturaConfig.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ salMatura: "emesso" as string, impostazioni: vi.fn() }));
vi.mock("@/hooks/useModelliPagamento", () => ({
  useModelliPagamento: () => ({ salMatura: state.salMatura, impostazioni: { mutate: state.impostazioni } }),
}));

import SalMaturaConfig from "@/components/settings/SalMaturaConfig";

beforeEach(() => { vi.clearAllMocks(); state.salMatura = "emesso"; });
afterEach(cleanup);

describe("Quando matura la rata di un SAL", () => {
  it("di partenza: quando emetto il verbale", () => {
    render(<SalMaturaConfig puoModificare />);
    expect(screen.getByRole("radio", { name: /Quando emetto il verbale/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Quando il cliente lo approva o lo firma/ })).not.toBeChecked();
  });
  it("sceglierne un'altra la salva", () => {
    render(<SalMaturaConfig puoModificare />);
    fireEvent.click(screen.getByRole("radio", { name: /Quando il cliente lo approva o lo firma/ }));
    expect(state.impostazioni).toHaveBeenCalledWith({ salMatura: "approvato" });
  });
  it("mostra la scelta già fatta", () => {
    state.salMatura = "approvato";
    render(<SalMaturaConfig puoModificare />);
    expect(screen.getByRole("radio", { name: /Quando il cliente lo approva o lo firma/ })).toBeChecked();
  });
  it("chi non può modificare le impostazioni vede la scelta ma non la cambia", () => {
    render(<SalMaturaConfig puoModificare={false} />);
    expect(screen.getByRole("radio", { name: /Quando emetto il verbale/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Quando il cliente lo approva o lo firma/ }));
    expect(state.impostazioni).not.toHaveBeenCalled();
  });
});
