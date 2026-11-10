import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sofa } from "lucide-react";
import { RenderModuleHubPage } from "@/components/render/RenderModuleHubPage";

const db = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: db.from } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-A" } }) }));
vi.mock("@/components/render/RenderCreditsWidget", () => ({ RenderCreditsWidget: (): null => null }));

describe("Anteprima e dettaglio dello stesso render", () => {
  it("mostra il risultato salvato nell'array, identifica la stanza e apre la sua sessione", async () => {
    const source = { planimetria_id: "p1", locale_id: "b1", locale_nome: "Bagno ospiti", versione: 3 };
    db.from.mockImplementation((table: string) => {
      const data: unknown[] = table === "company_renders_recent" ? [{
        id: "render-bagno", render_type: "stanza", status: "completed", result_url: null,
        result_urls: ["https://example.test/bagno.png"], created_at: "2026-11-10T08:00:00Z",
        created_by: null, contact_id: null, opportunity_id: null,
      }] : table === "render_stanza_sessions" ? [{ id: "render-bagno", config: { planimetria: source } }]
        : [{ id: "p1", titolo: "Villa Rossi" }];
      const query = {
        select: () => query, eq: () => query, is: () => query, order: () => query,
        limit: async (): Promise<{ data: unknown[]; error: null }> => ({ data, error: null }),
        in: async (): Promise<{ data: unknown[]; error: null }> => ({ data, error: null }),
      };
      return query;
    });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/azienda/render/stanza"]}><Routes>
        <Route path="/azienda/render/stanza" element={<RenderModuleHubPage moduleId="stanza" moduleName="Stanza" breadcrumbLabel="Stanza" badgeLabel="Interni" title="Render stanza" description="" icon={Sofa} accentClassName="" iconBgClassName="" workflow={[]} qualityCards={[]} emptyTitle="Nessun render" emptyDescription="" newPath="/azienda/render/stanza/nuovo" galleryPath="/azienda/render/stanza/gallery" />} />
        <Route path="/azienda/render/stanza/gallery/render-bagno" element={<p>Dettaglio del bagno selezionato</p>} />
      </Routes></MemoryRouter>
    </QueryClientProvider>);
    const preview = await screen.findByRole("button", { name: /Bagno ospiti/ });
    expect(preview.querySelector("img")).toHaveAttribute("src", "https://example.test/bagno.png");
    expect(screen.getByText("Bagno ospiti · Villa Rossi")).toBeInTheDocument();
    fireEvent.click(preview);
    expect(await screen.findByText("Dettaglio del bagno selezionato")).toBeInTheDocument();
  });
});
