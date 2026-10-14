// src/test/ui/salMaturaConfig.test.tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ salMatura: "emesso" as string, impostazioni: vi.fn(),confirm:vi.fn() }));
vi.mock("@/components/ui/confirm-dialog",()=>({useConfirm:()=>state.confirm}));
vi.mock("@/hooks/useModelliPagamento", () => ({
  useModelliPagamento: () => ({ salMatura: state.salMatura, disponibile:true,isLoading:false,impostazioni: { mutate: state.impostazioni,isPending:false } }),
}));

import SalMaturaConfig from "@/components/settings/SalMaturaConfig";

beforeEach(() => { vi.clearAllMocks(); state.salMatura = "emesso"; state.confirm.mockResolvedValue(true); });
afterEach(cleanup);

describe("Quando matura la rata di un SAL", () => {
  it("di partenza: quando emetto il verbale", () => {
    render(<SalMaturaConfig puoModificare />);
    expect(screen.getByRole("radio", { name: /Quando emetto il verbale/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Quando il cliente lo approva o lo firma/ })).not.toBeChecked();
  });
  it("sceglierne un'altra la salva solo dopo la conferma dell'impatto su tutte le commesse", async () => {
    render(<SalMaturaConfig puoModificare />);
    fireEvent.click(screen.getByRole("radio", { name: /Quando il cliente lo approva o lo firma/ }));
    await waitFor(()=>expect(state.impostazioni).toHaveBeenCalledWith({ salMatura: "approvato" }));
    expect(state.confirm).toHaveBeenCalledWith(expect.objectContaining({confirmLabel:"Applica regola aziendale"}));
  });
  it("annullare la conferma lascia invariata la regola",async()=>{state.confirm.mockResolvedValue(false);render(<SalMaturaConfig puoModificare/>);fireEvent.click(screen.getByRole("radio",{name:/Quando il cliente lo approva/}));await waitFor(()=>expect(state.confirm).toHaveBeenCalledOnce());expect(state.impostazioni).not.toHaveBeenCalled();});
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
