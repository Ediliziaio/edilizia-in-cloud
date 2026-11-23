/**
 * Fabbisogno di una commessa: per un materiale senza fornitore la pagina propone da chi
 * comprarlo, con la prova (ordine emesso, listino) e ciò che manca, e lo assegna con un clic.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RigaFabbisogno } from "@/lib/acquisti/fabbisogno";

const oggi = new Date().toLocaleDateString("en-CA");
const fra = (g: number) => { const d = new Date(`${oggi}T12:00:00`); d.setDate(d.getDate() + g); return d.toLocaleDateString("en-CA"); };
const NOME = "Battiscopa in gres porcellanato h 8 cm";
const righe: RigaFabbisogno[] = [{
  order_item_id: "m1", order_id: "o1", commessa: "C-001", phase_id: "f1", fase: "Pavimenti", name: NOME, unita_misura: "m",
  supplier_id: null, fornitore: null, previsto: 62, ordinato: 0, in_bozza: 0, ricevuto: 0, residuo: 62, eccedenza: 0,
  unita_diversa: false, stato: "da_ordinare", data_serve: fra(20), giorni_consegna: null, ordina_entro: fra(10),
}];
const stato = vi.hoisted(() => ({ permessi: { canManagePurchasing: true, canEditOrders: true, canViewCosts: true }, aggiornati: [] as unknown[],
  chieste: {} as Record<string, string>, rotta: null as string | null }));
const tabelle: Record<string, unknown[]> = {
  suppliers: [
    { id: "s1", name: "Ceramiche Rossi", lead_time_days: 10, min_order_amount: 300, is_active: true },
    { id: "s2", name: "Edilcommerciale", lead_time_days: null, min_order_amount: null, is_active: true },
  ],
  listino_fornitore_voci: [{ codice: "BT08", descrizione: NOME, unita: "m", prezzo: 5, sconto_pct: 10,
    listini_fornitore: { supplier_id: "s1", attivo: true, valido_dal: "2026-01-01", valido_al: null } }],
  purchase_order_items: [{ description: NOME, sku: null, unit_of_measure: "m", unit_price: 6, discount_percent: 0, article_template_id: null,
    created_at: "2026-05-02T08:00:00Z", purchase_orders: { supplier_id: "s2", status: "ricevuto", sent_at: "2026-05-03T08:00:00Z" } }],
  order_items: [],
};

vi.mock("@/hooks/useFabbisognoMateriali", () => ({
  useFabbisognoMateriali: () => ({ data: righe, isLoading: false, isError: false, refetch: vi.fn() }),
  useOrdinaDalFabbisogno: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useImpostaDataFabbisogno: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => stato.permessi }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "az1" } }) }));
vi.mock("@/components/operazioni/EccezioniOperative", () => ({ EccezioniOperative: (): null => null }));
vi.mock("@/integrations/supabase/client", () => {
  const da = (tabella: string) => {
    const catena: Record<string, unknown> = {};
    for (const m of ["eq", "not", "order", "limit", "is"]) catena[m] = () => catena;
    catena.select = (colonne: string) => { stato.chieste[tabella] = colonne; return catena; };
    catena.update = (v: unknown) => ({ in: async (_c: string, ids: string[]): Promise<{ error: null }> => { stato.aggiornati.push({ tabella, v, ids }); return { error: null }; } });
    catena.in = () => catena;
    catena.then = (ok: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve(stato.rotta === tabella ? { data: null, error: new Error("lettura fallita") } : { data: tabelle[tabella] ?? [], error: null }).then(ok as never);
    return catena;
  };
  return { supabase: { from: da, rpc: async (): Promise<{ data: unknown[]; error: null }> => ({ data: [], error: null }) } };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: FabbisognoMateriali } = await import("@/pages/azienda/FabbisognoMateriali");
const pagina = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><FabbisognoMateriali orderId="o1" inFinestra /></MemoryRouter></QueryClientProvider>);

describe("fabbisogno della commessa: fornitori proposti con le prove", () => {
  beforeEach(() => { stato.aggiornati.length = 0; stato.chieste = {}; stato.rotta = null; stato.permessi = { canManagePurchasing: true, canEditOrders: true, canViewCosts: true }; });

  it("propone chi ha l'articolo a listino e chi l'ha già venduto, col prezzo, e assegna con un clic", async () => {
    pagina();
    const riga = (await screen.findByTitle(NOME)).closest("li")!;
    await waitFor(() => expect(riga).toHaveTextContent(/Ceramiche Rossi · Questo articolo a listino/));
    expect(riga).toHaveTextContent(/4,50\s?€\/m/);
    expect(riga).toHaveTextContent("+1 altro");
    fireEvent.click(within(riga).getByRole("button", { name: /Dettagli di/ }));
    const elenco = within(riga).getByRole("list", { name: /Fornitori proposti per/ });
    const voci = within(elenco).getAllByRole("listitem");
    expect(voci).toHaveLength(2);
    expect(voci[0]).toHaveTextContent("Ceramiche Rossi");
    expect(voci[0]).toHaveTextContent("Ha già questo articolo");
    expect(voci[0]).toHaveTextContent("consegna 10 gg · ordine minimo 300 €");
    expect(voci[1]).toHaveTextContent(/Edilcommerciale.*ordinato il 03\/05\/2026 a 6,00\s?€\/m/);
    expect(voci[1]).toHaveTextContent("Manca: i tempi di consegna");
    fireEvent.click(within(voci[1]).getByRole("button", { name: "Assegna" }));
    await waitFor(() => expect(stato.aggiornati).toEqual([{ tabella: "order_items", v: { supplier_id: "s2" }, ids: ["m1"] }]));
  });

  it("chi non vede i costi vede chi vende l'articolo, non a quanto", async () => {
    stato.permessi = { canManagePurchasing: false, canEditOrders: true, canViewCosts: false };
    pagina();
    const riga = (await screen.findByTitle(NOME)).closest("li")!;
    await waitFor(() => expect(riga).toHaveTextContent(/Ceramiche Rossi · Questo articolo a listino/));
    expect(riga).not.toHaveTextContent("€");
    expect(riga).toHaveTextContent("manca: il prezzo");
    // Il prezzo di listino non viene nemmeno chiesto al database: nasconderlo a schermo non basta.
    expect(stato.chieste.listino_fornitore_voci).not.toMatch(/prezzo|sconto/);
  });

  it("chi vede i costi chiede anche prezzo e sconto del listino", async () => {
    pagina();
    await waitFor(() => expect(stato.chieste.listino_fornitore_voci).toMatch(/prezzo, sconto_pct/));
  });

  it("se listini o ordini non si leggono lo dice, invece di non proporre niente in silenzio", async () => {
    stato.rotta = "purchase_order_items";
    pagina();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Non riesco a leggere listini e ordini/);
  });
});
