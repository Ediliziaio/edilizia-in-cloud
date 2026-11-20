import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import CreateCompany from "@/pages/admin/CreateCompany";

vi.mock("@/hooks/useSuperAdminPermissions", () => ({
  useSuperAdminPermissions: () => ({ permissions: { can_manage_companies: true } }),
}));
vi.mock("@/integrations/supabase/client", () => {
  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    order: async (): Promise<{ data: unknown[]; error: null }> => ({ data: [], error: null }),
  };
  return {
    supabase: {
      auth: { getSession: async () => ({ data: { session: { access_token: "sessione-di-test" } } }) },
      from: () => query,
    },
  };
});

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});

it("crea l’azienda senza password inserita e permette di copiare quella generata con l’email disattivata", async () => {
  const password = "Credenziale-di-test!37";
  const richiesta = vi.fn(async (_url: string, _options: RequestInit) => Response.json({
    success: true,
    company: { id: "azienda-demo" },
    adminCredentials: {
      email: "admin@example.invalid",
      password,
      welcomeEmailStatus: "skipped",
    },
  }));
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal("fetch", richiesta);
  vi.stubEnv("VITE_SUPABASE_URL", "http://localhost:54321");

  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/admin/aziende/nuova"]}>
        <Routes>
          <Route path="/admin/aziende/nuova" element={<CreateCompany />} />
          <Route path="/admin/aziende" element={<h1>Elenco aziende</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(screen.queryByLabelText(/^password/i)).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: /nome azienda/i }), { target: { value: "Azienda di prova" } });
  fireEvent.change(screen.getByRole("textbox", { name: /email azienda/i }), { target: { value: "info@example.invalid" } });
  fireEvent.change(screen.getByRole("textbox", { name: /^nome\s*\*$/i }), { target: { value: "Mario" } });
  fireEvent.change(screen.getByRole("textbox", { name: /cognome/i }), { target: { value: "Rossi" } });
  fireEvent.change(screen.getByRole("textbox", { name: /email admin/i }), { target: { value: "admin@example.invalid" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /invia l'email di benvenuto/i }));
  fireEvent.click(screen.getByRole("button", { name: "Crea Azienda" }));

  const conferma = within(await screen.findByRole("dialog", { name: "Azienda creata" }));
  expect(richiesta).toHaveBeenCalledOnce();
  const [, options] = richiesta.mock.calls[0];
  const body = JSON.parse(String(options.body));
  expect(body).toMatchObject({ adminEmail: "admin@example.invalid", inviaBenvenuto: false });
  expect(body).not.toHaveProperty("adminPassword");
  expect(conferma.getByText(/email di benvenuto disattivato/i)).toBeInTheDocument();
  const campoPassword = conferma.getByLabelText("Password iniziale");
  expect(campoPassword).toHaveAttribute("type", "password");
  fireEvent.click(conferma.getByRole("button", { name: "Mostra password" }));
  expect(campoPassword).toHaveAttribute("type", "text");
  expect(campoPassword).toHaveValue(password);
  fireEvent.click(conferma.getByRole("button", { name: "Copia password" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(password));

  fireEvent.click(conferma.getByRole("button", { name: "Torna alle aziende" }));
  expect(await screen.findByRole("heading", { name: "Elenco aziende" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Password iniziale")).not.toBeInTheDocument();
});
