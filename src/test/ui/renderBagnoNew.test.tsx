import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import RenderBagnoNew from "@/pages/azienda/RenderBagnoNew";

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
    from: vi.fn(() => ({
      insert: vi.fn(),
      update: vi.fn(),
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn(),
    })),
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
  it("renders the first step without runtime crashes", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RenderBagnoNew />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain("Nuovo render bagno");
    expect(html).toContain("Foto del bagno attuale");
    expect(html).toContain("Analizza con AI");
  });
});
