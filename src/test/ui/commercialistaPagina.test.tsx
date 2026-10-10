/**
 * Persone & Accessi → Commercialista, 10/10/2026.
 *
 *  - Le sette caselle dei «permessi specifici» (finanza, documenti, controllo di
 *    gestione, cantieri, richieste, esportazioni, scrittura) non le legge
 *    nessuno: né il portale studio, né le policy, né le funzioni del database.
 *    Promettevano un controllo che non c'è: tolte. Conta il livello di accesso.
 *  - Sospendere/revocare/riattivare chiedeva conferma col `window.confirm` del
 *    browser: ora la finestra dell'app.
 *  - «Con approvazione» dice la verità: per ora il portale non manda richieste.
 *  - La coda delle richieste non dice più che l'approvazione «applica
 *    immediatamente al sistema»: non applica niente da sola.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const stato = vi.hoisted(() => ({
  deleghe: [] as Array<Record<string, unknown>>,
  erroreElenco: null as unknown,
  rispostaFunzione: { data: { success: true } as unknown, error: null as unknown },
  chiamate: [] as Array<{ nome: string; body: Record<string, unknown> }>,
  toasts: [] as Array<{ title?: string; description?: string }>,
  richieste: [] as Array<Record<string, unknown>>,
  decisioni: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async () => ({ data: stato.erroreElenco ? null : stato.deleghe, error: stato.erroreElenco }),
    functions: {
      invoke: async (nome: string, opzioni: { body: Record<string, unknown> }) => {
        stato.chiamate.push({ nome, body: opzioni.body });
        return stato.rispostaFunzione;
      },
    },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" } }) }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: (o: { title?: string; description?: string }) => stato.toasts.push(o) }),
}));
vi.mock("@/hooks/accountant/useAccountantChangeRequests", () => ({
  useCompanyPendingChangeRequests: () => ({ data: stato.richieste, isLoading: false }),
  useDecideChangeRequest: () => ({
    isPending: false,
    mutateAsync: async (v: Record<string, unknown>) => { stato.decisioni.push(v); },
  }),
}));

Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  setPointerCapture: () => {},
  scrollIntoView: () => {},
});

import { AccountantAccessTab } from "@/components/settings/AccountantAccessTab";
import { AccountantChangeRequestsQueue } from "@/components/settings/AccountantChangeRequestsQueue";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { previewPayload, nomeCampo } from "@/lib/commercialista/anteprimaRichiesta";
import { ACCESS_MODE_OPTIONS } from "@/lib/commercialista/livelliAccesso";

const STUDIO = {
  access_id: "a1",
  firm_id: "f1",
  firm_name: "Studio Bianchi",
  firm_vat: "01234567890",
  owner_email: "bianchi@studio.it",
  invited_email: "bianchi@studio.it",
  status: "active",
  access_mode: "operational",
  permissions: {},
  invited_at: "2026-09-01T10:00:00Z",
  accepted_at: "2026-09-02T10:00:00Z",
  notes: null as unknown,
};

function pagina(soloLettura?: boolean) {
  return render(
    <ConfirmProvider>
      <AccountantAccessTab {...(soloLettura === undefined ? {} : { soloLettura })} />
    </ConfirmProvider>,
  );
}

async function apriMenuDelloStudio() {
  const menu = await screen.findByRole("button", { name: "Azioni per Studio Bianchi" });
  fireEvent.keyDown(menu, { key: "Enter" });
}

let confirmNativa: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  stato.deleghe = [STUDIO];
  stato.erroreElenco = null;
  stato.rispostaFunzione = { data: { success: true }, error: null as unknown };
  stato.chiamate = [];
  stato.toasts = [];
  stato.richieste = [];
  stato.decisioni = [];
  confirmNativa = vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Commercialista: invito", () => {
  async function apriInvito() {
    pagina();
    fireEvent.click(await screen.findByRole("button", { name: "Invita il commercialista" }));
    return await screen.findByRole("dialog");
  }

  it("non offre più le sette caselle dei permessi specifici", async () => {
    const dialogo = await apriInvito();
    expect(within(dialogo).queryByText(/Permessi specifici/)).toBeNull();
    expect(within(dialogo).queryByText(/Finanza & tesoreria/)).toBeNull();
    expect(within(dialogo).queryByText(/Azioni di scrittura/)).toBeNull();
    expect(within(dialogo).queryByText(/abilitano le aree corrispondenti/)).toBeNull();
    expect(within(dialogo).queryAllByRole("checkbox")).toHaveLength(0);
    // Resta il livello di accesso: è quello che il portale legge davvero.
    expect(within(dialogo).getByText("Livello di accesso")).toBeVisible();
  });

  it("l'invito parte comunque con il livello scelto e i permessi di riferimento", async () => {
    const dialogo = await apriInvito();
    fireEvent.change(within(dialogo).getByLabelText("Email commercialista"), { target: { value: "Nuovo@Studio.it" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Manda l'invito" }));
    await waitFor(() => expect(stato.chiamate.length).toBe(1));
    const { nome, body } = stato.chiamate[0];
    expect(nome).toBe("invite-accountant-to-company");
    expect(body.accountant_email).toBe("nuovo@studio.it");
    expect(body.access_mode).toBe("read_only");
    expect(body.permissions).toMatchObject({ finance: true, documents: true, write_actions: false });
  });

  // Si prova l'elenco dei livelli, non la tendina: aprire una tendina dentro una
  // finestra, con l'albero npm di questo progetto, fa litigare i due «focus scope»
  // di Radix all'infinito (vedi anche modelliPermessiEControlloAccessi.test.tsx).
  it("«Con approvazione» dice che per ora il portale non manda richieste; «Operativo» dice cosa sblocca", () => {
    const descrizione = (valore: string) => ACCESS_MODE_OPTIONS.find((o) => o.value === valore)?.description;
    expect(descrizione("approval_required")).toMatch(/Per ora guarda soltanto, come in «Solo lettura»/);
    expect(descrizione("operational")).toMatch(/commesse, magazzino, clienti e ticket/);
    expect(descrizione("read_only")).toMatch(/non cambia niente/);
    expect(ACCESS_MODE_OPTIONS.map((o) => o.label)).toEqual(["Solo lettura", "Operativo", "Con approvazione"]);
  });

  it("nella finestra d'invito il livello scelto all'inizio è «Solo lettura» e se ne legge la descrizione", async () => {
    const dialogo = await apriInvito();
    expect(within(dialogo).getByRole("combobox", { name: /Livello di accesso/ })).toHaveTextContent(/Solo lettura.*non cambia niente/);
  });

  it("l'errore del server arriva in italiano", async () => {
    stato.rispostaFunzione = {
      data: null as unknown,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { json: async () => ({ error: "Solo titolare o admin dell'azienda può invitare un commercialista" }) },
      },
    };
    const dialogo = await apriInvito();
    fireEvent.change(within(dialogo).getByLabelText("Email commercialista"), { target: { value: "studio@esempio.it" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Manda l'invito" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("Solo titolare o admin dell'azienda può invitare un commercialista");
    expect(within(dialogo).queryByText(/non-2xx/)).toBeNull();
  });
});

describe("Commercialista: sospendere, riattivare, revocare", () => {
  it("la revoca chiede conferma con la finestra dell'app, non con quella del browser", async () => {
    pagina();
    await apriMenuDelloStudio();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Revoca l'accesso/ }));
    const finestra = await screen.findByRole("alertdialog");
    expect(within(finestra).getByText("Revocare l'accesso a «Studio Bianchi»?")).toBeVisible();
    expect(confirmNativa).not.toHaveBeenCalled();
    expect(stato.chiamate).toHaveLength(0);
    fireEvent.click(within(finestra).getByRole("button", { name: "Revoca l'accesso" }));
    await waitFor(() => expect(stato.chiamate).toHaveLength(1));
    expect(stato.chiamate[0]).toEqual({ nome: "update-accountant-company-access", body: { access_id: "a1", action: "revoke" } });
  });

  it("annullando nella finestra non parte nessuna richiesta", async () => {
    pagina();
    await apriMenuDelloStudio();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Sospendi/ }));
    const finestra = await screen.findByRole("alertdialog");
    fireEvent.click(within(finestra).getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(stato.chiamate).toHaveLength(0);
  });

  it("un errore della funzione si legge in italiano nell'avviso", async () => {
    stato.rispostaFunzione = {
      data: null as unknown,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { json: async () => ({ error: "Unauthorized" }) },
      },
    };
    pagina();
    await apriMenuDelloStudio();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Sospendi/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Sospendi" }));
    await waitFor(() => expect(stato.toasts.length).toBe(1));
    expect(stato.toasts[0].description).toBe("Sessione scaduta. Accedi di nuovo per continuare.");
  });
});

describe("Commercialista: elenco e sola lettura", () => {
  it("se l'elenco non si legge lo dice, con «Riprova», e non finge che non ci sia nessuno", async () => {
    stato.erroreElenco = { message: "boom" };
    pagina();
    expect(await screen.findByRole("alert")).toHaveTextContent("Non riesco a leggere le deleghe");
    expect(screen.queryByText(/Nessuno studio collegato/)).toBeNull();
    stato.erroreElenco = null;
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("Studio Bianchi")).toBeVisible();
  });

  it("chi guarda soltanto non può invitare né agire sulle deleghe", async () => {
    pagina(true);
    expect(await screen.findByText("Studio Bianchi")).toBeVisible();
    expect(screen.getByRole("button", { name: "Invita il commercialista" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Azioni per Studio Bianchi" })).toBeDisabled();
  });

  it("il menu delle azioni ha un nome per chi usa uno screen reader", async () => {
    pagina();
    expect(await screen.findByRole("button", { name: "Azioni per Studio Bianchi" })).toBeEnabled();
  });
});

describe("Coda delle richieste del commercialista", () => {
  const RICHIESTA = {
    id: "q1",
    company_id: "c1",
    requested_by: "u1",
    firm_id: "f1",
    resource_type: "costo",
    resource_id: null as unknown,
    operation: "create",
    payload: { amount: 120, due_date: "2026-11-01", supplier_name: "Rossi Srl", paid: false },
    status: "pending",
    decided_by: null as unknown,
    decided_at: null as unknown,
    decision_note: null as unknown,
    expires_at: "2026-10-17T10:00:00Z",
    created_at: "2026-10-10T10:00:00Z",
  };

  it("mostra i campi con parole italiane, non i nomi delle colonne", () => {
    expect(previewPayload(RICHIESTA.payload)).toBe("Importo: 120 · Scadenza: 2026-11-01 · Supplier name: Rossi Srl · Paid: no");
    expect(nomeCampo("vat_rate")).toBe("Aliquota IVA");
    expect(previewPayload({})).toBe("—");
    expect(previewPayload({ nota: "x".repeat(200) })).toMatch(/^Nota: x{77}…$/);
  });

  it("approvare non promette che la modifica si applichi da sola", async () => {
    stato.richieste = [RICHIESTA];
    render(<AccountantChangeRequestsQueue />);
    expect(await screen.findByText(/Importo: 120 · Scadenza: 2026-11-01/)).toBeVisible();
    expect(screen.queryByText(/due_date/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Approva: Crea costo" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText(/La modifica non si applica da sola/)).toBeVisible();
    expect(within(dialogo).queryByText(/immediatamente al sistema/)).toBeNull();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Approva la richiesta" }));
    await waitFor(() => expect(stato.decisioni).toHaveLength(1));
    expect(stato.decisioni[0]).toMatchObject({ requestId: "q1", decision: "approved" });
  });

  it("i pulsanti dicono su quale richiesta agiscono", async () => {
    stato.richieste = [RICHIESTA, { ...RICHIESTA, id: "q2", resource_type: "prima_nota", operation: "update" }];
    render(<AccountantChangeRequestsQueue />);
    expect(await screen.findByRole("button", { name: "Rifiuta: Crea costo" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Rifiuta: Modifica prima nota" })).toBeVisible();
  });
});
