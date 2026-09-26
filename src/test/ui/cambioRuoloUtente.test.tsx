import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * Cambio del ruolo di un utente (21/09/2026).
 *
 * Florin voleva rendere Amministratore una collega di Ener Italia e «non me lo
 * fa modificare». Due guasti insieme:
 *  1. il menu, dopo la scelta, restava sul ruolo vecchio e la conferma
 *     compariva in un riquadro più in basso: sembrava che la scelta non fosse
 *     presa, si riapriva il menu, e il menu aperto copriva la conferma — un
 *     clic lì lo chiude soltanto. Nei log del database: nessun tentativo;
 *  2. la pagina scriveva da sé in user_roles, dove scrive solo il super admin:
 *     per gli amministratori delle aziende il cambio non funzionava mai.
 * Ora il menu mostra subito la scelta, la conferma sta sulla stessa riga, e il
 * cambio lo fa il database (cambia_ruolo_utente, imposta_ruolo_aggiuntivo).
 */

const ELENA = "aab6e41b-ded8-4d12-8c56-6837f22bcf04";
const ENER = "629d91e0-9d56-4736-a030-1e3833cba2ea";
const FLORIN = "1ef07662-2896-46eb-93b1-2b35ba53b808";

// ── Un database finto che registra ogni chiamata ──────────────────────────
const registro: string[] = [];
/** Quello che risponde il database finto: dati e, se c'è, l'errore. */
type Risposta = { data: unknown; error: { message: string; code?: string } | null };
const rpc = vi.fn(async (_nome: string, _args: unknown): Promise<Risposta> => ({ data: { ok: true }, error: null }));
/** L'utente ha la riga in staff_permissions? (i 26 venditori importati di Ener no) */
let rigaPermessi = true;
/** Cosa restituisce il database al salvataggio dei permessi: [] = non ha confermato. */
let confermaPermessi: unknown[] = [{ user_id: ELENA }];

function builder(tabella: string) {
  const stato = { op: "select", filtri: [] as string[] };
  const risposta = (): Risposta => {
    registro.push(`${stato.op.toUpperCase()} ${tabella} ${stato.filtri.join(" ")}`.trim());
    if (stato.op === "upsert" && tabella === "staff_permissions") return { data: confermaPermessi, error: null };
    if (stato.op !== "select") return { data: null, error: null };
    if (tabella === "profiles") {
      return {
        data: { id: ELENA, first_name: "Elena", last_name: "Ener", email: "marketing1@ener.it", phone: null, company_id: ENER, is_blocked: false, failed_login_count: 0, require_2fa: false },
        error: null,
      };
    }
    if (tabella === "user_roles") return { data: [{ role: "company_staff" }, { role: "call_center" }], error: null };
    if (tabella === "companies") return { data: { titolare_user_id: null }, error: null };
    if (tabella === "staff_permissions") return { data: rigaPermessi ? { user_id: ELENA, company_id: ENER } : null, error: null };
    return { data: null, error: null };
  };
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "neq", "order", "limit", "is", "not", "or"]) {
    b[m] = (...args: unknown[]) => {
      if (m !== "select") stato.filtri.push(`${m}(${args.map((a) => JSON.stringify(a)).join(",")})`);
      return b;
    };
  }
  b.delete = () => { stato.op = "delete"; return b; };
  b.insert = (v: unknown) => { stato.op = "insert"; stato.filtri.push(JSON.stringify(v)); return b; };
  b.update = (v: unknown) => { stato.op = "update"; stato.filtri.push(JSON.stringify(v)); return b; };
  b.upsert = (v: unknown) => { stato.op = "upsert"; stato.filtri.push(JSON.stringify(v)); return b; };
  b.single = async () => risposta();
  b.maybeSingle = async () => risposta();
  b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(risposta()).then(ok, ko);
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => builder(t), rpc: (nome: string, args: unknown) => rpc(nome, args) },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isLoading: false, user: { id: FLORIN }, isImpersonating: true, effectiveCompany: { id: ENER } }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isLoading: false, isAdmin: true, canEditSettingsPeople: true }),
}));
vi.mock("@/hooks/useOpportunitiesData", () => ({ usePipelines: () => ({ data: [] as { id: string; name: string }[] }) }));
const toasts: { title?: string; description?: string }[] = [];
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: { title?: string }) => toasts.push(t) }) }));

