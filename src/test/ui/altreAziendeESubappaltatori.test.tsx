/**
 * Persone & Accessi → «Da altre aziende» e «Subappaltatori», 10/10/2026.
 *
 *  - «Da altre aziende» (era «Accessi azienda»): i ruoli hanno gli stessi nomi di
 *    tutte le altre schermate (non «Staff» e «Dipendente»), le tre icone hanno
 *    un nome, la revoca chiede conferma con la finestra dell'app, e l'errore
 *    della funzione non è più «Edge Function returned a non-2xx status code».
 *  - «Subappaltatori»: «Togli l'accesso» chiede conferma (prima toglieva
 *    l'accesso all'app cantiere con un clic); se l'elenco non si carica lo
 *    dice invece di scrivere «nessuna anagrafica»; collegare un'email senza
 *    account non dice «collegato».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const stato = vi.hoisted(() => ({
  // company-access-manage
  accessi: [] as Array<Record<string, unknown>>,
  rispostaAzione: { data: { ok: true } as unknown, error: null as unknown },
  chiamateAccessi: [] as Array<Record<string, unknown>>,
  // subappaltatori
  subappaltatori: [] as Array<Record<string, unknown>>,
  erroreElenco: null as unknown,
  profilo: null as { id: string } | null,
  emailCercate: [] as string[],
  aggiornamenti: [] as Array<Record<string, unknown>>,
  toasts: [] as Array<{ tipo: string; testo: string; descrizione?: string }>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string) => {
    let modo = "select";
    let dati: Record<string, unknown> | null = null;
    const b: Record<string, unknown> = {};
    for (const metodo of ["select", "order"]) b[metodo] = () => b;
    b.eq = (colonna: string, valore: string) => {
      if (tabella === "profiles" && colonna === "email") stato.emailCercate.push(valore);
      return b;
    };
    b.update = (valori: Record<string, unknown>) => { modo = "update"; dati = valori; return b; };
    b.maybeSingle = () => Promise.resolve({ data: stato.profilo, error: null as unknown });
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
      if (modo === "update") {
        stato.aggiornamenti.push({ tabella, ...dati });
        return Promise.resolve({ data: null as unknown, error: null as unknown }).then(ok, ko);
      }
      return Promise.resolve({
        data: stato.erroreElenco ? null : stato.subappaltatori,
        error: stato.erroreElenco,
      }).then(ok, ko);
    };
    return b;
  };
  return {
    supabase: {
      from: (tabella: string) => catena(tabella),
      functions: {
        invoke: async (_nome: string, opzioni: { body: Record<string, unknown> }) => {
          stato.chiamateAccessi.push(opzioni.body);
          if (opzioni.body.action === "list") return { data: { items: stato.accessi }, error: null as unknown };
          return stato.rispostaAzione;
        },
      },
    },
  };
});
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" } }) }));
vi.mock("sonner", () => ({
  toast: Object.assign(
    (testo: string) => stato.toasts.push({ tipo: "neutro", testo }),
    {
      success: (testo: string, o?: { description?: string }) => stato.toasts.push({ tipo: "ok", testo, descrizione: o?.description }),
      error: (testo: string, o?: { description?: string }) => stato.toasts.push({ tipo: "errore", testo, descrizione: o?.description }),
      info: (testo: string) => stato.toasts.push({ tipo: "info", testo }),
    },
  ),
}));

Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  setPointerCapture: () => {},
  scrollIntoView: () => {},
});

import { CompanyAccessManager } from "@/components/settings/CompanyAccessManager";
import { SubappaltatoriTab } from "@/components/settings/SubappaltatoriTab";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

function dentro(figlio: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ConfirmProvider>{figlio}</ConfirmProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

let confirmNativa: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  stato.accessi = [];
  stato.rispostaAzione = { data: { ok: true }, error: null as unknown };
  stato.chiamateAccessi = [];
  stato.subappaltatori = [];
  stato.erroreElenco = null;
  stato.profilo = null;
  stato.emailCercate = [];
  stato.aggiornamenti = [];
  stato.toasts = [];
  confirmNativa = vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const LUCA = {
  id: "acc1",
  user_id: "u9",
  access_role: "company_staff",
  status: "active",
  expires_at: null as unknown,
  invited_email: null as unknown,
  created_at: "2026-09-10T10:00:00Z",
  profile: { first_name: "Luca", last_name: "Verdi", email: "luca@consulenze.it" },
};

describe("Da altre aziende (Accessi azienda)", () => {
  it("i ruoli hanno i nomi di tutte le altre schermate", async () => {
    stato.accessi = [LUCA];
    dentro(<CompanyAccessManager />);
    expect(await screen.findByText("Luca Verdi")).toBeVisible();
    // Il ruolo di Luca è company_staff: «Operatore», non «Staff».
    expect(screen.getByRole("combobox", { name: "Ruolo di Luca Verdi" })).toHaveTextContent("Operatore");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Ruolo" }), { key: "ArrowDown" });
    const nomi = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(nomi).toEqual(["Amministratore", "Venditore", "Call Center", "Operatore", "Operaio / Tecnico", "Subappaltatore"]);
  });

  it("le tre azioni di riga hanno un nome", async () => {
    stato.accessi = [LUCA];
    dentro(<CompanyAccessManager />);
    expect(await screen.findByRole("button", { name: "Sospendi l'accesso di Luca Verdi" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Revoca l'accesso di Luca Verdi" })).toBeVisible();
  });

  it("la revoca chiede conferma con la finestra dell'app e poi parte", async () => {
    stato.accessi = [LUCA];
    dentro(<CompanyAccessManager />);
    fireEvent.click(await screen.findByRole("button", { name: "Revoca l'accesso di Luca Verdi" }));
    const finestra = await screen.findByRole("alertdialog");
    expect(within(finestra).getByText("Revocare l'accesso di Luca Verdi?")).toBeVisible();
    expect(confirmNativa).not.toHaveBeenCalled();
    expect(stato.chiamateAccessi.filter((c) => c.action === "revoke")).toHaveLength(0);
    fireEvent.click(within(finestra).getByRole("button", { name: "Revoca l'accesso" }));
    await waitFor(() => expect(stato.chiamateAccessi.filter((c) => c.action === "revoke")).toHaveLength(1));
    expect(stato.chiamateAccessi.find((c) => c.action === "revoke")).toMatchObject({ access_id: "acc1" });
  });

  it("l'errore della funzione si legge in italiano", async () => {
    stato.accessi = [LUCA];
    stato.rispostaAzione = {
      data: null as unknown,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { json: async () => ({ error: "Only company admins can create staff users" }) },
      },
    };
    dentro(<CompanyAccessManager />);
    fireEvent.click(await screen.findByRole("button", { name: "Sospendi l'accesso di Luca Verdi" }));
    await waitFor(() => expect(stato.toasts.some((t) => t.tipo === "errore")).toBe(true));
    const errore = stato.toasts.find((t) => t.tipo === "errore")!;
    expect(errore.descrizione).toBe("Solo un amministratore può creare nuovi utenti.");
    expect(JSON.stringify(errore)).not.toMatch(/non-2xx/);
  });

  it("chi guarda soltanto non può invitare né cambiare gli accessi", async () => {
    stato.accessi = [LUCA];
    dentro(<CompanyAccessManager soloLettura />);
    expect(await screen.findByText("Luca Verdi")).toBeVisible();
    expect(screen.getByRole("button", { name: "Invita" })).toBeDisabled();
    expect(screen.getByLabelText("Email della persona da collegare")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sospendi l'accesso di Luca Verdi" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Revoca l'accesso di Luca Verdi" })).toBeDisabled();
  });

  it("spiega a cosa serve la scheda con le parole di un titolare", async () => {
    dentro(<CompanyAccessManager />);
    expect(await screen.findByRole("heading", { level: 2, name: "Persone di altre aziende" })).toBeVisible();
    expect(screen.getByText(/un consulente, un'altra tua società/)).toBeVisible();
  });
});

const IMPRESA = {
  id: "sub1",
  ragione_sociale: "Edil Rossi Srl",
  responsabile: "Anna Rossi",
  user_id: "u7",
  user_email: "anna@edilrossi.it",
};
const IMPRESA_SENZA_ACCESSO = { ...IMPRESA, id: "sub2", ragione_sociale: "Posa Verdi", user_id: null as unknown, user_email: null as unknown };

describe("Subappaltatori: account app cantiere", () => {
  it("«Togli l'accesso» chiede conferma e solo dopo toglie il collegamento", async () => {
    stato.subappaltatori = [IMPRESA];
    dentro(<SubappaltatoriTab />);
    fireEvent.click(await screen.findByRole("button", { name: "Togli l'accesso all'app cantiere a Edil Rossi Srl" }));
    const finestra = await screen.findByRole("alertdialog");
    expect(within(finestra).getByText("Togliere l'accesso all'app cantiere a Edil Rossi Srl?")).toBeVisible();
    expect(within(finestra).getByText("Non potrà più entrare finché non lo ricolleghi.")).toBeVisible();
    expect(stato.aggiornamenti).toHaveLength(0);
    fireEvent.click(within(finestra).getByRole("button", { name: "Togli l'accesso" }));
    await waitFor(() => expect(stato.aggiornamenti).toHaveLength(1));
    expect(stato.aggiornamenti[0]).toMatchObject({ tabella: "subappaltatori", user_id: null as unknown, user_email: null as unknown });
  });

  it("annullando nella finestra l'accesso resta", async () => {
    stato.subappaltatori = [IMPRESA];
    dentro(<SubappaltatoriTab />);
    fireEvent.click(await screen.findByRole("button", { name: "Togli l'accesso all'app cantiere a Edil Rossi Srl" }));
    fireEvent.click(await screen.findByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(stato.aggiornamenti).toHaveLength(0);
  });

  it("se l'elenco non si carica lo dice, non scrive «nessuna anagrafica»", async () => {
    stato.erroreElenco = { message: "boom" };
    dentro(<SubappaltatoriTab />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Non riesco a leggere i subappaltatori");
    expect(screen.queryByText(/Nessun subappaltatore in anagrafica/)).toBeNull();
  });

  it("collegare un'email che non ha ancora un account non dice «collegato»", async () => {
    stato.subappaltatori = [IMPRESA_SENZA_ACCESSO];
    stato.profilo = null;
    dentro(<SubappaltatoriTab />);
    fireEvent.click(await screen.findByRole("button", { name: "Collega un account a Posa Verdi" }));
    fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "  Mario.Verdi@Posa.IT " } });
    fireEvent.click(screen.getByRole("button", { name: "Collega" }));
    await waitFor(() => expect(stato.toasts.length).toBeGreaterThan(0));
    expect(stato.emailCercate).toEqual(["mario.verdi@posa.it"]);
    expect(stato.toasts.some((t) => t.tipo === "ok")).toBe(false);
    expect(stato.toasts.find((t) => t.tipo === "info")?.testo).toMatch(/non c'è ancora un account/);
    expect(stato.aggiornamenti[0]).toMatchObject({ user_email: "mario.verdi@posa.it" });
    expect(stato.aggiornamenti[0]).not.toHaveProperty("user_id");
  });

  it("collegare un'email che ha un account lo collega davvero", async () => {
    stato.subappaltatori = [IMPRESA_SENZA_ACCESSO];
    stato.profilo = { id: "u55" };
    dentro(<SubappaltatoriTab />);
    fireEvent.click(await screen.findByRole("button", { name: "Collega un account a Posa Verdi" }));
    fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "mario@posa.it" } });
    fireEvent.click(screen.getByRole("button", { name: "Collega" }));
    await waitFor(() => expect(stato.toasts.some((t) => t.tipo === "ok")).toBe(true));
    expect(stato.aggiornamenti[0]).toMatchObject({ user_id: "u55", user_email: "mario@posa.it" });
  });

  it("chi guarda soltanto non può collegare né togliere", async () => {
    stato.subappaltatori = [IMPRESA, IMPRESA_SENZA_ACCESSO];
    dentro(<SubappaltatoriTab soloLettura />);
    expect(await screen.findByText("Edil Rossi Srl")).toBeVisible();
    expect(screen.getByRole("button", { name: "Togli l'accesso all'app cantiere a Edil Rossi Srl" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Collega un account a Posa Verdi" })).toBeDisabled();
  });

  it("le squadre restano un rimando a Calendari lavori (un posto solo)", async () => {
    dentro(<SubappaltatoriTab />);
    expect(await screen.findByRole("link", { name: /Vai a Calendari lavori/ })).toHaveAttribute(
      "href",
      "/azienda/impostazioni/calendari-lavori?tab=squadre",
    );
  });
});
