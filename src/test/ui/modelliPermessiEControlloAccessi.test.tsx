/**
 * Persone & Accessi → «Modelli di permessi» e «Controllo accessi», 10/10/2026.
 *
 *  - «Template Permessi» → «Modelli di permessi»: pulsanti col nome (prima solo
 *    icone), etichette collegate ai campi, errori in italiano, e togliendo
 *    «Visualizza» si toglie anche «Modifica» (negli altri editor già era così).
 *  - «Sicurezza accessi» → «Controllo accessi»: parole da titolare (niente
 *    «Score», «2FA», «lock»), «Collegato adesso» solo con un segno di vita
 *    recente (prima «N sessioni attive» contava sessioni dimenticate aperte),
 *    il pulsante «Apri la scheda» solo a chi può aprirla.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const adesso = Date.now();
const giorniFa = (g: number) => new Date(adesso - g * 86_400_000).toISOString();
const minutiFa = (m: number) => new Date(adesso - m * 60_000).toISOString();

const stato = vi.hoisted(() => ({
  modelli: [] as Array<Record<string, unknown>>,
  rispostaApplica: { data: { ok: true } as unknown, error: null as unknown },
  erroreElimina: null as unknown,
  chiamateFunzione: [] as Array<Record<string, unknown>>,
  toasts: [] as Array<{ title?: string; description?: string }>,
  // controllo accessi
  profili: [] as Array<Record<string, unknown>>,
  ruoli: [] as Array<Record<string, unknown>>,
  sessioni: [] as Array<Record<string, unknown>>,
  accessiAltreAziende: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string) => {
    const b: Record<string, unknown> = {};
    let eliminando = false;
    for (const metodo of ["select", "eq", "or", "in", "order", "limit"]) b[metodo] = () => b;
    b.delete = () => { eliminando = true; return b; };
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
      if (eliminando) return Promise.resolve({ data: null as unknown, error: stato.erroreElimina }).then(ok, ko);
      let data: unknown[] = [];
      if (tabella === "permission_templates") data = stato.modelli;
      else if (tabella === "profiles") data = stato.profili;
      else if (tabella === "user_roles") data = stato.ruoli;
      else if (tabella === "user_sessions") data = stato.sessioni;
      else if (tabella === "multi_company_access") data = stato.accessiAltreAziende;
      return Promise.resolve({ data, error: null as unknown }).then(ok, ko);
    };
    return b;
  };
  return {
    supabase: {
      from: (tabella: string) => catena(tabella),
      rpc: () => ({ then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null as unknown }).then(ok) }),
      functions: {
        invoke: async (_nome: string, opzioni: { body: Record<string, unknown> }) => {
          stato.chiamateFunzione.push(opzioni.body);
          return stato.rispostaApplica;
        },
      },
    },
  };
});
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    effectiveCompany: { id: "c1" },
    profile: { id: "u1", first_name: "Anna", last_name: "Neri", email: "anna@x.it", require_2fa: false, last_login_at: giorniFa(100), locked_until: null as unknown },
    role: "company_admin",
  }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: (o: { title?: string; description?: string }) => stato.toasts.push(o) }),
}));

Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  setPointerCapture: () => {},
  scrollIntoView: () => {},
});

import { PermissionTemplatesManager } from "@/components/settings/PermissionTemplatesManager";
import { AccessGovernancePanel } from "@/components/settings/AccessGovernancePanel";
import { ALL_PERMISSION_SECTIONS, DEFAULT_PERMISSIONS, commutaPermesso } from "@/components/users/permissionsDefaults";

function dentro(figlio: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{figlio}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const MODELLO = {
  id: "m1",
  name: "Venditore nuovo",
  description: null as unknown,
  permissions: { ...DEFAULT_PERMISSIONS, can_view_marketing_contacts: true },
  is_system_default: false,
  company_id: "c1",
  created_at: "2026-08-11T10:00:00Z",
};

beforeEach(() => {
  stato.modelli = [MODELLO];
  stato.rispostaApplica = { data: { ok: true }, error: null as unknown };
  stato.erroreElimina = null;
  stato.chiamateFunzione = [];
  stato.toasts = [];
  stato.profili = [];
  stato.ruoli = [];
  stato.sessioni = [];
  stato.accessiAltreAziende = [];
});
afterEach(cleanup);

describe("Modelli di permessi", () => {
  it("titolo, frase e pulsanti con il loro nome", async () => {
    dentro(<PermissionTemplatesManager />);
    expect(await screen.findByRole("heading", { level: 2, name: "Modelli di permessi" })).toBeVisible();
    expect(screen.getByText(/Un modello è un gruppo di permessi già pronto/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Nuovo modello" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Applica il modello «Venditore nuovo» a una persona" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Duplica il modello «Venditore nuovo»" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Modifica il modello «Venditore nuovo»" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Elimina il modello «Venditore nuovo»" })).toBeVisible();
    expect(screen.queryByText(/Template/)).toBeNull();
  });

  it("senza modelli lo dice invece di restare vuota", async () => {
    stato.modelli = [];
    dentro(<PermissionTemplatesManager />);
    expect(await screen.findByText(/Nessun modello ancora/)).toBeVisible();
  });

  // Il modello elenca un centinaio di permessi: con tanti elementi le ricerche per
  // ruolo (getByRole) sono lente in jsdom, qui si cerca per etichetta.
  it("nel modello i campi sono collegati alle loro etichette", async () => {
    dentro(<PermissionTemplatesManager />);
    fireEvent.click(await screen.findByRole("button", { name: "Nuovo modello" }));
    expect(await screen.findByLabelText("Nome")).toBeVisible();
    expect(screen.getByLabelText("Descrizione")).toBeVisible();
  });

  // Non si clicca la casella: in jsdom il clic su un pulsante dentro una <label>
  // si richiama all'infinito (nel browser vero no). La regola è una funzione pura;
  // qui si prova quella e lo stato delle caselle appena si apre il modello.
  it("togliendo «Visualizza» si toglie anche «Modifica»", () => {
    const sezione = ALL_PERMISSION_SECTIONS.find((s) => s.editKey)!;
    const vede = sezione.viewKey as string;
    const modifica = sezione.editKey as string;
    const acceso = { ...DEFAULT_PERMISSIONS, [vede]: true, [modifica]: true } as unknown as Record<string, boolean>;
    const spento = commutaPermesso(acceso, vede);
    expect(spento[vede]).toBe(false);
    expect(spento[modifica]).toBe(false);
    // Accendere «Visualizza» non accende «Modifica» da sola.
    const riacceso = commutaPermesso(spento, vede);
    expect(riacceso[vede]).toBe(true);
    expect(riacceso[modifica]).toBe(false);
    // Spegnere «Modifica» non tocca «Visualizza».
    const soloVede = commutaPermesso(acceso, modifica);
    expect(soloVede[vede]).toBe(true);
    expect(soloVede[modifica]).toBe(false);
    // Il resto dell'elenco non cambia.
    expect(spento.can_view_orders).toBe(acceso.can_view_orders);
  });

  it("nel modello nuovo «Modifica» resta spenta finché non si accende «Visualizza»", async () => {
    const sezione = ALL_PERMISSION_SECTIONS.find((s) => s.editKey)!;
    dentro(<PermissionTemplatesManager />);
    fireEvent.click(await screen.findByRole("button", { name: "Nuovo modello" }));
    const vede = await screen.findByLabelText(`${sezione.label}: vedere`);
    const modifica = screen.getByLabelText(`${sezione.label}: modificare`);
    expect(vede).not.toBeDisabled();
    expect(modifica).toBeDisabled();
  });

  it("applicare dice che i permessi attuali vengono sostituiti", async () => {
    stato.profili = [{ id: "p1", first_name: "Luca", last_name: "Verdi", email: "luca@x.it" }];
    dentro(<PermissionTemplatesManager />);
    fireEvent.click(await screen.findByRole("button", { name: "Applica il modello «Venditore nuovo» a una persona" }));
    expect(await screen.findByText(/I suoi permessi attuali vengono sostituiti con quelli del modello/)).toBeVisible();
    expect(screen.getByLabelText("Persona")).toBeVisible();
  });

  // (Nessun test apre una tendina dentro una finestra: con l'albero npm di questo
  // progetto i due «focus scope» di Radix si contendono il fuoco all'infinito.
  // La traduzione delle frasi del server è provata in erroriPersone.test.ts.)
  it("se l'eliminazione non riesce lo dice in italiano, senza il testo del database", async () => {
    stato.erroreElimina = { message: 'new row violates row-level security policy for table "permission_templates"', code: "42501" };
    dentro(<PermissionTemplatesManager />);
    fireEvent.click(await screen.findByRole("button", { name: "Elimina il modello «Venditore nuovo»" }));
    fireEvent.click(await screen.findByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(stato.toasts.length).toBe(1));
    expect(stato.toasts[0].title).toBe("Non sono riuscito a eliminare il modello");
    expect(stato.toasts[0].description).toBeTruthy();
    expect(stato.toasts[0].description).not.toMatch(/row-level|policy|violates/i);
  });
});

describe("Controllo accessi", () => {
  function preparaDueUtenti() {
    stato.profili = [
      { id: "u1", first_name: "Anna", last_name: "Neri", email: "anna@x.it", company_id: "c1", require_2fa: false, last_login_at: giorniFa(100), locked_until: null as unknown, is_blocked: false },
      { id: "u2", first_name: "Paolo", last_name: "Gialli", email: "paolo@x.it", company_id: "c1", require_2fa: true, last_login_at: giorniFa(3), locked_until: null as unknown, is_blocked: false },
    ];
    stato.ruoli = [
      { user_id: "u1", role: "company_admin" },
      { user_id: "u2", role: "employee" },
    ];
    // Anna ha due sessioni rimaste aperte da settimane; Paolo è attivo da 2 minuti.
    stato.sessioni = [
      { user_id: "u1", last_active_at: giorniFa(40) },
      { user_id: "u1", last_active_at: giorniFa(41) },
      { user_id: "u2", last_active_at: minutiFa(2) },
    ];
  }

  it("parla come un titolare: niente «Score», «2FA», «lock»", async () => {
    preparaDueUtenti();
    dentro(<AccessGovernancePanel />);
    expect(await screen.findByRole("heading", { level: 2, name: "Controllo accessi" })).toBeVisible();
    const testo = document.body.textContent ?? "";
    expect(testo).toMatch(/Punteggio/);
    expect(testo).toMatch(/Persone controllate/);
    expect(testo).toMatch(/Amministratori senza app di verifica/);
    expect(testo).toMatch(/Chi guardare per primo/);
    expect(testo).not.toMatch(/Score|2FA|lock temporanei|Matrice|perimetro|policy RLS/i);
    // La nota onesta: ogni accesso chiede già un codice.
    expect(testo).toMatch(/ogni accesso chiede già un codice/);
  });

  it("«Collegato adesso» solo con un segno di vita recente; le sessioni dimenticate aperte non contano", async () => {
    preparaDueUtenti();
    dentro(<AccessGovernancePanel />);
    const righe = await screen.findAllByRole("row");
    const anna = righe.find((r) => within(r).queryByText("Anna Neri"))!;
    const paolo = righe.find((r) => within(r).queryByText("Paolo Gialli"))!;
    expect(within(paolo).getByText("Collegato adesso")).toBeVisible();
    expect(within(anna).getByText("Non collegato")).toBeVisible();
    expect(within(anna).getByText(/2 sessioni aperte/)).toBeVisible();
    expect(within(anna).queryByText("Collegato adesso")).toBeNull();
    // I ruoli hanno i nomi di tutte le altre schermate.
    expect(within(anna).getByText("Amministratore")).toBeVisible();
    expect(within(paolo).getByText("Operaio / Tecnico")).toBeVisible();
    // E l'amministratore senza app di verifica passa da «Da guardare», con le parole giuste.
    expect(within(anna).getByText("Da guardare")).toBeVisible();
    expect(within(anna).getByText("Amministratore senza app di verifica")).toBeVisible();
    expect(within(paolo).getByText("A posto")).toBeVisible();
  });

  it("«Apri la scheda» c'è solo per chi può aprirla", async () => {
    preparaDueUtenti();
    const senza = dentro(<AccessGovernancePanel />);
    await screen.findByText("Anna Neri");
    expect(screen.queryByRole("button", { name: /Apri la scheda/ })).toBeNull();
    senza.unmount();
    dentro(<AccessGovernancePanel puoAprireScheda />);
    expect(await screen.findByRole("button", { name: "Apri la scheda di Anna Neri" })).toBeVisible();
  });

  it("chi non entra da mesi ma tiene la sessione aperta e la usa non risulta «inattivo»", async () => {
    stato.profili = [
      { id: "u1", first_name: "Anna", last_name: "Neri", email: "anna@x.it", company_id: "c1", require_2fa: true, last_login_at: giorniFa(200), locked_until: null as unknown, is_blocked: false },
    ];
    stato.ruoli = [{ user_id: "u1", role: "company_staff" }];
    stato.sessioni = [{ user_id: "u1", last_active_at: giorniFa(1) }];
    dentro(<AccessGovernancePanel />);
    await screen.findByText("Anna Neri");
    expect(screen.queryByText(/Non entra da/)).toBeNull();
    expect(screen.queryByText(/Inattivo da/)).toBeNull();
  });
});
