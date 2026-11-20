import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import ContenutiMultimediali from "@/pages/azienda/ContenutiMultimediali";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "demo" }, user: { id: "utente" } }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isAdmin: true, isLoading: false, solaLettura: false }),
}));
vi.mock("@/components/documenti/SmartDocumentInboxDialog", () => ({
  SmartDocumentInboxDialog: (): null => null,
}));
vi.mock("@/components/documenti/SmartDocumentImportModal", () => ({
  SmartDocumentImportModal: (): null => null,
}));

vi.mock("@/integrations/supabase/client", () => {
  const tables: Record<string, object[]> = {
    media_library_files: [
      { id: "documento-1", folder_id: "cartella-1", name: "Verbale.pdf", mime_type: "application/pdf", storage_path: "demo/verbale", created_at: "2026-01-01" },
      { id: "documento-2", folder_id: null, name: "Capitolato.pdf", mime_type: "application/pdf", storage_path: "demo/capitolato", created_at: "2026-02-01" },
    ],
    media_library_folders: [
      { id: "cartella-1", name: "Verbali", mode: "manual", archived_at: null, match_query: null },
    ],
  };

  return { supabase: {
    from: (table: string) => {
      const query = {
        select: () => query, eq: () => query, order: () => query, range: () => query,
        abortSignal: () => query, not: () => query, is: () => query,
        then: (resolve: (result: { data: object[]; error: null }) => void) => {
          resolve({ data: tables[table] ?? [], error: null });
        },
      };
      return query;
    },
  } };
});

afterEach(cleanup);

it("apre una cartella manuale e Mostra tutti azzera cartella e ricerca", async () => {
  render(<MemoryRouter><QueryClientProvider client={new QueryClient()}>
    <ContenutiMultimediali />
  </QueryClientProvider></MemoryRouter>);
  await screen.findByText("2 risultati");
  fireEvent.click(await screen.findByRole("button", { name: /Verbali/ }));
  await screen.findByText("1 risultato");
  const ricerca = screen.getByPlaceholderText("Cerca per nome, tipo, area o collegamento...");
  fireEvent.change(ricerca, { target: { value: "inesistente" } });
  await screen.findByText("Nessun documento trovato");
  fireEvent.click(screen.getAllByRole("button", { name: "Mostra tutti" })[0]);
  expect(ricerca).toHaveValue("");
  await screen.findByText("2 risultati");
});
