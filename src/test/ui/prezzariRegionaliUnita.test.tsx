import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// 05/11/2026: 16 prezzari regionali su 19 sono entrati senza unità di misura.
// La pagina admin deve fermare l'import sotto il 90% di voci con l'unità.

const stato = vi.hoisted(() => ({
  invoke: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/hooks/useSuperAdminPermissions", () => ({
  useSuperAdminPermissions: () => ({ permissions: { can_manage_companies: true }, isLoading: false }),
}));
vi.mock("@/lib/prezzario/queries", () => ({
  usePrezzarioFontiAdmin: () => ({ data: [] as unknown[], isLoading: false, error: null as Error | null }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: stato.invoke }, from: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { success: stato.success, error: stato.error } }));
// Il menu Radix non si apre in jsdom: un <select> nativo con la stessa API.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) => (
    <select aria-label="Regione" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="">—</option>
      {children}
    </select>
  ),
  SelectTrigger: (): null => null,
  SelectValue: (): null => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));

import PrezzariRegionali from "@/pages/admin/PrezzariRegionali";

function apri() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const out = render(<QueryClientProvider client={qc}><PrezzariRegionali /></QueryClientProvider>);
  fireEvent.change(screen.getByRole("combobox", { name: "Regione" }), { target: { value: "Marche" } });
  return out;
}

async function carica(container: HTMLElement, csv: string) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([csv], "prezzario.csv", { type: "text/csv" })] } });
  await screen.findByText("Anteprima");
}

const SENZA_UNITA = [
  "Codice,Descrizione,Prezzo",
  '02.03.017*,"Demolizione di solaio misto. La misurazione sarà eseguita al m² per ogni cm di spessore del solaio.","3,18"',
  '02.03.008*.001,"Demolizione di tramezzi. Per uno spessore compreso tra cm 6-11.","12,32"',
].join("\n");

const CON_UNITA = [
  "Codice,Descrizione,U.M.,Prezzo",
  '02.01.001*,"Scavo di sbancamento con mezzi meccanici",m³,"9,69"',
  '02.02.001*.001,"Rinterro con materiale di scavo",m³,"5,68"',
].join("\n");

beforeEach(() => {
  stato.invoke.mockReset().mockResolvedValue({ data: { fonte_id: "f0000000-0000-4000-a000-000000000001", capitoli_inseriti: 1, voci_inserite: 2, voci_scartate: 0 }, error: null });
  stato.success.mockClear();
  stato.error.mockClear();
});
afterEach(cleanup);

describe("Prezzari regionali: unità di misura all'import", () => {
  it("un file senza la colonna dell'unità è fermo finché l'admin non conferma", async () => {
    const { container } = apri();
    await carica(container, SENZA_UNITA);
    expect(screen.getByText("Manca l'unità di misura")).toBeInTheDocument();
    expect(screen.getByText(/2 voci su 2 \(100%\) non hanno l'unità di misura/)).toBeInTheDocument();
    const importa = screen.getByRole("button", { name: /Importa come bozza/ });
    expect(importa).toBeDisabled();
    fireEvent.click(importa);
    expect(stato.invoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox", { name: "Importa comunque le voci senza unità di misura" }));
    expect(importa).toBeEnabled();
    fireEvent.click(importa);
    await waitFor(() => expect(stato.invoke).toHaveBeenCalledOnce());
    expect(stato.invoke.mock.calls[0][0]).toBe("prezzario-import");
    expect(stato.invoke.mock.calls[0][1].body).toMatchObject({ consenti_senza_unita: true });
  });

  it("con la colonna «U.M.» riconosciuta l'import parte subito, senza conferma", async () => {
    const { container } = apri();
    await carica(container, CON_UNITA);
    expect(screen.queryByText("Manca l'unità di misura")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Importa come bozza/ }));
    await waitFor(() => expect(stato.invoke).toHaveBeenCalledOnce());
    const body = stato.invoke.mock.calls[0][1].body;
    expect(body).toMatchObject({ consenti_senza_unita: false });
    expect(body.voci.map((v: { unita_misura: string }) => v.unita_misura)).toEqual(["m³", "m³"]);
  });

  it("se l'edge function rifiuta, si legge il motivo vero e non «non-2xx»", async () => {
    stato.invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
        context: new Response(JSON.stringify({ error: "Import fermato: 2 voci su 2 (100%) non hanno l'unità di misura." }), { status: 422 }),
      }),
    });
    const { container } = apri();
    await carica(container, SENZA_UNITA);
    fireEvent.click(screen.getByRole("checkbox", { name: "Importa comunque le voci senza unità di misura" }));
    fireEvent.click(screen.getByRole("button", { name: /Importa come bozza/ }));
    await waitFor(() => expect(stato.error).toHaveBeenCalledWith("Import fallito", { description: expect.stringContaining("Import fermato") }));
  });
});
