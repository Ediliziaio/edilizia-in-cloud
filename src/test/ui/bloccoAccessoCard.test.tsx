import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import sorgenteSchedaUtente from "@/pages/azienda/settings/SettingsUserDetail.tsx?raw";

/**
 * Bloccare chi non lavora più (BeMade, Venusia, 24/09/2026): il blocco si
 * trova anche fra «Ruoli e permessi», dove si tolgono i permessi, e il registro
 * dice chi ha bloccato. Prima «bloccato da» era la persona bloccata stessa.
 */

const ADMIN = "89bb3238-3b1e-48a6-987c-ae20b4519615";
const VENUSIA = "2ab53fbf-1a8c-41d5-8b66-0d4d01187047";
const BEMADE = "1b4ef4f7-87a6-4313-9ac6-cd53a7c14ce7";

type Chiamata = { tabella: string; op: string; valori: Record<string, unknown>; filtri: Record<string, unknown> };
const chiamate: Chiamata[] = [];

function builder(tabella: string) {
  const c: Chiamata = { tabella, op: "", valori: {}, filtri: {} };
  const b: Record<string, unknown> = {};
  b.update = (v: Record<string, unknown>) => { c.op = "update"; c.valori = v; return b; };
  b.insert = (v: Record<string, unknown>) => { c.op = "insert"; c.valori = v; chiamate.push(c); return Promise.resolve({ error: null }); };
  b.eq = (k: string, v: unknown) => { c.filtri[k] = v; return b; };
  b.then = (ok: (v: unknown) => unknown) => { chiamate.push(c); return Promise.resolve({ error: null }).then(ok); };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => builder(t) } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: ADMIN }, effectiveCompany: { id: BEMADE } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));

import { BloccoAccessoCard } from "@/components/users/BloccoAccessoCard";

function monta(puoBloccare: boolean, isBlocked = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BloccoAccessoCard userId={VENUSIA} isBlocked={isBlocked} puoBloccare={puoBloccare} />
    </QueryClientProvider>,
  );
}

beforeEach(() => { chiamate.length = 0; });
afterEach(cleanup);

describe("blocco dell'accesso", () => {
  it("blocca a nome di chi blocca, e lo scrive nel registro", async () => {
    monta(true);
    fireEvent.click(screen.getByRole("button", { name: /Blocca accesso/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Blocca accesso" }));

    await waitFor(() => expect(chiamate.find((c) => c.tabella === "user_audit_log")).toBeTruthy());
    const profilo = chiamate.find((c) => c.tabella === "profiles")!;
    expect(profilo.op).toBe("update");
    expect(profilo.filtri.id).toBe(VENUSIA);
    expect(profilo.valori.is_blocked).toBe(true);
    expect(profilo.valori.blocked_by).toBe(ADMIN);

    const registro = chiamate.find((c) => c.tabella === "user_audit_log")!;
    expect(registro.valori).toMatchObject({ company_id: BEMADE, actor_id: ADMIN, target_user_id: VENUSIA, action: "user_locked" });
  });

  it("ripristina e toglie chi aveva bloccato", async () => {
    monta(true, true);
    fireEvent.click(screen.getByRole("button", { name: /Ripristina accesso/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Ripristina accesso" }));
    await waitFor(() => expect(chiamate.find((c) => c.tabella === "user_audit_log")?.valori.action).toBe("user_unlocked"));
    expect(chiamate.find((c) => c.tabella === "profiles")!.valori).toMatchObject({ is_blocked: false, blocked_by: null });
  });

  it("senza permesso non compare", () => {
    const { container } = monta(false);
    expect(container.textContent).toBe("");
  });

  it("c'è anche fra «Ruoli e permessi», dove si tolgono i permessi", () => {
    const sezionePermessi = sorgenteSchedaUtente.slice(sorgenteSchedaUtente.indexOf('activeTab === "permissions"'));
    expect(sezionePermessi.slice(0, sezionePermessi.indexOf("<UserRolesPermissionsTab"))).toContain("<BloccoAccessoCard");
  });
});
