// Materiale preso dal magazzino: l'ufficio sceglie il prodotto e parte lo scarico, una riga per volta.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), edita: true }));
vi.mock("@/integrations/supabase/client", () => {
  const prodotti = { select: () => prodotti, eq: () => prodotti, gt: () => prodotti, order: () => prodotti, limit: async () => ({ data: [{ id: "p1", name: "Sacco cemento", quantity: 55 }], error: null as unknown }) };
  const fornitori = { select: () => fornitori, eq: () => fornitori, order: async () => ({ data: [] as unknown[], error: null as unknown }) };
  return { supabase: { rpc: m.rpc, from: (t: string) => (t === "warehouse_stock" ? prodotti : fornitori) } };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditWarehouse: m.edita }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MaterialiDaRegolarizzare } from "@/components/orders/materiali/MaterialiDaRegolarizzare";

const apri = () => render(<QueryClientProvider client={new QueryClient()}><MaterialiDaRegolarizzare orderId="o" /></QueryClientProvider>);
const riga = { rapportino_id: "r", chiave: "sacco cemento|2.5", data_lavoro: "2026-11-03", nome: "Sacco cemento", quantita: 2.5, unita: "sacco", fornitore: null as string | null, provenienza: "magazzino" };

afterEach(() => { cleanup(); m.rpc.mockReset(); m.edita = true; });

it("propone il prodotto con lo stesso nome e i pezzi interi, poi scarica", async () => {
  m.rpc.mockImplementation(async (f: string) => ({ data: f === "materiali_da_regolarizzare" ? [riga] : 1, error: null }));
  apri();
  fireEvent.click(await screen.findByRole("checkbox", { name: "Scegli Sacco cemento" }));
  fireEvent.click(screen.getByRole("button", { name: "Scarica dal magazzino" }));
  await screen.findByText(/55 disponibili/);
  expect(screen.getByRole("textbox", { name: "Pezzi di Sacco cemento" })).toHaveValue("3");
  fireEvent.click(screen.getByRole("button", { name: "Scarica" }));
  await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("materiali_scarica_magazzino", {
    p_order_id: "o", p_righe: [{ rapportino_id: "r", chiave: "sacco cemento|2.5", stock_item_id: "p1", quantita: 3 }],
  }));
});

it("senza il permesso di magazzino lo scarico non si offre", async () => {
  m.edita = false;
  m.rpc.mockImplementation(async () => ({ data: [riga], error: null }));
  apri();
  fireEvent.click(await screen.findByRole("checkbox", { name: "Scegli Sacco cemento" }));
  expect(screen.queryByRole("button", { name: "Scarica dal magazzino" })).toBeNull();
});
