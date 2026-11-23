import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DocumentiQrCampo } from "@/components/campo/DocumentiQrCampo";

const stato = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: stato.rpc } }));

const TOKEN = "11111111-2222-4333-8444-555555555555";
const disegna = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <DocumentiQrCampo orderId="ordine" />
  </QueryClientProvider>,
);
const fetchFinto = vi.fn();

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://progetto.supabase.co");
  vi.stubGlobal("fetch", fetchFinto);
  stato.rpc.mockReset();
  fetchFinto.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const risposta = (corpo: unknown) => Promise.resolve(new Response(JSON.stringify(corpo), { status: 200 }));

it("mostra i documenti del cartello col QR a chi lavora sul cantiere e li apre", async () => {
  stato.rpc.mockResolvedValue({ data: TOKEN, error: null });
  fetchFinto.mockImplementation((_url: string, init: RequestInit) => {
    const corpo = JSON.parse(String(init.body));
    if (!corpo.id) return risposta({ codice: "RIS01", documenti: [{ id: "d1", nome: "POS.pdf", tipo: "pos", byte: 10, anteprima: true }] });
    return risposta({ url: "https://progetto.supabase.co/storage/v1/object/sign/x" });
  });
  const scheda = { opener: {}, location: { replace: vi.fn() }, close: vi.fn() };
  vi.spyOn(window, "open").mockReturnValue(scheda as unknown as Window);
  disegna();
  expect(await screen.findByText("POS.pdf")).toBeInTheDocument();
  expect(screen.getByText("POS · Piano operativo di sicurezza")).toBeInTheDocument();
  expect(stato.rpc).toHaveBeenCalledWith("campo_qr_cantiere_token", { p_ordine: "ordine" });
  fireEvent.click(screen.getByRole("button", { name: "Apri POS.pdf" }));
  await waitFor(() => expect(scheda.location.replace).toHaveBeenCalledWith("https://progetto.supabase.co/storage/v1/object/sign/x"));
  expect(JSON.parse(String(fetchFinto.mock.calls[1][1].body))).toEqual({ token: TOKEN, id: "d1", azione: "apri" });
});

it("senza QR non mostra niente e non chiama la funzione dei documenti", async () => {
  stato.rpc.mockResolvedValue({ data: null, error: null });
  const { container } = disegna();
  await waitFor(() => expect(stato.rpc).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
  expect(fetchFinto).not.toHaveBeenCalled();
});
