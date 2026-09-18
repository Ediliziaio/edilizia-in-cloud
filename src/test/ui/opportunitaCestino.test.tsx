/**
 * Cestino delle opportunità (17/09/2026).
 *
 * Tiene fermo:
 *   · «Elimina», singola o in blocco, non cancella mai: scrive solo deleted_at
 *     (stato e autore li mette il database) e offre «Annulla»;
 *   · «Annulla» rimette deleted_at a null;
 *   · il cestino mostra dove stava l'opportunità e chi l'ha eliminata, si cerca
 *     e «Ripristina» la toglie dal cestino.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

interface Chiamata {
  tabella: string;
  operazione: "select" | "update" | "delete";
  dati?: Record<string, unknown>;
  filtri: Array<[string, ...unknown[]]>;
}

const chiamate: Chiamata[] = [];
let righeCestino: RigaCestinoGrezza[] = [];

function builder(tabella: string) {
  const chiamata: Chiamata = { tabella, operazione: "select", filtri: [] };
  chiamate.push(chiamata);
  const b: Record<string, unknown> = {};
  b.select = vi.fn(() => b);
  b.update = vi.fn((dati: Record<string, unknown>) => { chiamata.operazione = "update"; chiamata.dati = dati; return b; });
  b.delete = vi.fn(() => { chiamata.operazione = "delete"; return b; });
  for (const m of ["eq", "in", "is", "not", "order", "limit"]) {
    b[m] = vi.fn((...args: unknown[]) => { chiamata.filtri.push([m, ...args]); return b; });
  }
  b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
    let data: unknown = null;
    if (chiamata.operazione === "select" && tabella === "marketing_opportunities") data = righeCestino;
    if (chiamata.operazione === "select" && tabella === "profiles") data = [{ id: "utente-2", first_name: "Venusia", last_name: "Rossi" }];
    return Promise.resolve({ data, error: null }).then(ok, ko);
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => builder(t) },
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "azienda-1" }, user: { id: "utente-1" } }),
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditMarketingOpportunities: true }) }));

import { useDeleteOpportunity, useBulkDeleteOpportunities } from "@/hooks/useOpportunitiesData";
import { OpportunitaCestinoDialog } from "@/components/opportunities/OpportunitaCestinoDialog";
import type { RigaCestinoGrezza } from "@/lib/opportunitaCestino";

function Elimina({ ids }: { ids: string[] }) {
  const una = useDeleteOpportunity();
  const blocco = useBulkDeleteOpportunities();
  return (
    <button type="button" onClick={() => (ids.length === 1 ? una.mutate(ids[0]) : blocco.mutate(ids))}>
      Elimina
    </button>
  );
}

const riga = (id: string, nome: string, contatto: string): RigaCestinoGrezza => ({
  id,
  name: nome,
  value: 4200,
  deleted_at: "2026-09-17T08:30:00.000Z",
  deleted_by: "utente-2",
  marketing_contacts: { first_name: contatto, last_name: "Bianchi", company_name: null },
  marketing_pipelines: { name: "Nuovo" },
  marketing_pipeline_stages: { name: "Da Chiamare" },
});

const bottone = (testo: string) =>
  Array.from(document.body.querySelectorAll("button")).filter((b) => b.textContent?.trim() === testo) as HTMLButtonElement[];
const attendi = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const aggiornamenti = () => chiamate.filter((c) => c.tabella === "marketing_opportunities" && c.operazione === "update");

function scrivi(el: HTMLInputElement, valore: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(el, valore);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("Cestino delle opportunità", () => {
  let contenitore: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    chiamate.length = 0;
    righeCestino = [];
    Object.values(toast).forEach((f) => f.mockReset());
    contenitore = document.createElement("div");
    document.body.appendChild(contenitore);
    root = createRoot(contenitore);
  });

  afterEach(() => {
    act(() => root.unmount());
    contenitore.remove();
    document.body.innerHTML = "";
  });

  const monta = async (ui: ReactNode) => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          {ui}
        </QueryClientProvider>,
      );
    });
    await attendi();
  };

  it("«Elimina» scrive solo deleted_at, non cancella, e «Annulla» la rimette", async () => {
    await monta(<Elimina ids={["opp-1"]} />);
    await act(async () => bottone("Elimina")[0].click());
    await attendi();

    expect(chiamate.some((c) => c.operazione === "delete")).toBe(false);
    const [nelCestino] = aggiornamenti();
    expect(Object.keys(nelCestino.dati!).sort()).toEqual(["deleted_at", "deleted_by", "updated_at"]);
    expect(nelCestino.dati!.deleted_by).toBe("utente-1");
    expect(typeof nelCestino.dati!.deleted_at).toBe("string");
    expect(nelCestino.filtri).toEqual(expect.arrayContaining([["eq", "company_id", "azienda-1"], ["in", "id", ["opp-1"]]]));

    expect(toast.success).toHaveBeenCalledTimes(1);
    const [titolo, opzioni] = toast.success.mock.calls[0];
    expect(titolo).toBe("Opportunità spostata nel cestino");
    expect(opzioni.description).toBe("La ritrovi in Opportunità → Altre azioni → Cestino.");
    expect(opzioni.action.label).toBe("Annulla");

    await act(async () => opzioni.action.onClick());
    await attendi();
    const ripristino = aggiornamenti()[1];
    expect(ripristino.dati).toMatchObject({ deleted_at: null });
    expect(ripristino.dati).not.toHaveProperty("status");
    expect(ripristino.filtri).toEqual(expect.arrayContaining([["in", "id", ["opp-1"]]]));
    expect(toast.success).toHaveBeenLastCalledWith("Opportunità ripristinata");
  });

  it("in blocco: tutte nel cestino in un colpo, niente cancellazioni", async () => {
    await monta(<Elimina ids={["opp-1", "opp-2", "opp-3"]} />);
    await act(async () => bottone("Elimina")[0].click());
    await attendi();

    expect(chiamate.some((c) => c.operazione === "delete")).toBe(false);
    expect(aggiornamenti()).toHaveLength(1);
    expect(aggiornamenti()[0].filtri).toEqual(expect.arrayContaining([["in", "id", ["opp-1", "opp-2", "opp-3"]]]));
    expect(toast.success.mock.calls[0][0]).toBe("3 opportunità spostate nel cestino");
  });

  it("il cestino dice dove stava e chi l'ha eliminata, e «Ripristina» la rimette", async () => {
    righeCestino = [riga("opp-1", "Infissi soggiorno", "Graziella")];
    await monta(<OpportunitaCestinoDialog open onOpenChange={() => {}} />);

    // Il formato euro separa numero e simbolo con uno spazio non divisibile.
    const testo = (document.body.textContent ?? "").replace(/\u00a0/g, " ");
    expect(testo).toContain("Infissi soggiorno");
    expect(testo).toContain("Graziella Bianchi · Nuovo → Da Chiamare · 4.200,00 €");
    expect(testo).toContain("Venusia Rossi");
    const lettura = chiamate.find((c) => c.tabella === "marketing_opportunities" && c.operazione === "select");
    expect(lettura?.filtri).toEqual(expect.arrayContaining([["eq", "company_id", "azienda-1"], ["not", "deleted_at", "is", null]]));

    await act(async () => bottone("Ripristina")[0].click());
    await attendi();
    const [ripristino] = aggiornamenti();
    expect(ripristino.dati).toMatchObject({ deleted_at: null });
    expect(ripristino.filtri).toEqual(expect.arrayContaining([["in", "id", ["opp-1"]]]));
    expect(toast.success.mock.calls[0][0]).toBe("Opportunità ripristinata");
  });

  it("con molte righe si cerca, anche per contatto", async () => {
    righeCestino = ["Graziella", "Mario", "Luca", "Anna", "Paolo", "Sara"].map((nome, i) => riga(`opp-${i}`, `Lead ${i + 1}`, nome));
    await monta(<OpportunitaCestinoDialog open onOpenChange={() => {}} />);
    expect(bottone("Ripristina")).toHaveLength(6);

    const cerca = document.body.querySelector<HTMLInputElement>('input[aria-label="Cerca nel cestino"]');
    expect(cerca).toBeTruthy();
    await act(async () => scrivi(cerca!, "graziella"));
    expect(bottone("Ripristina")).toHaveLength(1);
    expect(document.body.textContent).toContain("Lead 1");
  });
});
