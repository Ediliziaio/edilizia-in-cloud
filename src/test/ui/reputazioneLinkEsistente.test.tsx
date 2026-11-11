import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const db = vi.hoisted(() => ({
  row: null as null | { company_id: string; public_slug: string; active: boolean; settings: Record<string, unknown> },
  attempts: 0,
  offline: false,
  company: { id: "11111111-1111-4111-8111-111111111111", name: "Azienda test" },
  empty: [] as unknown[],
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: db.company, profile: null as null, user: null as null }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@tanstack/react-query", () => ({ useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[0] === "reputation-public-link" ? db.row : db.empty, isLoading: false, isError: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    const query = {
      select: () => query, eq: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: null as null, error: null as null }),
      then: (resolve: (value: { data: unknown[]; error: null | { message: string } }) => void) => resolve({ data: [], error: db.offline ? { message: "does not exist" } : null }),
      upsert: async (row: NonNullable<typeof db.row>, options: { ignoreDuplicates?: boolean }) => {
        if (table !== "reputation_public_links") throw new Error("Scrittura inattesa");
        db.attempts++;
        // Semantica ON CONFLICT della fixture: ignore preserva la riga, merge la sovrascrive.
        if (!db.row || !options.ignoreDuplicates) db.row = structuredClone(row);
        return { error: null as null };
      },
    };
    return query;
  },
} }));
import ReputationManager from "@/pages/azienda/marketing/ReputationManager";
beforeEach(() => { db.row = null; db.attempts = 0; db.offline = false; localStorage.clear(); db.company.id = "11111111-1111-4111-8111-111111111111"; });
afterEach(cleanup);
function open(tab = "integrazioni") { render(<MemoryRouter initialEntries={[`/azienda/marketing/reputazione?tab=${tab}`]}><ReputationManager /></MemoryRouter>); }
it("aprire Reputazione non riattiva né rinomina un link disabilitato", async () => {
  const saved = { company_id: db.company.id, public_slug: "slug-personalizzato", active: false, settings: { scelta: "preservare" } };
  db.row = structuredClone(saved);
  open();
  await waitFor(() => expect(db.attempts).toBeGreaterThan(0));
  expect(db.row).toEqual(saved);
  expect(screen.getByRole("textbox", { name: "Link recensione pubblico" })).toHaveValue(`${window.location.origin}/review/slug-personalizzato?company_id=${db.company.id}`);
  expect(screen.getByRole("button", { name: "Copia link" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Questo link è disattivato");
});
it("mantiene la predisposizione del link quando non esiste ancora", async () => {
  open();
  await waitFor(() => expect(db.row).not.toBeNull());
  expect(db.row).toMatchObject({ company_id: db.company.id, active: true });
  expect(db.row?.public_slug).not.toBe("");
});

it("un’azienda reale senza recensioni non vede le testimonianze di esempio", async () => {
  open("recensioni");
  await waitFor(() => expect(db.attempts).toBeGreaterThan(0));
  expect(screen.queryByText("Marco R.")).not.toBeInTheDocument();
  expect(screen.getByText("Nessuna recensione in questo filtro")).toBeInTheDocument();
});
it("mantiene gli esempi nella Demo Azienda", async () => {
  db.company.id = "d2000000-0000-4000-a000-000000000002";
  open("recensioni");
  await waitFor(() => expect(db.attempts).toBeGreaterThan(0));
  expect(screen.getByText("Marco R.")).toBeInTheDocument();
});

it("nel fallback locale elimina solo gli esempi noti e conserva i contenuti aziendali", async () => {
  db.offline = true;
  const review = { source: "Manuale", rating: 5, status: "pubblicata", date: "2026-05-21", project: "Progetto test", text: "Recensione locale", aiReply: "", sentiment: "positivo" };
  localStorage.setItem(`eic_reputation_manager_${db.company.id}`, JSON.stringify({ reviews: [
    { ...review, id: "rev-1", author: "Esempio vecchio" },
    { ...review, id: "recensione-locale", author: "Contenuto aziendale" },
  ] }));
  open("recensioni");
  await waitFor(() => expect(screen.getByText("Contenuto aziendale")).toBeInTheDocument());
  expect(screen.queryByText("Esempio vecchio")).not.toBeInTheDocument();
});
