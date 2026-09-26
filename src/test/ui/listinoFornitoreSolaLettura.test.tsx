/**
 * Il listino del fornitore lo modifica chi gestisce i fornitori o il listino
 * (26/09/2026): è la regola del database. Chi apre il fornitore senza quei
 * permessi consulta le voci, senza pulsanti che salverebbero nel vuoto.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ListinoFornitoreTab } from "@/components/suppliers/ListinoFornitoreTab";

const finto = vi.hoisted(() => {
  const listino = { id: "listino-demo", sconto_default_pct: 0 };
  const voci = [{ id: "voce-demo", codice: "PRF-01", descrizione: "Profilo di prova", unita: "m", prezzo: 10, sconto_pct: 5, immagine_url: null as string | null }];
  const catena = (tabella: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {};
    for (const m of ["select", "eq", "order", "limit"]) c[m] = () => c;
    c.maybeSingle = async () => ({ data: listino, error: null as null });
    c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
      Promise.resolve({ data: tabella === "listino_fornitore_voci" ? voci : [], error: null as null }).then(ok, ko);
    return c;
  };
  return { catena, permessi: {} as Record<string, boolean> };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => finto.catena(t) } }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "company-demo" }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => finto.permessi }));

afterEach(cleanup);

function apri(permessi: Record<string, boolean>) {
  finto.permessi = permessi;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ListinoFornitoreTab supplierId="fornitore-demo" />
    </QueryClientProvider>,
  );
}

describe("Listino del fornitore: si modifica col permesso", () => {
  it("chi non gestisce fornitori né listino consulta le voci, senza pulsanti", async () => {
    apri({ canViewSuppliers: true });
    const codice = await screen.findByDisplayValue("PRF-01");
    expect(codice).toHaveAttribute("readonly");
    expect(screen.getByDisplayValue("Profilo di prova")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: /Salva listino/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Incolla da Excel/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rimuovi voce" })).not.toBeInTheDocument();
  });

  it.each([
    ["gestisce i fornitori", { canManageSuppliers: true }],
    ["modifica i fornitori nelle impostazioni", { canEditSettingsSuppliers: true }],
    ["modifica il listino", { canEditSettingsPricing: true }],
  ])("chi %s modifica e salva", async (_chi, permessi) => {
    apri(permessi);
    const codice = await screen.findByDisplayValue("PRF-01");
    expect(codice).not.toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: /Salva listino/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Incolla da Excel/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rimuovi voce" })).toBeInTheDocument();
  });
});
