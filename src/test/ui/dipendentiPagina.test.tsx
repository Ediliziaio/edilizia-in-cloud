/**
 * Persone & Accessi → Dipendenti, 10/10/2026.
 *
 *  - Un solo titolo (h2: l'h1 lo mette la pagina), non un secondo «Gestione Staff».
 *  - Il «Costo orario» dell'elenco è quello che finisce nelle commesse (tariffa
 *    scritta a mano, oppure lordo più contributi diviso le ore). Prima era il
 *    lordo diviso le ore, senza contributi: un quarto in meno.
 *  - I dipendenti li scrive solo l'amministratore; le squadre esterne anche chi ha
 *    «Configurazione Ordini — Modifica»: chi guarda vede i pulsanti spenti.
 *  - Errori in italiano; «Crea l'accesso» con password nascosta e senza promettere
 *    un cambio obbligatorio.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const stato = vi.hoisted(() => ({
  dipendenti: [] as Array<Record<string, unknown>>,
  squadre: [] as Array<Record<string, unknown>>,
  erroreElimina: null as unknown,
  rispostaCreaAccesso: { data: null as unknown, error: null as unknown },
  toasts: [] as Array<{ tipo: string; testo: string; descrizione?: string }>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string) => {
    let eliminando = false;
    const b: Record<string, unknown> = {};
    for (const metodo of ["select", "eq", "order"]) b[metodo] = () => b;
    b.delete = () => { eliminando = true; return b; };
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
      Promise.resolve(
        eliminando
          ? { data: null as unknown, error: stato.erroreElimina }
          : { data: tabella === "employees" ? stato.dipendenti : stato.squadre, error: null as unknown },
      ).then(ok, ko);
    return b;
  };
  return {
    supabase: {
      from: (tabella: string) => catena(tabella),
      functions: { invoke: async () => stato.rispostaCreaAccesso },
    },
  };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" } }) }));
vi.mock("sonner", () => ({
  toast: {
    success: (testo: string, o?: { description?: string }) => stato.toasts.push({ tipo: "ok", testo, descrizione: o?.description }),
    error: (testo: string, o?: { description?: string }) => stato.toasts.push({ tipo: "errore", testo, descrizione: o?.description }),
  },
}));
vi.mock("@/components/employees/WorkLogsAdminTab", () => ({ WorkLogsAdminTab: () => <p>Rapportini contenuto</p> }));
vi.mock("@/components/employees/EmployeeDialog", () => ({ EmployeeDialog: (): null => null }));
vi.mock("@/components/employees/ExternalTeamDialog", () => ({ ExternalTeamDialog: (): null => null }));
vi.mock("@/components/employees/EmployeeAttachments", () => ({ EmployeeAttachments: (): null => null }));
vi.mock("@/components/employees/ExternalTeamAttachments", () => ({ ExternalTeamAttachments: (): null => null }));

Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  setPointerCapture: () => {},
  scrollIntoView: () => {},
});

// La finestra «Crea l'accesso» ha una lista scorrevole (Radix ScrollArea), che vuole ResizeObserver.
class ResizeObserverFinto {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ResizeObserverFinto;

import Employees from "@/pages/azienda/Employees";

const LUIGI = {
  id: "e1",
  company_id: "c1",
  first_name: "Luigi",
  last_name: "Blu",
  email: "luigi@esempio.it",
  phone: null as unknown,
  gross_salary: 2000,
  net_salary: 1500,
  monthly_hours: 160,
  costo_orario: null as unknown,
  inps_rate: null as unknown,
  is_active: true,
  user_id: null as unknown,
  role_type: "operaio",
  area: "cantiere",
};

function pagina(props: { soloLettura?: boolean; soloLetturaSquadre?: boolean } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Employees {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  stato.dipendenti = [LUIGI];
  stato.squadre = [];
  stato.erroreElimina = null;
  stato.rispostaCreaAccesso = { data: { success: true, temp_password: "Tmp-Pass-9876" }, error: null as unknown };
  stato.toasts = [];
});
afterEach(cleanup);

describe("Dipendenti: titolo e costo orario", () => {
  it("un solo titolo, h2, senza un secondo h1 «Gestione Staff»", async () => {
    pagina();
    expect(await screen.findByRole("heading", { level: 2, name: "Dipendenti e squadre" })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByText("Gestione Staff")).toBeNull();
    expect(screen.getByRole("tab", { name: /Staff interno/ })).toBeVisible();
  });

  it("il costo orario conta anche i contributi, come nelle commesse", async () => {
    // 2.000 € lordi ÷ 160 ore = 12,50 senza contributi; con il 28 % predefinito = 16,00.
    pagina();
    const riga = (await screen.findByText("Luigi Blu")).closest("tr")!;
    expect(within(riga).getByText(/16,00/)).toBeVisible();
    expect(within(riga).queryByText(/12,50/)).toBeNull();
  });

  it("la tariffa scritta a mano vince sul calcolo; un'aliquota propria cambia il calcolo", async () => {
    stato.dipendenti = [
      { ...LUIGI, id: "e2", first_name: "Anna", last_name: "Verde", costo_orario: 21 },
      { ...LUIGI, id: "e3", first_name: "Paolo", last_name: "Gialli", inps_rate: 30 },
    ];
    pagina();
    const anna = (await screen.findByText("Anna Verde")).closest("tr")!;
    const paolo = screen.getByText("Paolo Gialli").closest("tr")!;
    expect(within(anna).getByText(/21,00/)).toBeVisible();
    // 2.000 × 1,30 ÷ 160 = 16,25
    expect(within(paolo).getByText(/16,25/)).toBeVisible();
  });
});

describe("Dipendenti: sola lettura onesta", () => {
  it("chi può scrivere ha tutti i pulsanti accesi", async () => {
    pagina();
    expect(await screen.findByText("Luigi Blu")).toBeVisible();
    expect(screen.getByRole("button", { name: "Nuovo dipendente" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Modifica Luigi Blu" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Elimina Luigi Blu" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Crea l'accesso per Luigi Blu" })).toBeEnabled();
  });

  it("chi guarda soltanto vede l'elenco e i documenti, ma non cambia niente", async () => {
    pagina({ soloLettura: true });
    expect(await screen.findByText("Luigi Blu")).toBeVisible();
    expect(screen.getByRole("button", { name: "Nuovo dipendente" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Modifica Luigi Blu" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Elimina Luigi Blu" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Crea l'accesso per Luigi Blu" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Documenti di Luigi Blu" })).toBeEnabled();
  });

  it("le squadre esterne si spengono a parte: le modifica anche chi ha «Configurazione Ordini — Modifica»", async () => {
    stato.squadre = [{ id: "t1", name: "Posa Nord", contact_name: null as unknown, phone: null as unknown, email: null as unknown, notes: null as unknown, is_active: true, vat_rate: 22 }];
    // Dipendenti in sola lettura, squadre scrivibili.
    const { unmount } = pagina({ soloLettura: true, soloLetturaSquadre: false });
    fireEvent.mouseDown(await screen.findByRole("tab", { name: /Squadre/ }), { button: 0, ctrlKey: false });
    expect(await screen.findByText("Posa Nord")).toBeVisible();
    expect(screen.getByRole("button", { name: "Nuova squadra" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Modifica Posa Nord" })).toBeEnabled();
    unmount();
    // Entrambe in sola lettura.
    pagina({ soloLettura: true, soloLetturaSquadre: true });
    fireEvent.mouseDown(await screen.findByRole("tab", { name: /Squadre/ }), { button: 0, ctrlKey: false });
    expect(await screen.findByText("Posa Nord")).toBeVisible();
    expect(screen.getByRole("button", { name: "Nuova squadra" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Modifica Posa Nord" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Elimina Posa Nord" })).toBeDisabled();
  });
});

describe("Dipendenti: errori e accesso", () => {
  it("se l'eliminazione non riesce lo dice in italiano, senza il testo del database", async () => {
    stato.erroreElimina = { message: 'update or delete on table "employees" violates foreign key constraint "order_labor_employee_fkey"', code: "23503" };
    pagina();
    fireEvent.click(await screen.findByRole("button", { name: "Elimina Luigi Blu" }));
    expect(await screen.findByText("Eliminare Luigi Blu?")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(stato.toasts.some((t) => t.tipo === "errore")).toBe(true));
    const errore = stato.toasts.find((t) => t.tipo === "errore")!;
    expect(errore.testo).toBe("Non sono riuscito a eliminare il dipendente");
    expect(JSON.stringify(errore)).not.toMatch(/violates|foreign key|order_labor/);
    expect(errore.testo).not.toBe("Errore");
  });

  async function apriCreaAccesso() {
    pagina();
    fireEvent.click(await screen.findByRole("button", { name: "Crea l'accesso per Luigi Blu" }));
    return await screen.findByRole("dialog");
  }

  it("la password si scrive nascosta e la dicitura è quella degli altri editor", async () => {
    const dialogo = await apriCreaAccesso();
    expect(within(dialogo).getByText("Crea l'accesso del dipendente")).toBeVisible();
    expect(within(dialogo).getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(within(dialogo).getByLabelText("Solo i dati assegnati a lui")).toBeVisible();
    expect(within(dialogo).queryByText(/Solo elementi assegnati/)).toBeNull();
  });

  it("l'errore del server arriva in italiano", async () => {
    stato.rispostaCreaAccesso = {
      data: null as unknown,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: new Response(JSON.stringify({ error: "Only company admins can create staff users" }), { status: 400 }),
      },
    };
    const dialogo = await apriCreaAccesso();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Crea l'accesso" }));
    await waitFor(() => expect(stato.toasts.some((t) => t.tipo === "errore")).toBe(true));
    const errore = stato.toasts.find((t) => t.tipo === "errore")!;
    expect(errore.testo).toBe("Non sono riuscito a creare l'accesso");
    expect(errore.descrizione).toBe("Solo un amministratore può creare nuovi utenti.");
  });

  it("la password temporanea non promette un cambio obbligatorio", async () => {
    const dialogo = await apriCreaAccesso();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Crea l'accesso" }));
    expect(await within(dialogo).findByText("Tmp-Pass-9876")).toBeVisible();
    expect(within(dialogo).getByText(/gli è arrivata anche per email/)).toBeVisible();
    expect(within(dialogo).getByText(/Gli consigliamo di cambiarla al primo accesso/)).toBeVisible();
    expect(within(dialogo).queryByText(/Dovrà cambiarla/)).toBeNull();
    expect(within(dialogo).getByText("Accesso creato")).toBeVisible();
  });
});
