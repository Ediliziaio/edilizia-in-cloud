/**
 * Integrazioni del superadmin, rifatta il 25/11/2026.
 *
 * Tiene fermo:
 *   · la pagina mostra solo ciò che si collega da qui: niente moduli con le
 *     chiavi dei servizi (stanno nel Vault), niente regole dei calendari;
 *   · gli assistenti collegati all'area superadmin si vedono come tali, quelli
 *     legati a un'azienda col nome dell'azienda;
 *   · la revoca chiude il collegamento nel registro e poi il consenso OAuth.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import type { CollegamentoAi } from "@/components/admin/settings/AdminAssistentiAi";

const rpc = vi.fn();
const revokeGrant = vi.fn();
const aggiornamenti: Array<{ tabella: string; valori: unknown; filtri: unknown[][] }> = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    auth: { oauth: { revokeGrant: (...a: unknown[]) => revokeGrant(...a) } },
    from: (tabella: string) => {
      const voce = { tabella, valori: null as unknown, filtri: [] as unknown[][] };
      const b: Record<string, unknown> = {};
      b.update = (v: unknown) => { voce.valori = v; aggiornamenti.push(voce); return b; };
      for (const m of ["eq", "is", "select"]) b[m] = (...a: unknown[]) => { voce.filtri.push([m, ...a]); return b; };
      b.maybeSingle = () => Promise.resolve({ data: { id: "g1" }, error: null });
      return b;
    },
  },
}));
// La scheda Facebook dei brand ha il suo test: qui basta sapere che c'è.
vi.mock("@/components/admin/settings/AdminMetaLeadsCard", () => ({ default: () => <div>Scheda Facebook brand</div> }));

const COLLEGAMENTI: CollegamentoAi[] = [
  { id: "g1", client_id: "c-claude", client_name: "Claude", ambito: "piattaforma", company_id: null, company_name: null,
    livello: "operativo", invii: false, created_at: "2026-11-25T08:00:00Z", last_used_at: new Date().toISOString(),
    chiamate_24h: 12, errori_24h: 1 },
  { id: "g2", client_id: "c-gpt", client_name: "ChatGPT", ambito: "azienda", company_id: "a1", company_name: "Demo Azienda",
    livello: "consulente", invii: false, created_at: "2026-11-20T08:00:00Z", last_used_at: null,
    chiamate_24h: 0, errori_24h: 0 },
];

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  rpc.mockReset(); revokeGrant.mockReset(); aggiornamenti.length = 0;
  rpc.mockImplementation((fn: string) => Promise.resolve({
    data: fn === "admin_mcp_collegamenti" ? COLLEGAMENTI
      : [{ created_at: new Date().toISOString(), strumento: "statistiche_piattaforma", esito: 200, durata_ms: 80, collegamento: "Claude", azienda: null }],
    error: null,
  }));
  revokeGrant.mockResolvedValue({ error: null });
  host = document.createElement("div");
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
});

async function disegna() {
  const { default: Pagina } = await import("@/pages/admin/settings/AdminSettingsIntegrations");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root = createRoot(host);
    root.render(<QueryClientProvider client={qc}><MemoryRouter><Pagina /></MemoryRouter></QueryClientProvider>);
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

describe("Integrazioni superadmin", () => {
  it("mostra assistenti AI e Facebook dei brand, non le chiavi dei servizi", async () => {
    await disegna();
    const testo = host.textContent ?? "";
    expect(testo).toContain("Assistenti AI");
    expect(testo).toContain("Scheda Facebook brand");
    for (const via of ["Secret Key", "Publishable Key", "Meta App Secret", "Google Maps", "Verify Token", "Stripe", "Policy Google Calendar"]) {
      expect(testo).not.toContain(via);
    }
    expect(host.querySelectorAll("input[type=password]")).toHaveLength(0);
    if (process.env.DUMP_INTEGRAZIONI) writeFileSync(process.env.DUMP_INTEGRAZIONI, host.innerHTML);
  });

  it("distingue l'area superadmin dai collegamenti d'azienda", async () => {
    await disegna();
    const testo = host.textContent ?? "";
    expect(testo).toContain("Area superadmin");
    expect(testo).toContain("Demo Azienda");
    expect(testo).toContain("12 chiamate/24h");
    expect(testo).toContain("statistiche_piattaforma");
    expect(rpc).toHaveBeenCalledWith("admin_mcp_collegamenti");
  });

  it("la revoca chiude il registro e poi il consenso del client", async () => {
    await disegna();
    const revoca = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Revoca"))!;
    await act(async () => { revoca.click(); });
    const conferma = [...document.body.querySelectorAll("button")].filter((b) => b.textContent === "Revoca").pop()!;
    await act(async () => { conferma.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(aggiornamenti[0]).toMatchObject({ tabella: "mcp_oauth_grants" });
    expect(aggiornamenti[0].filtri).toContainEqual(["eq", "id", "g1"]);
    expect(revokeGrant).toHaveBeenCalledWith({ clientId: "c-claude" });
  });
});
