/**
 * Facebook per i brand della piattaforma, dal superadmin (19/09/2026).
 *
 * Tiene fermo:
 *   · la scheda legge il collegamento del CRM della piattaforma, mai quello
 *     dell'azienda in cui l'utente sta lavorando;
 *   · il wizard che apre lavora per la piattaforma (contesto Meta), dal passo
 *     giusto: login se non è collegato, moduli e pipeline se lo è.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const PIATTAFORMA = "00000000-0000-0000-0000-000000000001";

interface Chiamata { tabella: string; filtri: Array<[string, ...unknown[]]> }
const chiamate: Chiamata[] = [];
let integrazione: Record<string, unknown> | null = null;

function builder(tabella: string) {
  const chiamata: Chiamata = { tabella, filtri: [] };
  chiamate.push(chiamata);
  const b: Record<string, unknown> = {};
  b.select = vi.fn(() => b);
  for (const m of ["eq", "in", "order", "limit"]) {
    b[m] = vi.fn((...args: unknown[]) => { chiamata.filtri.push([m, ...args]); return b; });
  }
  b.maybeSingle = vi.fn(() => Promise.resolve({ data: tabella === "integrations" ? integrazione : null, error: null }));
  b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
    let data: unknown = [];
    if (tabella === "meta_assets") data = [{ asset_name: "Flo" }, { asset_name: "Marketing Edile" }];
    if (tabella === "meta_lead_forms") data = [{ form_name: "Richiesta preventivo" }, { form_name: "Contatto" }];
    return Promise.resolve({ data, error: null }).then(ok, ko);
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => builder(t) } }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "azienda-cliente" }, user: { id: "utente-1" } }),
}));
// Il wizard vero parla con Facebook: al suo posto uno che dice per chi lavora.
vi.mock("@/components/integrations/MetaIntegrationWizard", async () => {
  const { useMetaCompanyId } = await import("@/components/integrations/metaCompanyContext");
  return {
    MetaIntegrationWizard: ({ open, initialStep }: { open: boolean; initialStep?: string }) => {
      const azienda = useMetaCompanyId();
      return open ? <div data-testid="wizard">{`${initialStep}|${azienda}`}</div> : null;
    },
  };
});

// Anche «Risolvi problemi» deve lavorare per la piattaforma (recupero lead).
vi.mock("@/components/integrations/MetaTroubleshootDialog", async () => {
  const { useMetaCompanyId } = await import("@/components/integrations/metaCompanyContext");
  return {
    MetaTroubleshootDialog: ({ open }: { open: boolean }) => {
      const azienda = useMetaCompanyId();
      return open ? <div data-testid="problemi">{azienda}</div> : null;
    },
  };
});

import AdminMetaLeadsCard from "@/components/admin/settings/AdminMetaLeadsCard";

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  chiamate.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
});

async function monta() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <QueryClientProvider client={qc}>
        <AdminMetaLeadsCard />
      </QueryClientProvider>,
    );
  });
  // La seconda lettura (pagine e moduli) parte solo dopo la prima: due giri.
  for (let i = 0; i < 3; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
}

function bottone(testo: string): HTMLButtonElement {
  const b = [...host.querySelectorAll("button")].find((x) => x.textContent?.trim() === testo);
  if (!b) throw new Error(`bottone «${testo}» non trovato: ${host.textContent}`);
  return b as HTMLButtonElement;
}

describe("Facebook dei brand nel superadmin", () => {
  it("non collegato: si parte dal login, e il wizard lavora per la piattaforma", async () => {
    integrazione = null;
    await monta();
    expect(host.textContent).toContain("Non collegato");
    // Legge il collegamento della piattaforma, non dell'azienda in cui si lavora.
    const letta = chiamate.find((c) => c.tabella === "integrations");
    expect(letta?.filtri).toContainEqual(["eq", "company_id", PIATTAFORMA]);
    expect(JSON.stringify(chiamate)).not.toContain("azienda-cliente");

    await act(async () => { bottone("Collega con Facebook").click(); });
    expect(host.querySelector("[data-testid=wizard]")?.textContent).toBe(`oauth|${PIATTAFORMA}`);
  });

  it("collegato: mostra pagine e moduli, e apre i moduli dal passo giusto", async () => {
    integrazione = { id: "int-1", company_id: PIATTAFORMA, provider: "meta", status: "connected" };
    await monta();
    expect(host.textContent).toContain("Collegato");
    expect(host.textContent).toContain("Flo, Marketing Edile");
    expect(host.textContent).toContain("Moduli attivi2");

    await act(async () => { bottone("Moduli e pipeline").click(); });
    expect(host.querySelector("[data-testid=wizard]")?.textContent).toBe(`forms|${PIATTAFORMA}`);

    await act(async () => { bottone("Recupera lead e risolvi problemi").click(); });
    expect(host.querySelector("[data-testid=problemi]")?.textContent).toBe(PIATTAFORMA);
  });

  it("collegamento scaduto: lo dice, e propone di ricollegare", async () => {
    integrazione = { id: "int-1", company_id: PIATTAFORMA, provider: "meta", status: "token_expired" };
    await monta();
    expect(host.textContent).toContain("Collegamento scaduto");
    await act(async () => { bottone("Ricollega Facebook").click(); });
    expect(host.querySelector("[data-testid=wizard]")?.textContent).toBe(`oauth|${PIATTAFORMA}`);
  });
});
