import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import RenderBagnoNew from "@/pages/azienda/RenderBagnoNew";
const renderBagnoMocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(),
        createSignedUrl: vi.fn(),
      })),
    },
    from: renderBagnoMocks.from,
    auth: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    effectiveCompany: { id: "company-1" },
    user: { id: "user-1" },
  }),
}));

describe("RenderBagnoNew", () => {
  it("se la configurazione salvata non si legge mostra un errore senza generare", async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: { message: "Lettura non disponibile" } }) };
    renderBagnoMocks.from.mockReturnValue(query);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/azienda/render/bagno/nuovo?template=prova"]}><RenderBagnoNew /></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Non sono riuscito a caricare il render da modificare."));
    expect(screen.getByText("Foto del bagno attuale")).toBeInTheDocument();
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it("renders the first step without runtime crashes", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <RenderBagnoNew />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });

    expect(container.textContent).toContain("Stesso bagno, nuove finiture");
    expect(container.textContent).toContain("Foto del bagno attuale");
    expect(container.textContent).toContain("Analizza con AI");

    act(() => root.unmount());
    container.remove();
  });
});
