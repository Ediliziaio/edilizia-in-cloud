import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { oggiRoma } from "@/lib/opportunitaAgenda";

/**
 * Sulla card del kanban appuntamenti e attività sono due icone (24/09/2026,
 * Florin: «gli appuntamenti sono una cosa, le attività sono altre»). Passando
 * sul calendario si leggono gli appuntamenti in programma del contatto; sulle
 * attività quelle da fare di quel contatto in quell'opportunità, col numerino
 * rosso se una è scaduta. Ognuna carica solo le sue, e solo quando si apre.
 */

const BEMADE = "1b4ef4f7-87a6-4313-9ac6-cd53a7c14ce7";
const OPP = "opp-daniela";
const CONTATTO = "contatto-daniela";

const OGGI = oggiRoma();
const tra = (giorni: number) => new Date(Date.parse(`${OGGI}T00:00:00Z`) + giorni * 86_400_000).toISOString().slice(0, 10);

const registro: string[] = [];

const RISPOSTE: Record<string, unknown[]> = {
  appointments: [
    { id: "a1", title: "Visita in showroom", appointment_date: tra(1), appointment_time: "15:30:00", appointment_end_time: "16:30:00", assigned_to: "u-elena", address_city: "Monza", meeting_url: null },
  ],
  tasks: [
    { id: "t1", title: "Richiamare per il preventivo", due_date: tra(-1), assigned_to: "u-venusia" },
    { id: "t2", title: "Mandare il catalogo", due_date: null, assigned_to: null },
  ],
  profiles: [
    { id: "u-venusia", first_name: "Venusia", last_name: "BeMade" },
    { id: "u-elena", first_name: "Elena", last_name: "BeMade" },
  ],
};

function builder(tabella: string) {
  const filtri: string[] = [];
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "gte", "or", "in", "order", "limit"]) {
    b[m] = (...args: unknown[]) => {
      filtri.push(`${m}(${args.map((a) => JSON.stringify(a)).join(",")})`);
      return b;
    };
  }
  b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
    registro.push(`${tabella} ${filtri.join(" ")}`);
    return Promise.resolve({ data: RISPOSTE[tabella] ?? [], error: null }).then(ok, ko);
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => builder(t) } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, effectiveCompany: { id: BEMADE } }) }));

import { OpportunityCard } from "@/components/opportunities/OpportunityCard";
import { CardFieldPreferencesProvider } from "@/hooks/useCardFieldPreferences";
import { TooltipProvider } from "@/components/ui/tooltip";

function opportunita(extra: Record<string, unknown>) {
  const adesso = new Date().toISOString();
  return {
    id: OPP,
    stage_id: "fase-1",
    status: "open",
    name: "Daniela Ba",
    contact_id: CONTATTO,
    marketing_contacts: { id: CONTATTO, first_name: "Daniela", last_name: "Ba", city: "Monza", phone: null as string | null, created_at: adesso, last_activity_at: null as string | null },
    notes_count: 0,
    documents_count: 0,
    next_appointment: null as { date: string; time: string | null } | null,
    tags: [] as string[],
    updated_at: adesso,
    stage_changed_at: adesso,
    ...extra,
  };
}

