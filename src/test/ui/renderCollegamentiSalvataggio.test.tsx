import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RenderCrmSummaryCard } from "@/components/render/RenderCrmSummaryCard";
const db = vi.hoisted(() => ({
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  data: { id: "r1" } as object | null,
  error: null as object | null,
  success: vi.fn(),
  failure: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "azienda-A" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: db.from },
}));
vi.mock("sonner", () => ({
  toast: { success: db.success, error: db.failure },
}));
vi.mock("@/lib/render/renderGalleryMeta", () => ({
  loadRenderGalleryMeta: async () => ({}),
  resolveRenderGalleryMeta: (source: { contact_id: string }) => ({
    contactName: source.contact_id,
  }),
}));
vi.mock("@/components/render/RenderCrmLinker", () => ({
  RenderCrmLinker: ({
    onContactChange,
  }: {
    onContactChange: (id: string) => void;
  }) => (
    <button onClick={() => onContactChange("nuovo-contatto")}>
      Scegli contatto esistente
    </button>
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  db.data = { id: "r1" };
  db.error = null;
  const q = {
    update: db.update,
    eq: db.eq,
    select: () => q,
    maybeSingle: async () => ({ data: db.data, error: db.error }),
  };
  for (const fn of [db.from, db.update, db.eq]) fn.mockReturnValue(q);
});
const show = (editable = true) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <MemoryRouter>
        <RenderCrmSummaryCard
          sessionId="r1"
          sessionTable="render_sessions"
          contactId="contatto-originale"
          editable={editable}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
describe("Collegamento del render senza creare nuove schede", () => {
  it("aggiorna solo la sessione della propria azienda dopo la conferma del server", async () => {
    show();
    fireEvent.click(
      screen.getByRole("button", { name: "Scegli contatto esistente" }),
    );
    expect(await screen.findByText("nuovo-contatto")).toBeInTheDocument();
    expect(db.eq).toHaveBeenCalledWith("company_id", "azienda-A");
    expect(db.eq).toHaveBeenCalledWith("id", "r1");
    expect(db.from).toHaveBeenCalledWith("render_sessions");
  });
  it.each(["errore", "nessuna-riga"])(
    "conserva il vecchio collegamento se il server restituisce %s",
    async (failure) => {
      db.data = null;
      db.error = failure === "errore" ? { message: "rifiutato" } : null;
      show();
      fireEvent.click(
        screen.getByRole("button", { name: "Scegli contatto esistente" }),
      );
      await waitFor(() => expect(db.failure).toHaveBeenCalledOnce());
      expect(await screen.findByText("contatto-originale")).toBeInTheDocument();
      expect(screen.queryByText("nuovo-contatto")).not.toBeInTheDocument();
      expect(db.success).not.toHaveBeenCalled();
    },
  );
  it("in sola lettura non espone la modifica", () => {
    show(false);
    expect(
      screen.queryByRole("button", { name: "Scegli contatto esistente" }),
    ).not.toBeInTheDocument();
    expect(db.update).not.toHaveBeenCalled();
  });
});
