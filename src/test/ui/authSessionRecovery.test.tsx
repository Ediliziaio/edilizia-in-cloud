import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

const testAuth = vi.hoisted(() => ({
  listener: null as null | ((event: AuthChangeEvent, session: Session | null) => void),
  getSession: vi.fn(),
  setSession: vi.fn(),
  signOut: vi.fn(),
  capture: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: testAuth.invalidateQueries, clear: vi.fn() }),
}));
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/velocity/sentry", () => ({
  captureVelocityError: testAuth.capture,
  setSentryUserContext: vi.fn(),
}));
vi.mock("@/lib/utils/edgeWarmup", () => ({ warmupCriticalEdgeFunctions: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (listener: typeof testAuth.listener) => {
        testAuth.listener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      getSession: testAuth.getSession,
      setSession: testAuth.setSession,
      signOut: testAuth.signOut,
    },
    functions: { invoke: vi.fn(async () => ({ data: {}, error: null })) },
    rpc: vi.fn(async () => ({ data: null, error: null })),
    from: (table: string) => {
      const result: { data: unknown; error: null } = {
        data: table === "profiles"
          ? { id: "user", company_id: "company", company: { id: "company", name: "Azienda" } }
          : table === "user_roles" ? [{ role: "company_staff" }] : [],
        error: null,
      };
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "neq", "in", "is", "or", "order", "limit", "abortSignal"])
        query[method] = () => query;
      query.maybeSingle = async () => result;
      query.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
      return query;
    },
    channel: () => {
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

const STORAGE_KEY = "sb-test-auth-token";
const session = {
  access_token: "test-access-token",
  refresh_token: "test-refresh-token",
  user: { id: "user", email: "staff@example.test" },
} as Session;

let refreshAuth: () => Promise<void>;

function AuthProbe() {
  const auth = useAuth();
  useEffect(() => { refreshAuth = auth.refreshAuth; }, [auth.refreshAuth]);
  return <output data-testid="auth-state">{auth.isLoading ? "verifica" : auth.user ? "autenticato" : "disconnesso"}</output>;
}

function openApp(savedSession = true) {
  if (savedSession) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  render(
    <MemoryRouter initialEntries={["/azienda"]}>
      <AuthProvider>
        <AuthProbe />
        <Routes>
          <Route path="/azienda" element={<ProtectedRoute><p>Gestionale aperto</p></ProtectedRoute>} />
          <Route path="/login" element={<p>Inserisci email e password</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

async function emit(event: AuthChangeEvent, value: Session | null) {
  act(() => { testAuth.listener?.(event, value); });
  await advance(0);
}

function expectPending() {
  expect(screen.getByTestId("auth-state")).toHaveTextContent("verifica");
  expect(screen.queryByText("Inserisci email e password")).not.toBeInTheDocument();
  expect(screen.queryByText("Gestionale aperto")).not.toBeInTheDocument();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(session));
  expect(testAuth.signOut).not.toHaveBeenCalled();
}

describe("Ripristino dell'accesso con rete lenta", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, "", "/");
    testAuth.listener = null;
    testAuth.getSession.mockImplementation(() => new Promise(() => {}));
    testAuth.setSession.mockImplementation(() => new Promise(() => {}));
    testAuth.signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.history.replaceState(null, "", "/");
  });

  it("il rinnovo oltre 8 secondi non manda al login e un esito tardivo apre il gestionale", async () => {
    openApp();
    await advance(8_500);
    expectPending();
    expect(testAuth.capture).toHaveBeenCalledWith(
      "auth.bootstrap_session_pending",
      expect.any(Error),
      { timeoutMs: 8_000, hasSavedSession: true, hasCrossSubdomainHandoff: false },
    );
    await emit("INITIAL_SESSION", session);
    expect(screen.getByText("Gestionale aperto")).toBeInTheDocument();
    expect(screen.getByTestId("auth-state")).toHaveTextContent("autenticato");
  });

  it("a rete assente offre Riprova e riprende quando arriva il rinnovo", async () => {
    openApp();
    await advance(26_000);
    expectPending();
    expect(screen.getByText("Accesso ancora in verifica")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument();
    await emit("TOKEN_REFRESHED", session);
    expect(screen.getByText("Gestionale aperto")).toBeInTheDocument();
  });

  it("INITIAL_SESSION:null conserva la verifica quando Supabase ha tenuto il token per riprovare", async () => {
    openApp();
    await emit("INITIAL_SESSION", null);
    await advance(8_500);
    expectPending();
    await emit("TOKEN_REFRESHED", session);
    expect(screen.getByText("Gestionale aperto")).toBeInTheDocument();
  });

  it("senza una sessione salvata apre normalmente il login", async () => {
    openApp(false);
    await emit("INITIAL_SESSION", null);
    expect(screen.getByText("Inserisci email e password")).toBeInTheDocument();
  });

  it("il watchdog sblocca comunque chi è senza sessione e non riceve alcun evento", async () => {
    openApp(false);
    await advance(8_500);
    expect(screen.getByText("Inserisci email e password")).toBeInTheDocument();
  });

  it("un SIGNED_OUT esplicito chiude l'accesso anche se nello storage resta un token", async () => {
    openApp();
    await emit("INITIAL_SESSION", session);
    expect(screen.getByText("Gestionale aperto")).toBeInTheDocument();
    await emit("SIGNED_OUT", null);
    expect(screen.getByText("Inserisci email e password")).toBeInTheDocument();
  });

  it("un passaggio fra sottodomini ancora in corso non viene annullato dal watchdog", async () => {
    window.history.replaceState(null, "", "/#_at=test-access&_rt=test-refresh");
    openApp(false);
    await emit("INITIAL_SESSION", null);
    await advance(8_500);
    expect(screen.getByTestId("auth-state")).toHaveTextContent("verifica");
    expect(screen.queryByText("Inserisci email e password")).not.toBeInTheDocument();
    await emit("SIGNED_IN", session);
    expect(screen.getByText("Gestionale aperto")).toBeInTheDocument();
  });

  it("un refreshAuth in timeout conserva il token e la verifica", async () => {
    openApp();
    act(() => { void refreshAuth(); });
    await advance(10_500);
    expectPending();
  });

  it("un errore di rete restituito da getSession non equivale a un logout", async () => {
    testAuth.getSession.mockResolvedValue({ data: { session: null }, error: new Error("Network unavailable") });
    openApp();
    await act(async () => { await refreshAuth(); });
    expectPending();
  });

  it("un token definitivamente non valido viene rimosso e richiede un nuovo accesso", async () => {
    testAuth.getSession.mockResolvedValue({ data: { session: null }, error: new Error("Invalid Refresh Token: Refresh Token Not Found") });
    openApp();
    await act(async () => { await refreshAuth(); });
    expect(screen.getByText("Inserisci email e password")).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(testAuth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("un errore tardivo del controllo precedente non cancella un accesso appena confermato", async () => {
    let reject: (error: Error) => void = () => {};
    testAuth.getSession.mockImplementation(() => new Promise((_, rejectRequest) => { reject = rejectRequest; }));
    openApp();
    act(() => { void refreshAuth(); });
    await emit("TOKEN_REFRESHED", session);
    await act(async () => { reject(new Error("Invalid Refresh Token")); });
    expect(screen.getByText("Gestionale aperto")).toBeInTheDocument();
    expect(testAuth.signOut).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(session));
  });
});
