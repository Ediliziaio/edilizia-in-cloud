import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const state = vi.hoisted(() => ({ isError: false, retry: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@tanstack/react-query", () => ({ useQuery: ({ queryKey }: { queryKey: string[] }) => queryKey[0] === "render-technical-detail"
  ? { data: null as null, isLoading: false, isError: state.isError, refetch: state.retry }
  : { data: null as null } }));
import RenderTechnicalModuleGalleryDetail from "@/pages/azienda/RenderTechnicalModuleGalleryDetail";
beforeEach(() => { state.isError = false; state.retry.mockClear(); });
afterEach(cleanup);
function setup() { render(<MemoryRouter><RenderTechnicalModuleGalleryDetail moduleId="giardini" /></MemoryRouter>); }
it("non confonde una lettura fallita con una sessione inesistente e permette di riprovare", () => {
  state.isError = true;
  setup();
  expect(screen.getByRole("alert")).toHaveTextContent("Impossibile caricare il render");
  expect(screen.queryByText("Sessione non trovata")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Riprova caricamento" }));
  expect(state.retry).toHaveBeenCalledOnce();
});
it("mantiene distinto il caso di una sessione assente dopo una lettura riuscita", () => {
  setup();
  expect(screen.getByText("Sessione non trovata")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
