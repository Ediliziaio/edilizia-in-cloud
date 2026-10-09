import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ mutate: vi.fn(), error: vi.fn() }));
vi.mock("@/hooks/useOrganizzaListino", () => ({ useOrganizzaListino: () => ({ completaPrezziInfissi: { mutateAsync: mock.mutate } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: mock.error } }));
import { CompletaPrezziInfissiDialog } from "@/components/listino/CompletaPrezziInfissiDialog";
const monta = () => { const close = vi.fn(); render(<CompletaPrezziInfissiDialog macrocategoriaId="macro" categoriaId="linea" nomeLinea="Rehau" mancanti={48} onClose={close} />); return close; };
beforeEach(() => { vi.clearAllMocks(); mock.mutate.mockResolvedValue({ prodotti_prezzo: 48 }); });
afterEach(cleanup);
describe("un solo prezzo per i mancanti della linea", () => {
  it("spiega cosa non cambia e non precompila un prezzo inventato", () => {
    monta(); expect(screen.getByLabelText("Prezzo di vendita €/m²")).toHaveValue("");
    expect(screen.getByText(/Gli importi già impostati/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Completa prezzi mancanti" })).toBeDisabled();
  });
  it.each(["-1", "0", "NaN", "720abc", "1000001"])("blocca il prezzo %s", (value) => {
    monta(); fireEvent.change(screen.getByLabelText("Prezzo di vendita €/m²"), { target: { value } });
    expect(screen.getByRole("button", { name: "Completa prezzi mancanti" })).toBeDisabled();
  });
  it("invia 720,50 solo per la categoria selezionata", async () => {
    const close = monta(); fireEvent.change(screen.getByLabelText("Prezzo di vendita €/m²"), { target: { value: "720,50" } });
    fireEvent.click(screen.getByRole("button", { name: "Completa prezzi mancanti" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(mock.mutate).toHaveBeenCalledWith({ macrocategoriaId: "macro", categoriaId: "linea", prezzoMq: 720.5 });
  });
  it("impedisce il doppio invio e permette di riprovare dopo un errore", async () => {
    let reject!: (err: Error) => void; mock.mutate.mockImplementationOnce(() => new Promise((_, no) => { reject = no; }));
    const close = monta(); fireEvent.change(screen.getByLabelText("Prezzo di vendita €/m²"), { target: { value: "720" } });
    const submit = screen.getByRole("button", { name: "Completa prezzi mancanti" });
    fireEvent.click(submit); fireEvent.click(submit); expect(mock.mutate).toHaveBeenCalledTimes(1);
    reject(new Error("Permesso negato")); await waitFor(() => expect(mock.error).toHaveBeenCalledOnce());
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Completa prezzi mancanti" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
});
