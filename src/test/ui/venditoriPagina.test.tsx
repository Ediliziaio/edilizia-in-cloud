/**
 * Persone & Accessi → Venditori, 10/10/2026.
 *
 *  - Chi non è amministratore la vede ma non può scrivere (la tabella
 *    `salespeople` la scrive solo l'amministratore): i pulsanti che avrebbero
 *    risposto con un rifiuto sono spenti, invece di fallire a clic fatto.
 *  - Le icone hanno un nome («Modifica Mario Rossi»), non solo un `title`.
 *  - «Crea l'accesso»: l'errore del server arriva in italiano, e la password
 *    temporanea non promette «dovrà cambiarla» (la email dice solo «ti
 *    consigliamo»).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const stato = vi.hoisted(() => ({
  venditori: [] as Array<Record<string, unknown>>,
  rispostaCreaAccesso: { data: null as unknown, error: null as unknown },
  erroreElimina: null as unknown,
  toasts: [] as Array<{ tipo: string; testo: string }>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const catena = () => {
    let modo = "select";
    const b: Record<string, unknown> = {};
    for (const metodo of ["select", "eq", "order"]) b[metodo] = () => b;
    b.delete = () => { modo = "delete"; return b; };
    b.update = () => { modo = "update"; return b; };
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
      Promise.resolve(
        modo === "delete" ? { data: null as unknown, error: stato.erroreElimina }
          : modo === "update" ? { data: null as unknown, error: null as unknown }
          : { data: stato.venditori, error: null as unknown },
      ).then(ok, ko);
    return b;
  };
  return {
    supabase: {
      from: () => catena(),
      functions: { invoke: async () => stato.rispostaCreaAccesso },
    },
  };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" } }) }));
vi.mock("sonner", () => ({
  toast: {
    success: (testo: string) => stato.toasts.push({ tipo: "ok", testo }),
    error: (testo: string) => stato.toasts.push({ tipo: "errore", testo }),
    info: (testo: string) => stato.toasts.push({ tipo: "info", testo }),
  },
}));

Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  setPointerCapture: () => {},
  scrollIntoView: () => {},
});

import { SalespeopleConfig } from "@/components/settings/SalespeopleConfig";

const MARIO = {
  id: "s1",
  first_name: "Mario",
  last_name: "Rossi",
  email: "mario@esempio.it",
  phone: null as unknown,
  compensation_mode: "only_commission",
  fixed_monthly_eur: 0,
  commission_type: "percentage_sold",
  commission_value: 3,
  is_active: true,
  user_id: null as unknown,
};

function pagina(soloLettura?: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SalespeopleConfig {...(soloLettura === undefined ? {} : { soloLettura })} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  stato.venditori = [MARIO];
  stato.rispostaCreaAccesso = { data: { success: true, temp_password: "Tmp-Pass-1234" }, error: null as unknown };
  stato.erroreElimina = null;
  stato.toasts = [];
});
afterEach(cleanup);

describe("Venditori: sola lettura onesta", () => {
  it("chi può scrivere ha tutti i pulsanti accesi", async () => {
    pagina();
    expect(await screen.findByText("Mario Rossi")).toBeVisible();
    expect(screen.getByRole("button", { name: "Nuovo venditore" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Modifica Mario Rossi" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Elimina Mario Rossi" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Crea l'accesso per Mario Rossi" })).toBeEnabled();
    expect(screen.getByRole("switch", { name: "Mario Rossi: attivo" })).toBeEnabled();
  });

  it("chi guarda soltanto vede l'elenco ma non può cambiare niente", async () => {
    pagina(true);
    expect(await screen.findByText("Mario Rossi")).toBeVisible();
    expect(screen.getByRole("button", { name: "Nuovo venditore" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Modifica Mario Rossi" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Elimina Mario Rossi" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Crea l'accesso per Mario Rossi" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Mario Rossi: attivo" })).toBeDisabled();
    // Le regole si possono sempre aprire e leggere.
    expect(screen.getByRole("button", { name: /Regole provvigioni/ })).toBeEnabled();
  });

  it("spiega che le regole provvigioni per ora non cambiano le provvigioni delle commesse", async () => {
    pagina();
    expect(await screen.findByText(/non cambiano le provvigioni delle commesse/)).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Venditori" })).toBeVisible();
  });
});

describe("Venditori: crea l'accesso", () => {
  async function apriCreaAccesso() {
    pagina();
    fireEvent.click(await screen.findByRole("button", { name: "Crea l'accesso per Mario Rossi" }));
    return await screen.findByRole("dialog");
  }

  it("l'errore del server arriva in italiano, non «Only company admins…»", async () => {
    stato.rispostaCreaAccesso = { data: null as unknown, error: { message: "Only company admins can create staff users" } };
    const dialogo = await apriCreaAccesso();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Crea l'accesso" }));
    await waitFor(() => expect(stato.toasts.some((t) => t.tipo === "errore")).toBe(true));
    const errore = stato.toasts.find((t) => t.tipo === "errore")!.testo;
    expect(errore).toBe("Solo un amministratore può creare nuovi utenti.");
    expect(errore).not.toMatch(/Only company admins/);
  });

  it("la password temporanea non promette un cambio obbligatorio", async () => {
    const dialogo = await apriCreaAccesso();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Crea l'accesso" }));
    expect(await screen.findByText("Tmp-Pass-1234")).toBeVisible();
    expect(screen.getByText(/gli è arrivata anche per email/)).toBeVisible();
    expect(screen.getByText(/Gli consigliamo di cambiarla al primo accesso/)).toBeVisible();
    expect(screen.queryByText(/Dovrà cambiarla/)).toBeNull();
    expect(screen.getByRole("button", { name: "Copia la password" })).toBeVisible();
  });

  it("usa la stessa dicitura degli altri editor per la visibilità sui dati", async () => {
    const dialogo = await apriCreaAccesso();
    expect(within(dialogo).getByLabelText("Solo i dati assegnati a lui")).toBeVisible();
    expect(within(dialogo).queryByText(/Solo elementi assegnati/)).toBeNull();
  });
});

describe("Venditori: eliminare", () => {
  it("se ha commesse collegate dice cosa fare (disattivarlo)", async () => {
    stato.erroreElimina = { message: 'update or delete on table "salespeople" violates foreign key constraint "order_salespeople_salesperson_id_fkey"' };
    pagina();
    fireEvent.click(await screen.findByRole("button", { name: "Elimina Mario Rossi" }));
    fireEvent.click(await screen.findByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(stato.toasts.some((t) => t.tipo === "errore")).toBe(true));
    expect(stato.toasts.find((t) => t.tipo === "errore")!.testo).toMatch(/Disattivalo/);
  });
});
