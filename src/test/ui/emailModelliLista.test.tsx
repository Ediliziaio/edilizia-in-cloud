/**
 * Email Marketing › Modelli (24/09/2026): la colonna «Tipo» diceva «html» su
 * tutti i 374 modelli, sopra la tabella c'era «Home» anche senza cartelle, il
 * pulsante diceva «Nuovo template» in una scheda che si chiama Modelli, e per
 * aprire un modello bisognava passare dal menu «…».
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Riga = Record<string, unknown>;
const stato: { righe: Riga[] } = { righe: [] };

vi.mock("@/integrations/supabase/client", () => {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "is", "in", "order"]) c[m] = () => c;
  c.then = (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(a, b);
  return { supabase: c };
});

vi.mock("@/contexts/AuthContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/contexts/AuthContext")>()),
  useAuth: () => ({ effectiveCompany: { id: "az-1" }, user: { id: "u-1" } }),
}));

vi.mock("@/hooks/useEmailCampaignsPaginated", () => ({
  useEmailTemplatesPaginated: () => ({ data: { data: stato.righe, total: stato.righe.length }, isLoading: false }),
}));

vi.mock("@/components/email-marketing/TemplateDialog", () => ({
  TemplateDialog: ({ open, template }: { open: boolean; template: { name?: string } | null }) =>
    open ? <div data-testid="modello-aperto">{template?.name ?? "nuovo"}</div> : null,
}));

const { EmailTemplatesTab } = await import("@/components/email-marketing/EmailTemplatesTab");

function disegna() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><EmailTemplatesTab /></QueryClientProvider>);
}

beforeEach(() => { stato.righe = []; });

describe("Email Marketing › Modelli", () => {
  it("mostra l'oggetto al posto di «html», e niente «Home» senza cartelle", () => {
    stato.righe = [{ id: "m-1", name: "Benvenuto", subject: "Benvenuto in Rossi Serramenti", type: "html", folder_id: null, updated_at: "2026-09-24T10:00:00Z" }];
    disegna();
    expect(screen.getByText("Benvenuto in Rossi Serramenti")).toBeTruthy();
    expect(screen.queryByText("html")).toBeNull();
    expect(screen.queryByText("Home")).toBeNull();
    expect(screen.getByRole("button", { name: /Nuovo modello/ })).toBeTruthy();
  });

  it("un clic sulla riga apre il modello", () => {
    stato.righe = [{ id: "m-1", name: "Benvenuto", subject: "", type: "html", folder_id: null, updated_at: "2026-09-24T10:00:00Z" }];
    disegna();
    fireEvent.click(screen.getByText("Benvenuto"));
    expect(screen.getByTestId("modello-aperto").textContent).toBe("Benvenuto");
  });

  it("vuota dice cos'è un modello e come si crea", () => {
    disegna();
    expect(screen.getByText("Ancora nessun modello")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Crea il primo modello/ }));
    expect(screen.getByTestId("modello-aperto").textContent).toBe("nuovo");
  });
});
