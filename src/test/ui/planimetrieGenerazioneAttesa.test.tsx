import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ prepara: vi.fn(), invoke: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-test" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: api.invoke } } }));
vi.mock("@/components/planimetrie/editor/generazione", async (original) => ({ ...await original<typeof import("@/components/planimetrie/editor/generazione")>(), preparaImmagine: api.prepara, inBase64: vi.fn(async () => "base64") }));
import RenderPlanimetriaNuova from "@/pages/azienda/RenderPlanimetriaNuova";

beforeEach(() => {
  vi.clearAllMocks();
  const BaseURL = URL;
  class URLConBlob extends BaseURL {}
  Object.assign(URLConBlob, { createObjectURL: () => "blob:test-pianta", revokeObjectURL: () => undefined });
  vi.stubGlobal("URL", URLConBlob);
  api.invoke.mockResolvedValue({ data: { success: false, codice: "non_leggibile" }, error: null as Error | null });
});
afterEach(() => vi.unstubAllGlobals());
function monta() {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/azienda/render/planimetrie/nuova?da=documento"]}><RenderPlanimetriaNuova /></MemoryRouter></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText("PDF o foto della pianta"), { target: { files: [new File(["foto"], "pianta.png", { type: "image/png" })] } });
  return screen.getByRole("button", { name: "Ricava la pianta" }) as HTMLButtonElement;
}
describe("preparazione del documento", () => {
  it("blocca un secondo invio già mentre prepara l'immagine", async () => {
    let prosegui!: () => void;
    api.prepara.mockReturnValue(new Promise<unknown>((resolve) => { prosegui = () => resolve({ file: new File(["foto"], "pronta.png", { type: "image/png" }), mime: "image/png", larghezza: 800, altezza: 600 }); }));
    const bottone = monta();
    fireEvent.click(bottone);
    expect(bottone.disabled).toBe(true);
    fireEvent.click(bottone);
    expect(api.prepara).toHaveBeenCalledOnce();
    await act(async () => prosegui());
    await waitFor(() => expect(api.invoke).toHaveBeenCalledOnce());
    await waitFor(() => expect(bottone.disabled).toBe(false));
  });
  it("mostra un errore leggibile e permette di riprovare se la preparazione fallisce", async () => {
    api.prepara.mockRejectedValue(new Error("Errore del decoder"));
    const bottone = monta();
    fireEvent.click(bottone);
    expect((await screen.findByRole("alert")).textContent).toContain("Non riesco a preparare il documento");
    expect(bottone.disabled).toBe(false);
    expect(api.invoke).not.toHaveBeenCalled();
  });
});
