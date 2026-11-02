/**
 * «Genera dal computo» (31/10/2026): la scheda «Computo metrico» fra i
 * materiali non c'è più, il computo si carica e si apre dal popup.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComputoCommessa } from "@/hooks/useComputoCommessa";

let computi: ComputoCommessa[];

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" }, user: { id: "u1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditOrders: true, canViewOrderAmounts: true }) }));
vi.mock("@/hooks/useComputoCommessa", () => ({
  computoInLettura: (c: ComputoCommessa | null) => !!c && ["uploading", "extracting_text", "analyzing_ai", "validating"].includes(c.extraction_status),
  computoLetto: (c: ComputoCommessa | null) => !!c && ["review", "completed"].includes(c.extraction_status),
  useComputiCommessa: () => ({ data: computi, isLoading: false }),
  useVociComputo: () => ({ data: [] as unknown[], isLoading: false }),
  useCaricaComputo: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useModificaComputo: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => {
  const vuoto = { data: [] as unknown[], error: null as null };
  const catena: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) catena[m] = () => catena;
  catena.then = (ok: (v: typeof vuoto) => unknown) => Promise.resolve(vuoto).then(ok);
  return { supabase: { from: () => catena, functions: { invoke: vi.fn() }, rpc: vi.fn() } };
});

import GeneraMaterialiDialog from "@/components/orders/materiali/GeneraMaterialiDialog";

const computo = (p: Partial<ComputoCommessa>): ComputoCommessa => ({
  id: "k1", titolo: "Computo esecutivo", file_name: "computo.pdf", file_type: "pdf", stato: "verificato",
  extraction_status: "review", extraction_error: null, extraction_method: "pdf_text", progresso: null, oggetto_lavori: null, committente: null,
  totale_dichiarato: null, totale_calcolato: null, controllo_totali: null, lavoro_pubblico: false, stazione_appaltante: null,
  cig: null, cup: null, ribasso_percentuale: null, oneri_sicurezza: null, created_at: null,
  variante_di: null, numero_variante: null, motivo_variante: null, contrattuale_dal: null, ...p,
});

const apri = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <GeneraMaterialiDialog orderId="o1" orderCode="DEMO-1" open onOpenChange={() => {}} />
  </QueryClientProvider>,
);

beforeEach(() => { computi = []; });

describe("Genera dal computo", () => {
  it("senza computo chiede il file da caricare, dentro il popup", () => {
    apri();
    expect(screen.getByRole("heading", { name: "Genera dal computo" })).toBeInTheDocument();
    expect(screen.getByText("Carica il computo della commessa")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Scegli il file/ })).toBeInTheDocument();
    expect(screen.queryByText(/«Computo metrico»/)).not.toBeInTheDocument();
  });

  it("col computo letto lo nomina e lo fa aprire per intero o sostituire", () => {
    computi = [computo({})];
    apri();
    expect(screen.getByText("Computo esecutivo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apri il computo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Carica un altro/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Scegli il file/ })).not.toBeInTheDocument();
  });

  it("mentre legge lo dice, senza chiedere un altro file", () => {
    computi = [computo({ extraction_status: "analyzing_ai", file_name: "lavori.pdf", titolo: null })];
    apri();
    expect(screen.getByText(/Sto leggendo «lavori.pdf»/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Scegli il file/ })).not.toBeInTheDocument();
  });

  it("se l'ultimo file non si è letto lo dice e richiede il file", () => {
    computi = [computo({ extraction_status: "failed", extraction_error: "file vuoto", file_name: "rotto.pdf" })];
    apri();
    expect(screen.getByRole("alert")).toHaveTextContent("«rotto.pdf») non si è letto: file vuoto");
    expect(screen.getByRole("button", { name: /Scegli il file/ })).toBeInTheDocument();
  });
});
