import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(), pending: false, success: vi.fn(), error: vi.fn(),
}));
vi.mock("@/hooks/useOrganizzaListino", () => ({
  useOrganizzaListino: () => ({ preparaModelliInfissi: { mutateAsync: mocks.mutate, isPending: mocks.pending } }),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
import { ModelliInfissiDialog } from "@/components/listino/ModelliInfissiDialog";

const apri = (companyId: string | null = "azienda") => {
  const close = vi.fn();
  render(<ModelliInfissiDialog open onOpenChange={close} companyId={companyId} giaPresenti={["PVC Salamander"]} />);
  return close;
};
beforeEach(() => { vi.clearAllMocks(); mocks.pending = false; mocks.mutate.mockResolvedValue({ prodotti_nuovi: 48, linee: 1 }); });
afterEach(cleanup);

describe("nuove linee: catalogo comune senza copiare tariffe", () => {
  it("spiega configurazioni, prezzi e fattibilità senza promettere compatibilità", () => {
    apri();
    expect(screen.getByText(/48 configurazioni standard/)).toBeTruthy();
    expect(screen.getByText(/non certifica la gamma del produttore/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Prepara le linee" }).getAttribute("disabled")).not.toBeNull();
  });
  it("deduplica i nomi e invia tutte le linee in una sola transazione", async () => {
    const close = apri();
    fireEvent.click(screen.getByRole("button", { name: "PVC Rehau" }));
    const input = screen.getByLabelText("Nome della linea");
    fireEvent.change(input, { target: { value: "  pvc rehau " } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "Alluminio" } });
    fireEvent.click(screen.getByRole("button", { name: "Prepara le linee" }));
    await waitFor(() => expect(close).toHaveBeenCalledWith(false));
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.mutate).toHaveBeenCalledWith(["PVC Rehau", "Alluminio"]);
  });
  it("il doppio click non avvia due installazioni e un errore permette di riprovare", async () => {
    let reject!: (error: Error) => void;
    mocks.mutate.mockImplementationOnce(() => new Promise((_, no) => { reject = no; }));
    const close = apri();
    fireEvent.click(screen.getByRole("button", { name: "PVC Rehau" }));
    const submit = screen.getByRole("button", { name: "Prepara le linee" });
    fireEvent.click(submit); fireEvent.click(submit);
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    reject(new Error("Non autorizzato"));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(submit);
    await waitFor(() => expect(close).toHaveBeenCalledWith(false));
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
  });
  it("senza azienda non permette di creare linee", () => {
    apri(null);
    fireEvent.click(screen.getByRole("button", { name: "PVC Rehau" }));
    fireEvent.click(screen.getByRole("button", { name: "Prepara le linee" }));
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});
