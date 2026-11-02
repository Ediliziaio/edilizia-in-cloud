import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RiepilogoPdfDialog } from "@/components/orders/RiepilogoPdfDialog";
import { GRUPPI_SINTETICO } from "@/lib/orders/riepilogoCommessaDati";

const file = { blob: new Blob(["pdf"], { type: "application/pdf" }), filename: "Riepilogo-commessa-C-1.pdf" };
const apri = () => {
  const onPrepara = vi.fn().mockResolvedValue(file);
  const onOpenChange = vi.fn();
  render(<RiepilogoPdfDialog open onOpenChange={onOpenChange} occupato={false} onPrepara={onPrepara} />);
  return { onPrepara, onOpenChange };
};

describe("Scelta del Riepilogo commessa", () => {
  it("completa: tutto, senza filtri", async () => {
    URL.createObjectURL = vi.fn(() => "blob:prova");
    URL.revokeObjectURL = vi.fn();
    const { onPrepara, onOpenChange } = apri();
    fireEvent.click(screen.getByRole("button", { name: "Scarica PDF" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onPrepara).toHaveBeenCalledWith({ perCliente: false, gruppi: null });
  });

  it("sintetica: solo le sue parti; una parte tolta non si chiede", async () => {
    const { onPrepara } = apri();
    fireEvent.click(screen.getByLabelText(/Sintetica/));
    expect(screen.queryByText("Foto di cantiere")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Fatture al cliente" }));
    fireEvent.click(screen.getByRole("button", { name: "Anteprima" }));
    await waitFor(() => expect(onPrepara).toHaveBeenCalled());
    expect(onPrepara.mock.calls[0][0]).toEqual({ perCliente: false, gruppi: GRUPPI_SINTETICO.filter((g) => g !== "fatture") });
  });

  it("per il cliente: chiede la versione filtrata e mostra l'anteprima prima di scaricare", async () => {
    URL.createObjectURL = vi.fn(() => "blob:prova");
    URL.revokeObjectURL = vi.fn();
    const { onPrepara } = apri();
    fireEvent.click(screen.getByLabelText(/Per il cliente/));
    fireEvent.click(screen.getByRole("button", { name: "Anteprima" }));
    expect(await screen.findByTitle("Riepilogo-commessa-C-1.pdf")).toBeTruthy();
    expect(onPrepara.mock.calls[0][0].perCliente).toBe(true);
  });
});