// Radix Select in jsdom
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  setPointerCapture: () => {},
  scrollIntoView: () => {},
});

import { UserRolesPermissionsTab } from "@/components/users/UserRolesPermissionsTab";
import { DEFAULT_PERMISSIONS, ROLE_PRESETS } from "@/components/users/permissionsDefaults";
import SettingsUserDetail from "@/pages/azienda/settings/SettingsUserDetail";

beforeEach(() => {
  rigaPermessi = true;
  confermaPermessi = [{ user_id: ELENA }];
  registro.length = 0;
  toasts.length = 0;
  rpc.mockClear();
});
afterEach(cleanup);

const TIMEOUT = 30_000;

function elena() {
  return {
    id: ELENA,
    first_name: "Elena",
    last_name: "Ener",
    role: "call_center" as const,
    additionalRoles: [] as ("salesperson" | "call_center")[],
    permissions: { ...DEFAULT_PERMISSIONS },
  };
}

async function scegli(ruolo: RegExp) {
  fireEvent.pointerDown(screen.getByRole("combobox"), { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(await screen.findByRole("option", { name: ruolo }));
}

describe("Scheda utente — il menu del ruolo", () => {
  it("la scelta si vede subito nel menu, e la conferma sta sulla stessa riga", async () => {
    const onChangeRole = vi.fn();
    render(<UserRolesPermissionsTab user={elena()} onSave={vi.fn()} onChangeRole={onChangeRole} />);
    await scegli(/Amministratore/);

    // Il menu dice la scelta, non il ruolo vecchio: era questo a far riaprire il menu.
    expect(screen.getByRole("combobox")).toHaveTextContent("Amministratore");
    // La conferma è accanto al menu (stesso contenitore), non in un riquadro più in basso.
    const riga = screen.getByRole("combobox").parentElement as HTMLElement;
    expect(within(riga).getByRole("button", { name: "Conferma" })).toBeInTheDocument();
    expect(screen.getByText(/Non è ancora salvato/)).toBeInTheDocument();
    // Il vecchio riquadro con tre scelte non c'è più.
    expect(screen.queryByText(/Cambiare il ruolo in/)).toBeNull();
    // Finché non si conferma non parte niente: il ruolo salvato resta quello di prima.
    expect(onChangeRole).not.toHaveBeenCalled();
  }, TIMEOUT);

  it("Amministratore: una sola conferma, senza permessi (vede tutto)", async () => {
    const onChangeRole = vi.fn();
    render(<UserRolesPermissionsTab user={elena()} onSave={vi.fn()} onChangeRole={onChangeRole} />);
    await scegli(/Amministratore/);
    fireEvent.click(screen.getByRole("button", { name: "Conferma" }));
    expect(onChangeRole).toHaveBeenCalledWith("company_admin", null);
  }, TIMEOUT);

  it("un altro ruolo: i permessi del ruolo partono insieme al cambio, o si tengono quelli attuali", async () => {
    const onChangeRole = vi.fn();
    render(<UserRolesPermissionsTab user={elena()} onSave={vi.fn()} onChangeRole={onChangeRole} />);
    await scegli(/Venditore/);
    fireEvent.click(screen.getByRole("button", { name: /Conferma con i permessi del ruolo/ }));
    expect(onChangeRole).toHaveBeenCalledTimes(1);
    const [ruolo, permessi] = onChangeRole.mock.calls[0];
    expect(ruolo).toBe("salesperson");
    expect(permessi).toMatchObject(ROLE_PRESETS.salesperson);

    fireEvent.click(screen.getByRole("button", { name: /tieni i permessi attuali/ }));
    expect(onChangeRole).toHaveBeenLastCalledWith("salesperson", null);
  }, TIMEOUT);

  it("riscegliere il ruolo attuale annulla la scelta in sospeso", async () => {
    render(<UserRolesPermissionsTab user={elena()} onSave={vi.fn()} onChangeRole={vi.fn()} />);
    await scegli(/Amministratore/);
    await scegli(/Call Center/);
    expect(screen.queryByText(/Non è ancora salvato/)).toBeNull();
    expect(screen.getByRole("combobox")).toHaveTextContent("Call Center");
  }, TIMEOUT);
});

describe("Scheda utente — il cambio lo fa il database", () => {
  function pagina() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[`/azienda/impostazioni/utenti/${ELENA}?tab=permissions`]}>
          <Routes>
            <Route path="/azienda/impostazioni/utenti/:userId" element={<SettingsUserDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("Call Center → Amministratore: una chiamata a cambia_ruolo_utente, nessuna scrittura su user_roles", async () => {
    pagina();
    await screen.findByRole("combobox", {}, { timeout: 15_000 });
    await scegli(/Amministratore/);
    registro.length = 0;
    fireEvent.click(screen.getByRole("button", { name: "Conferma" }));

    await waitFor(() => expect(toasts.some((t) => t.title === "Ruolo aggiornato")).toBe(true));
    expect(rpc).toHaveBeenCalledWith("cambia_ruolo_utente", {
      p_user_id: ELENA,
      p_company_id: ENER,
      p_ruolo: "company_admin",
      p_impersonato: true,
    });
    // Nessuna scrittura diretta: né sui ruoli né sul registro (lo scrive la funzione).
    expect(registro.filter((r) => !r.startsWith("SELECT"))).toEqual([]);
  }, 60_000);

  it("se il database rifiuta, si legge il suo motivo, non un generico «Non hai i permessi»", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "È l'ultimo amministratore dell'azienda: nomina prima un altro amministratore.", code: "42501" },
    });
    pagina();
    await screen.findByRole("combobox", {}, { timeout: 15_000 });
    await scegli(/Amministratore/);
    fireEvent.click(screen.getByRole("button", { name: "Conferma" }));

    await waitFor(() => expect(toasts.some((t) => t.title === "Impossibile cambiare il ruolo")).toBe(true));
    const errore = toasts.find((t) => t.title === "Impossibile cambiare il ruolo");
    expect(errore?.description).toBe("È l'ultimo amministratore dell'azienda: nomina prima un altro amministratore.");
  }, 60_000);

  it("con i permessi del ruolo: prima il ruolo, poi i permessi salvati davvero", async () => {
    pagina();
    await screen.findByRole("combobox", {}, { timeout: 15_000 });
    await scegli(/Venditore/);
    registro.length = 0;
    fireEvent.click(screen.getByRole("button", { name: /Conferma con i permessi del ruolo/ }));

    await waitFor(() => expect(toasts.some((t) => t.title === "Ruolo aggiornato")).toBe(true));
    expect(rpc).toHaveBeenCalledWith("cambia_ruolo_utente", expect.objectContaining({ p_ruolo: "salesperson" }));
    const scritture = registro.filter((r) => !r.startsWith("SELECT"));
    expect(scritture).toHaveLength(1);
    expect(scritture[0]).toMatch(/^UPSERT staff_permissions /);
    expect(scritture[0]).toContain(`"user_id":"${ELENA}"`);
    expect(scritture[0]).toContain(`"company_id":"${ENER}"`);
  }, 60_000);
});

