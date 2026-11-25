import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

const scritture = vi.hoisted(() => ({ insert: [] as object[], delete: [] as string[] }));
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
      { id: "documento-3", folder_id: "cartella-2", name: "Foto getto.jpg", mime_type: "image/jpeg", storage_path: "demo/foto", created_at: "2026-03-01" },
    ],
    media_library_folders: [
      { id: "cartella-1", name: "Verbali", mode: "manual", archived_at: null, match_query: null, parent_id: null },
      { id: "cartella-2", name: "Cantiere Rossi", mode: "manual", archived_at: null, match_query: null, parent_id: "cartella-1" },
      { id: "cartella-3", name: "Vuota", mode: "manual", archived_at: null, match_query: null, parent_id: "cartella-2" },
    ],
  };

  return { supabase: {
    rpc: (nome: string) => Promise.resolve({ error: null, data: nome !== "drive_documenti_clienti" ? [] : [
      { cliente_chiave: "c1", cliente: "Rossi Mario", order_id: "o1", order_code: "C-001", commessa: "Villa al mare", cartella: "ddt", id: "ddt:1", nome: "DDT 12", bucket: "ddt-documenti", path: "a/b.pdf", link: null, data: "2026-11-01" },
      { cliente_chiave: "c1", cliente: "Rossi Mario", order_id: "o1", order_code: "C-001", commessa: "Villa al mare", cartella: "fatture_fornitori", id: "fattura-ricevuta:1", nome: "Fattura 7", bucket: "documenti-smart", path: "a/f.pdf", link: null, data: "2026-11-02" },
      { cliente_chiave: "c1", cliente: "Rossi Mario", order_id: "o3", order_code: "C-003", commessa: "Bagno", cartella: "ddt", id: "ddt:2", nome: "DDT 40", bucket: "ddt-documenti", path: "a/c.pdf", link: null, data: "2026-11-20" },
      { cliente_chiave: "c2", cliente: "Bianchi Srl", order_id: "o2", order_code: "C-002", commessa: null, cartella: "ordini_acquisto", id: "oda:1", nome: "Ordine ODA-1", bucket: null, path: null, link: "/azienda/ordini-acquisto/1", data: "2026-11-03" },
    ] }),
    from: (table: string) => {
      const query = {
        select: () => query, eq: () => query, order: () => query, range: () => query,
        abortSignal: () => query, not: () => query, is: () => query,
        maybeSingle: () => query,
        insert: (riga: object) => { scritture.insert.push(riga); return query; },
        delete: () => { scritture.delete.push(table); return query; },
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
  await screen.findByText("3 risultati");
  fireEvent.click(await screen.findByRole("button", { name: /Verbali/ }));
  await screen.findByText("1 risultato");
  const ricerca = screen.getByPlaceholderText("Cerca per nome, tipo, area o collegamento...");
  fireEvent.change(ricerca, { target: { value: "inesistente" } });
  await screen.findByText("Nessun documento trovato");
  fireEvent.click(screen.getAllByRole("button", { name: "Mostra tutti" })[0]);
  expect(ricerca).toHaveValue("");
  await screen.findByText("3 risultati");
});

it("entra nelle sottocartelle, torna su con le briciole e crea una cartella dentro quella aperta", async () => {
  render(<MemoryRouter><QueryClientProvider client={new QueryClient()}>
    <ContenutiMultimediali />
  </QueryClientProvider></MemoryRouter>);
  await screen.findByText("3 risultati");
  // Nel menu a sinistra solo la cartella in radice.
  expect(screen.queryByRole("button", { name: /^Cantiere Rossi/ })).toBeNull();
  fireEvent.click(await screen.findByRole("button", { name: /^Verbali/ }));
  await screen.findByText("1 risultato");
  fireEvent.click(await screen.findByRole("button", { name: /^Cantiere Rossi/ }));
  const percorso = await screen.findByRole("navigation", { name: "Percorso" });
  await vi.waitFor(() => expect(percorso).toHaveTextContent("Cantiere Rossi"));

  expect(percorso).toHaveTextContent("Drive");
  expect(percorso).toHaveTextContent("Verbali");
  expect(percorso).toHaveTextContent("Cantiere Rossi");

  fireEvent.click(screen.getByRole("button", { name: /Nuova cartella qui/ }));
  await screen.findByText("Dentro «Verbali / Cantiere Rossi».");
  expect(screen.queryByLabelText("Tipo di cartella")).toBeNull();
  fireEvent.change(screen.getByLabelText("Nome cartella"), { target: { value: "Getti" } });
  fireEvent.click(screen.getByRole("button", { name: /Crea cartella/ }));
  await vi.waitFor(() => expect(scritture.insert).toHaveLength(1));
  expect(scritture.insert[0]).toMatchObject({ name: "Getti", parent_id: "cartella-2", mode: "manual", company_id: "demo" });

  // Le briciole riportano su (il finto database non restituisce la cartella creata: si riapre a mano).
  fireEvent.click(await screen.findByRole("button", { name: /^Verbali/ }));
  fireEvent.click(await screen.findByRole("button", { name: /^Cantiere Rossi/ }));
  await vi.waitFor(() => expect(screen.getByRole("navigation", { name: "Percorso" })).toHaveTextContent("Cantiere Rossi"));
  fireEvent.click(within(screen.getByRole("navigation", { name: "Percorso" })).getByRole("button", { name: "Verbali" }));
  await screen.findByText("1 risultato");
  fireEvent.click(within(screen.getByRole("navigation", { name: "Percorso" })).getByRole("button", { name: "Drive" }));
  await screen.findByText("3 risultati");
});

it("Clienti: una cartella per cliente, dentro le commesse e le cartelle standard coi documenti", async () => {
  render(<MemoryRouter><QueryClientProvider client={new QueryClient()}>
    <ContenutiMultimediali />
  </QueryClientProvider></MemoryRouter>);
  await screen.findByText("3 risultati");
  fireEvent.click(screen.getByRole("button", { name: /^Clienti/ }));
  const elenco = await screen.findByLabelText("Clienti");
  // Aperta «Clienti», nel menu è evidenziata solo lei.
  expect(screen.getByRole("button", { name: /^Clienti/ })).toHaveAttribute("aria-current", "true");
  expect(screen.getByRole("button", { name: /^Tutti/ })).not.toHaveAttribute("aria-current");
  expect(within(elenco).getAllByRole("button").map(b => b.textContent)).toEqual(["Bianchi Srl1", "Rossi Mario3"]);
  fireEvent.click(within(elenco).getByRole("button", { name: /Rossi Mario/ }));

  // Dentro il cliente: le sue commesse, dalla più recente, e le cartelle di tutte le commesse.
  const commesse = await screen.findByLabelText("Commesse del cliente");
  expect(within(commesse).getAllByRole("button").map(b => b.textContent)).toEqual(["C-003 · Bagno1", "C-001 · Villa al mare2"]);
  const cartelle = screen.getByLabelText("Cartelle del cliente");
  expect(within(cartelle).getAllByRole("button")).toHaveLength(11);
  expect(within(cartelle).getByRole("button", { name: /^DDT/ })).toHaveTextContent("2");
  await screen.findByText("3 risultati");

  // Dentro una commessa: le stesse cartelle, solo coi suoi documenti.
  fireEvent.click(within(commesse).getByRole("button", { name: /Villa al mare/ }));
  const cartelleCommessa = await screen.findByLabelText("Cartelle della commessa");
  expect(within(cartelleCommessa).getAllByRole("button")).toHaveLength(11);
  expect(within(cartelleCommessa).getByRole("button", { name: /^DDT/ })).toHaveTextContent("1");
  await screen.findByText("2 risultati");
  fireEvent.click(within(cartelleCommessa).getByRole("button", { name: /^DDT/ }));
  await screen.findByText("1 risultato");
  const percorso = screen.getByRole("navigation", { name: "Percorso" });
  expect(percorso).toHaveTextContent("Clienti");
  expect(percorso).toHaveTextContent("Rossi Mario");
  expect(percorso).toHaveTextContent("C-001 · Villa al mare");
  expect(percorso).toHaveTextContent("DDT");

  // Il percorso riporta su: commessa, poi cliente, poi Drive.
  fireEvent.click(within(percorso).getByRole("button", { name: "C-001 · Villa al mare" }));
  await screen.findByLabelText("Cartelle della commessa");
  await screen.findByText("2 risultati");
  fireEvent.click(within(screen.getByRole("navigation", { name: "Percorso" })).getByRole("button", { name: "Rossi Mario" }));
  await screen.findByLabelText("Commesse del cliente");
  await screen.findByText("3 risultati");
  fireEvent.click(within(screen.getByRole("navigation", { name: "Percorso" })).getByRole("button", { name: "Drive" }));
  await screen.findByText("3 risultati");
});