function monta(extra: Record<string, unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <TooltipProvider delayDuration={0}>
          <CardFieldPreferencesProvider>
            <OpportunityCard opportunity={opportunita(extra)} />
          </CardFieldPreferencesProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const pulsante = (container: HTMLElement, icona: string) => container.querySelector(`.lucide-${icona}`)!.closest("button")!;
const numeroSu = (container: HTMLElement, icona: string) => pulsante(container, icona).querySelector("span");

beforeEach(() => {
  registro.length = 0;
  localStorage.clear();
});
afterEach(cleanup);

describe("appuntamenti e attività sulla card del kanban", () => {
  it("due numerini separati, rosso solo quello delle attività scadute, senza caricare niente", () => {
    const { container } = monta({ agenda: { appuntamenti: 1, attivita: 2, scadute: 1 } });
    expect(numeroSu(container, "calendar")!.textContent).toBe("1");
    expect(numeroSu(container, "calendar")!.className).toContain("bg-primary");
    expect(numeroSu(container, "list-todo")!.textContent).toBe("2");
    expect(numeroSu(container, "list-todo")!.className).toContain("bg-destructive");
    expect(registro).toEqual([]);
  });

  it("sul calendario solo gli appuntamenti, con data, ora, con chi e dove", async () => {
    const { container } = monta({ agenda: { appuntamenti: 1, attivita: 2, scadute: 1 } });
    fireEvent.focus(pulsante(container, "calendar"));

    expect((await screen.findAllByText("domani, 15:30–16:30")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Appuntamenti (1)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Visita in showroom · con Elena BeMade · Monza").length).toBeGreaterThan(0);
    expect(screen.queryByText("Richiamare per il preventivo")).toBeNull();

    // Appuntamenti del contatto da oggi, non annullati, dell'azienda; le attività non si chiedono.
    const appuntamenti = registro.find((r) => r.startsWith("appointments "))!;
    expect(appuntamenti).toContain(`eq("company_id","${BEMADE}")`);
    expect(appuntamenti).toContain(`eq("contact_id","${CONTATTO}")`);
    expect(appuntamenti).toContain(`gte("appointment_date","${OGGI}")`);
    expect(appuntamenti).toContain(`neq("status","annullato")`);
    expect(appuntamenti).toContain("limit(3)");
    expect(registro.some((r) => r.startsWith("tasks "))).toBe(false);
  });

  it("sulle attività solo quelle da fare, con scadenza e a chi sono assegnate", async () => {
    const { container } = monta({ agenda: { appuntamenti: 1, attivita: 2, scadute: 1 } });
    fireEvent.focus(pulsante(container, "list-todo"));

    expect((await screen.findAllByText("Richiamare per il preventivo")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Attività da fare (2)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("scaduta ieri").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/· Venusia BeMade$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mandare il catalogo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("senza scadenza").length).toBeGreaterThan(0);
    expect(screen.queryByText("domani, 15:30–16:30")).toBeNull();

    // Non completate, dell'opportunità o del contatto senza un'altra opportunità, dell'azienda.
    const attivita = registro.find((r) => r.startsWith("tasks "))!;
    expect(attivita).toContain(`eq("company_id","${BEMADE}")`);
    expect(attivita).toContain(`neq("status","completata")`);
    expect(attivita).toContain(`or("opportunity_id.eq.${OPP},and(opportunity_id.is.null,contact_id.eq.${CONTATTO})")`);
    expect(attivita).toContain("limit(4)");
    expect(registro.find((r) => r.startsWith("profiles "))).toContain(`in("id",["u-venusia"])`);
    expect(registro.some((r) => r.startsWith("appointments "))).toBe(false);
  });

  it("senza appuntamenti né attività: nessun numerino e nessuna richiesta", () => {
    const { container } = monta({ agenda: { appuntamenti: 0, attivita: 0, scadute: 0 } });
    expect(numeroSu(container, "calendar")).toBeNull();
    expect(numeroSu(container, "list-todo")).toBeNull();
    fireEvent.focus(pulsante(container, "calendar"));
    expect(screen.getAllByText("Appuntamenti").length).toBeGreaterThan(0);
    fireEvent.focus(pulsante(container, "list-todo"));
    expect(screen.getAllByText("Attività da fare").length).toBeGreaterThan(0);
    expect(registro).toEqual([]);
  });

  it("una scheda aperta da link, senza conteggio, tiene il segno dell'appuntamento", () => {
    const { container } = monta({ next_appointment: { date: tra(2), time: "10:00:00" } });
    expect(numeroSu(container, "calendar")!.textContent).toBe("1");
    expect(numeroSu(container, "list-todo")).toBeNull();
  });
});