describe("Scheda utente — i permessi si salvano anche per chi non ha ancora la riga", () => {
  function pagina() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[`/azienda/impostazioni/utenti/${ELENA}?tab=permissions`]}>
          <Routes>
            <Route path="/azienda/impostazioni/utenti/:userId" element={<SettingsUserDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  async function salvaTutti() {
    await screen.findByRole("combobox", {}, { timeout: 15_000 });
    // «Tutti»: basta un qualunque cambio perché «Salva Permessi» si accenda.
    fireEvent.click(screen.getAllByRole("button", { name: /^Tutti$/ })[0]);
    registro.length = 0;
    fireEvent.click(screen.getByRole("button", { name: /Salva Permessi/ }));
  }

  it("senza riga (i venditori importati di Ener): la riga si crea, non un aggiornamento a vuoto", async () => {
    rigaPermessi = false;
    pagina();
    await salvaTutti();

    await waitFor(() => expect(toasts.some((t) => t.title === "Permessi salvati")).toBe(true));
    const scritture = registro.filter((r) => r.includes("staff_permissions") && !r.startsWith("SELECT"));
    expect(scritture).toHaveLength(1);
    expect(scritture[0]).toMatch(/^UPSERT staff_permissions /);
    expect(scritture[0]).toContain(`"user_id":"${ELENA}"`);
    expect(scritture[0]).toContain(`"company_id":"${ENER}"`);
  }, 60_000);

  it("se il database non conferma, si dice che non è salvato: mai «Permessi salvati» a vuoto", async () => {
    confermaPermessi = [];
    pagina();
    await salvaTutti();

    await waitFor(() => expect(toasts.some((t) => t.title === "Errore salvataggio permessi")).toBe(true));
    expect(toasts.some((t) => t.title === "Permessi salvati")).toBe(false);
    expect(toasts.find((t) => t.title === "Errore salvataggio permessi")?.description).toMatch(/non sono stati salvati/);
  }, 60_000);
});

