import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn(), company: "demo2" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: mocks.company }, user: { id: "user" } }) }));
vi.mock("@/lib/computo/cloudComputo", () => ({ computoCloudAttivo: (id: string) => id === "demo2", elencaComputiCloud: mocks.list }));
import ComputiPreventivoLocali from "@/components/computo/ComputiPreventivoLocali";
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); mocks.company = "demo2"; });
afterEach(cleanup);
describe("elenco computi cloud", () => {
  it("mostra una bozza remota anche senza dati nel browser", async () => {
    mocks.list.mockResolvedValue([{ id: "draft", titolo: "Computo remoto", committente: "Cliente", numeroVoci: 4 }]);
    render(<MemoryRouter><ComputiPreventivoLocali /></MemoryRouter>);
    expect(await screen.findByRole("link", { name: /Computo remoto/ })).toHaveAttribute("href", "/azienda/marketing/preventivi/computo?bozza=draft");
    expect(screen.getByText(/Con copia Supabase/)).toBeVisible();
  });
  it("non contatta Supabase per altre aziende", () => {
    mocks.company = "altra-azienda";
    render(<MemoryRouter><ComputiPreventivoLocali /></MemoryRouter>); expect(mocks.list).not.toHaveBeenCalled();
  });
  it("mostra un errore recuperabile invece di un elenco falsamente vuoto", async () => {
    mocks.list.mockRejectedValueOnce(new Error("Connessione assente")).mockResolvedValueOnce([]);
    render(<MemoryRouter><ComputiPreventivoLocali /></MemoryRouter>); await screen.findByRole("alert");
    fireEvent.click(screen.getByText("Riprova")); await screen.findByRole("status");
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });
});
