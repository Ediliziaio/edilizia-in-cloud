/**
 * «Bolle dal telefono: lettura AI» (12/11/2026): l'impostazione e i documenti
 * «da leggere» in «Documenti da registrare».
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  impostazione: null as null | { bolle_telefono_lettura: string },
  leggi: vi.fn(),
  dialogo: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c" } }) }));
vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q,
    eq: () => q,
    maybeSingle: async (): Promise<{ data: unknown; error: null }> => ({ data: m.impostazione, error: null }),
  });
  return {
    supabase: {
      from: () => q,
      rpc: (...a: unknown[]) => m.rpc(...a),
      storage: { from: () => ({ download: async () => ({ data: new Blob(["x"], { type: "image/jpeg" }), error: null as null }) }) },
    },
  };
});
vi.mock("@/hooks/useImpostazioniAcquisti", async (orig) => {
  const vero = await orig<typeof import("@/hooks/useImpostazioniAcquisti")>();
  return {
    ...vero,
    useImpostazioniAcquisti: () => ({
      impostazioni: vero.IMPOSTAZIONI_ACQUISTI_PREDEFINITE,
      isLoading: false,
      salva: { mutate: vi.fn(), isPending: false, isError: false },
      salvaConferma: { mutate: vi.fn(), isPending: false },
    }),
    useQuantiValidatori: () => ({ data: 1 }),
  };
});
vi.mock("@/lib/ddt/documentiPersistenti", async (orig) => ({
  ...(await orig<typeof import("@/lib/ddt/documentiPersistenti")>()),
  leggiPersistente: m.leggi,
}));
vi.mock("@/lib/ddt/preparaDocumento", () => ({ preparaDocumento: async (f: File) => ({ lettura: f }) }));
vi.mock("@/lib/ddt/dividiPdf", () => ({ contaPagine: async () => 1, leggiPerDividere: vi.fn() }));
vi.mock("@/components/ddt/BolleInBloccoDialog", () => ({
  BolleInBloccoDialog: (p: Record<string, unknown>) => {
    m.dialogo(p);
    return <div role="dialog">finestra</div>;
  },
}));

import { BolleDalTelefono } from "@/components/settings/BolleDalTelefonoAI";
import { RevisioneDocumento, RigaDocumentoInIngresso } from "@/components/ddt/DocumentiInIngresso";
import type { DocumentoPersistente } from "@/lib/ddt/documentiPersistenti";

const conClient = (n: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{n}</MemoryRouter>
    </QueryClientProvider>,
  );
beforeEach(() => {
  m.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  m.impostazione = null;
  m.dialogo.mockReset();
});
afterEach(cleanup);

const documento = (p: Partial<DocumentoPersistente> = {}): DocumentoPersistente => ({
  id: "j",
  company_id: "c",
  created_by: "operaio",
  order_id: null,
  destinazione: "magazzino",
  warehouse_id: null,
  source: "campo",
  status: "da_leggere",
  files: [{ path: "c/operaio/j/1-originale.jpg", name: "bolla.jpg", mime: "image/jpeg", size: 1 }],
  result: null,
  last_error: null,
  ddt_id: null,
  created_at: "2026-11-12T08:00:00Z",
  updated_at: "x",
  ...p,
});

it("impostazione: «Legge l'AI subito» è il predefinito e «Solo la foto» si salva con la sua funzione", async () => {
  conClient(<BolleDalTelefono puoModificare />);
  const subito = await screen.findByRole("radio", { name: /Legge l'AI subito/ });
  expect(subito).toBeChecked();
  await waitFor(() => expect(subito).toBeEnabled());
  expect(screen.getByText(/consuma credito AI/)).toBeInTheDocument();
  expect(screen.getByText(/si spende solo per le bolle che l'ufficio decide/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: /Solo la foto/ }));
  await waitFor(() =>
    expect(m.rpc).toHaveBeenCalledWith("acquisti_bolle_telefono_salva", { p_company: "c", p_modo: "solo_foto" }),
  );
});

it("impostazione salvata «solo la foto»: si vede scelta; chi non può modificare non la cambia", async () => {
  m.impostazione = { bolle_telefono_lettura: "solo_foto" };
  conClient(<BolleDalTelefono puoModificare={false} />);
  await waitFor(() => expect(screen.getByRole("radio", { name: /Solo la foto/ })).toBeChecked());
  expect(screen.getByRole("radio", { name: /Legge l'AI subito/ })).toBeDisabled();
});

it("Documenti da registrare: un documento «da leggere» ha «Leggi con l'AI» e «Compila a mano»", () => {
  const riprova = vi.fn().mockResolvedValue(undefined);
  const apri = vi.fn();
  const j = documento();
  conClient(
    <table>
      <tbody>
        <RigaDocumentoInIngresso documento={j} apri={apri} riprova={riprova} riprovando={null} />
      </tbody>
    </table>,
  );
  expect(screen.getByText("Solo foto, da leggere")).toBeInTheDocument();
  expect(screen.getByText("In magazzino")).toBeInTheDocument();
  expect(screen.queryByText("Analisi in corso…")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Leggi con l'AI" }));
  expect(riprova).toHaveBeenCalledWith(j);
  fireEvent.click(screen.getByRole("button", { name: "Compila a mano" }));
  expect(apri).toHaveBeenCalledWith(j);
});

it("«Compila a mano» su un documento da leggere apre la finestra con le righe vuote e la destinazione scelta", async () => {
  const j = documento();
  m.leggi.mockResolvedValue(j);
  conClient(<RevisioneDocumento documento={j} onClose={vi.fn()} />);
  await screen.findByRole("dialog");
  const props = m.dialogo.mock.calls.at(-1)![0] as {
    iniziali: Array<{ compilaAMano?: boolean; righe: unknown[]; documentoJobId: string; destinazione: string }>;
    destinazione: string;
  };
  expect(props.destinazione).toBe("magazzino");
  expect(props.iniziali[0]).toMatchObject({ compilaAMano: true, righe: [], documentoJobId: "j", destinazione: "magazzino" });
});