describe("I ruoli si scrivono solo dal database", () => {
  const SRC = resolve(__dirname, "../..");

  function fileSorgente(dir: string): string[] {
    return readdirSync(dir).flatMap((nome) => {
      const p = join(dir, nome);
      if (statSync(p).isDirectory()) return nome === "test" ? [] : fileSorgente(p);
      return /\.(ts|tsx)$/.test(nome) ? [p] : [];
    });
  }

  it("nessuna pagina scrive in user_roles: lì scrive solo il super admin, e gli altri ricevono un rifiuto", () => {
    const colpevoli: string[] = [];
    for (const f of fileSorgente(SRC)) {
      const testo = readFileSync(f, "utf8");
      if (!testo.includes("user_roles")) continue;
      for (const m of testo.matchAll(/from\(\s*["']user_roles["']\s*\)([\s\S]{0,400})/g)) {
        const catena = m[1].split(/;|\n\s*\n/)[0];
        if (/\.(insert|update|upsert|delete)\s*\(/.test(catena)) colpevoli.push(f.replace(SRC, "src"));
      }
    }
    // Per cambiare un ruolo: supabase.rpc("cambia_ruolo_utente") o
    // supabase.rpc("imposta_ruolo_aggiuntivo").
    expect(colpevoli).toEqual([]);
  }, TIMEOUT);

  it("i permessi si salvano solo da salvaPermessiUtente: un UPDATE su una riga che manca non salva niente, in silenzio", () => {
    const colpevoli: string[] = [];
    for (const f of fileSorgente(SRC)) {
      if (f.endsWith("salvaPermessiUtente.ts")) continue;
      const testo = readFileSync(f, "utf8");
      if (!testo.includes("staff_permissions")) continue;
      for (const m of testo.matchAll(/from\(\s*["']staff_permissions["']\s*\)([\s\S]{0,300})/g)) {
        const catena = m[1].split(/;|\n\s*\n/)[0];
        if (/\.update\s*\(/.test(catena)) colpevoli.push(f.replace(SRC, "src"));
      }
    }
    expect(colpevoli).toEqual([]);
  }, TIMEOUT);
});
