import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Image } from "lucide-react";
import { RenderModuleHubPage } from "@/components/render/RenderModuleHubPage";
const queryState = vi.hoisted(() => ({ error: false, refetch: vi.fn() }));
beforeEach(() => { queryState.error = false; queryState.refetch.mockClear(); });

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/render/RenderCreditsWidget", () => ({ RenderCreditsWidget: (): null => null }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({
  isLoading: false,
  isError: queryState.error,
  refetch: queryState.refetch,
  data: queryState.error ? undefined : [
    { id: "pending", status: "pending", created_at: "2020-01-01T12:00:00Z", meta: { createdByName: "Sessione mai avviata" } },
    { id: "processing", status: "processing", created_at: "2020-01-01T12:00:00Z", meta: { createdByName: "Sessione avviata" } },
    { id: "completed", status: "completed", created_at: "2020-01-01T12:00:00Z", meta: { createdByName: "Sessione completata" } },
    { id: "recent", status: "pending", created_at: new Date().toISOString(), meta: { createdByName: "Foto appena caricata" } },
  ],
}) }));
afterEach(cleanup);

it("Mostra da verificare include le attese storiche e le elaborazioni, esclude completate e appena create", () => {
  render(<MemoryRouter><RenderModuleHubPage moduleId="infissi" moduleName="Infissi" breadcrumbLabel="Infissi" badgeLabel="Infissi" title="Render infissi" description="Prova" icon={Image} accentClassName="" iconBgClassName="" workflow={[]} qualityCards={[]} emptyTitle="Vuoto" emptyDescription="Nessun render" galleryPath="/render" /></MemoryRouter>);
  expect(screen.getByText("Foto appena caricata")).toBeInTheDocument();
  expect(screen.getByText(/questa età non misura il tempo di elaborazione/)).toBeInTheDocument();
  expect(screen.queryByText(/Ultimo avvio/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Mostra da verificare/ }));
  expect(screen.getByText("Sessione mai avviata")).toBeInTheDocument();
  expect(screen.getByText("Sessione avviata")).toBeInTheDocument();
  expect(screen.queryByText("Sessione completata")).not.toBeInTheDocument();
  expect(screen.queryByText("Foto appena caricata")).not.toBeInTheDocument();
});

it("una lettura fallita non invita a creare il primo render e permette di riprovare", () => {
  queryState.error = true;
  render(<MemoryRouter><RenderModuleHubPage moduleId="infissi" moduleName="Infissi" breadcrumbLabel="Infissi" badgeLabel="Infissi" title="Render infissi" description="Prova" icon={Image} accentClassName="" iconBgClassName="" workflow={[]} qualityCards={[]} emptyTitle="Nessun render salvato" emptyDescription="Nessun render" newPath="/nuovo" /></MemoryRouter>);
  expect(screen.getByRole("alert")).toHaveTextContent("Impossibile caricare le sessioni render");
  expect(screen.queryByText("Nessun render salvato")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Riprova caricamento" }));
  expect(queryState.refetch).toHaveBeenCalledOnce();
});
