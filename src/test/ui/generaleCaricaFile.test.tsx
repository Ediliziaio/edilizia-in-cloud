import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Caricare insieme i file di tante unità: se uno fallisce, riprovando si ricarica solo lui. */
const m = vi.hoisted(() => ({ carica: vi.fn(), chiudi: vi.fn() }));
vi.mock("@/hooks/useGeneraleDocumenti", () => ({
  messaggioDocumenti: (e: Error) => e.message,
  useCaricaDocumentoVoce: () => ({ mutateAsync: m.carica }),
  useVociDocumentiAzienda: () => ({ righe: [] as never[] }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { CaricaFileUnita } from "@/components/orders/generali/unita/CaricaFileUnita";

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); });

const unita = [{ orderId: "a1", sigla: "A1" }, { orderId: "a2", sigla: "A2" }];
const file = (n: string) => new File(["x"], n, { type: "application/pdf", lastModified: 1 });
const apri = () => render(<CaricaFileUnita generaleId="g" modello="sviluppo" unita={unita} onClose={m.chiudi} />);
const scegli = (...f: File[]) => fireEvent.change(screen.getByLabelText("Scegli i file"), { target: { files: f } });

describe("caricare i file delle unità", () => {
  it("lo stesso file scelto due volte si carica una volta", async () => {
    m.carica.mockResolvedValue(undefined);
    apri();
    scegli(file("A1.pdf"));
    scegli(file("A1.pdf"));
    fireEvent.click(screen.getByRole("button", { name: "Carica 1 file" }));
    await waitFor(() => expect(m.chiudi).toHaveBeenCalled());
    expect(m.carica).toHaveBeenCalledTimes(1);
  });

  it("se uno fallisce resta col motivo, riprovando si ricarica solo lui", async () => {
    m.carica.mockImplementation(async (p: { orderId: string }) => { if (p.orderId === "a2") throw new Error("Rete assente"); });
    apri();
    scegli(file("A1.pdf"), file("A2.pdf"));
    fireEvent.click(screen.getByRole("button", { name: "Carica 2 file" }));
    await screen.findByText("Rete assente");
    expect(m.chiudi).not.toHaveBeenCalled();
    m.carica.mockClear();
    m.carica.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Carica 1 file" }));
    await waitFor(() => expect(m.chiudi).toHaveBeenCalled());
    expect(m.carica).toHaveBeenCalledTimes(1);
    expect(m.carica.mock.calls[0][0].orderId).toBe("a2");
  });

  it("un file già nell'archivio ma non segnato non si ricarica: lo doppierebbe", async () => {
    m.carica.mockRejectedValue(new Error("Il file è nell'archivio, ma non è stato segnato"));
    apri();
    scegli(file("A1.pdf"));
    fireEvent.click(screen.getByRole("button", { name: "Carica 1 file" }));
    await screen.findByText(/non è stato segnato/);
    expect(screen.getByRole("button", { name: /Carica/ })).toBeDisabled();
  });

  it("un file senza unità non si perde e non si carica", () => {
    apri();
    scegli(file("capitolato.pdf"));
    expect(screen.getByText("capitolato.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Carica/ })).toBeDisabled();
  });
});
