/**
 * «Collega le voci al listino» (10/11/2026, lotto 3): le proposte sicure sono già spuntate, quelle
 * con unità diverse no, e «Collega» manda al database voce, voce di listino e chiave da ricordare.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AbbinaListinoDialog } from "@/components/orders/AbbinaListinoDialog";

const finto = vi.hoisted(() => {
  const catena = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {};
    for (const m of ["select", "eq", "order", "limit"]) c[m] = () => c;
    c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve({ data: [] as unknown[], error: null as null }).then(ok, ko);
    return c;
  };
  const rpc = vi.fn(async () => ({ data: { collegate: 1, scollegate: 0, ricordate: 1 }, error: null as null }));
  return { catena, rpc };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => finto.catena(), rpc: finto.rpc } }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditSettingsPricing: false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(cleanup);

const voci = [
  { id: "v1", phase_id: "f1", descrizione: "Intonaco civile", unita: "m2", origine_codice: "AR.INT.01", tariffa_id: null as string | null, quantita: 420, importo: 11970 },
  { id: "v2", phase_id: "f1", descrizione: "Magrone", unita: "kg", origine_codice: "ST.MAG", tariffa_id: null as string | null, quantita: 3, importo: 390 },
  { id: "v3", phase_id: "f1", descrizione: "Già collegata", unita: "mq", origine_codice: null as string | null, tariffa_id: "int" as string | null, quantita: 1, importo: 1 },
];
const listino = [
  { id: "int", nome: "Intonaco civile a base cemento", codice: "AR.INT.01", unita: "mq" },
  { id: "mag", nome: "Magrone", codice: "ST.MAG", unita: "mc" },
];

describe("Collega le voci al listino", () => {
  it("la proposta sicura parte spuntata, quella con unità diverse no; «Collega» manda la chiave", async () => {
    const fatto = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AbbinaListinoDialog orderId="o1" companyId="az" voci={voci} fasi={[{ id: "f1", name: "Intonaci" }]} listino={listino} onChiudi={vi.fn()} onFatto={fatto} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/2 voci della commessa non hanno la voce del listino/)).toBeInTheDocument();
    expect(screen.queryByText("Già collegata")).not.toBeInTheDocument();
    expect(await screen.findByRole("checkbox", { name: "Collega Intonaco civile" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Collega Magrone" })).not.toBeChecked();
    expect(screen.getByText("unità diverse")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Collega 1$/ }));
    await waitFor(() => expect(finto.rpc).toHaveBeenCalledWith("voci_abbina_listino", {
      p_order: "o1", p_ricorda: true, p_abbinamenti: [{ voce_id: "v1", tariffa_id: "int", chiave: "intonaco civile" }],
    }));
    await waitFor(() => expect(fatto).toHaveBeenCalled());
  });
});
