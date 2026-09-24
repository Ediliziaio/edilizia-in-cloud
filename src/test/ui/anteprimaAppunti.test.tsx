import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/**
 * Passando sull'icona delle note della card del kanban si leggono le ultime
 * note, con data, ora e chi le ha scritte (24/09/2026). Prima diceva solo
 * «Appunti (1)» e per leggerle bisognava aprire l'opportunità.
 */

const BEMADE = "1b4ef4f7-87a6-4313-9ac6-cd53a7c14ce7";
const OPP = "opp-daniela";

const registro: string[] = [];

const NOTE = [
  { id: "n1", content: "Richiamare lunedì mattina", created_at: "2026-09-23T12:00:00Z", profiles: { first_name: "Venusia", last_name: "BeMade" } },
  { id: "n2", content: "Chiede sconto sulla posa", created_at: "2026-09-20T12:00:00Z", profiles: [{ first_name: "Antonella", last_name: "BeMade" }] },
  { id: "n3", content: "NON RISPONDE", created_at: "2026-08-12T09:46:25Z", profiles: null },
];

function builder(tabella: string) {
  const filtri: string[] = [];
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) {
    b[m] = (...args: unknown[]) => {
      filtri.push(`${m}(${args.map((a) => JSON.stringify(a)).join(",")})`);
      return b;
    };
  }
  b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
    registro.push(`${tabella} ${filtri.join(" ")}`);
    return Promise.resolve({ data: tabella === "marketing_contact_notes" ? NOTE : [], error: null }).then(ok, ko);
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => builder(t) } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, effectiveCompany: { id: BEMADE } }) }));

import { OpportunityCard } from "@/components/opportunities/OpportunityCard";
import { CardFieldPreferencesProvider } from "@/hooks/useCardFieldPreferences";
import { TooltipProvider } from "@/components/ui/tooltip";

function opportunita(notes_count: number) {
  const adesso = new Date().toISOString();
  return {
    id: OPP,
    stage_id: "fase-1",
    status: "open",
    name: "Daniela Ba",
    contact_id: "contatto-daniela",
    marketing_contacts: { id: "contatto-daniela", first_name: "Daniela", last_name: "Ba", city: "Monza", phone: null as string | null, created_at: adesso, last_activity_at: null as string | null },
    notes_count,
    documents_count: 0,
    next_appointment: null as { date: string; time: string | null } | null,
    tags: [] as string[],
    updated_at: adesso,
    stage_changed_at: adesso,
  };
}

function monta(notes_count: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <TooltipProvider delayDuration={0}>
          <CardFieldPreferencesProvider>
            <OpportunityCard opportunity={opportunita(notes_count)} />
          </CardFieldPreferencesProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/** Il pulsante delle note è l'unico con un contatore, nella card di prova. */
function pulsanteNote(conteggio: number) {
  return screen.getByText(String(conteggio), { selector: "span" }).closest("button")!;
}

beforeEach(() => {
  registro.length = 0;
  localStorage.clear();
});
afterEach(cleanup);

describe("anteprima degli appunti sulla card del kanban", () => {
  it("non carica niente finché il riquadro resta chiuso", () => {
    monta(5);
    expect(registro).toEqual([]);
  });

  it("mostra le ultime note con data, ora e autore, e quante ne restano", async () => {
    monta(5);
    fireEvent.focus(pulsanteNote(5));

    expect((await screen.findAllByText("Richiamare lunedì mattina")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Appunti (5)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Chiede sconto sulla posa").length).toBeGreaterThan(0);
    expect(screen.getAllByText("NON RISPONDE").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^23\/09\/2026, \d{2}:00 · Venusia BeMade$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^20\/09\/2026, \d{2}:00 · Antonella BeMade$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^12\/08\/2026, \d{2}:46 · Importata o automatica$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("+2 altre").length).toBeGreaterThan(0);

    // Le note di QUESTA opportunità, le più recenti, al massimo tre: quelle che conta il numero sulla card.
    expect(registro).toHaveLength(1);
    expect(registro[0]).toContain(`eq("company_id","${BEMADE}")`);
    expect(registro[0]).toContain(`eq("opportunity_id","${OPP}")`);
    expect(registro[0]).toContain(`order("created_at",{"ascending":false})`);
    expect(registro[0]).toContain("limit(3)");
  });

  it("senza note resta «Appunti» e non chiede niente al database", () => {
    const { container } = monta(0);
    // Non per ruolo: anche la card intera ha role="button" (drag&drop) e contiene l'icona.
    fireEvent.focus(container.querySelector(".lucide-sticky-note")!.closest("button")!);
    expect(screen.getAllByText("Appunti").length).toBeGreaterThan(0);
    expect(registro).toEqual([]);
  });
});
