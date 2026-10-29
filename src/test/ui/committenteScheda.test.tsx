import {cleanup, render, screen} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import CommittenteDetail from "@/pages/azienda/CommittenteDetail";

const m = vi.hoisted(() => ({importi: true, tipo: "appaltatore" as string}));
vi.mock("@/contexts/AuthContext", () => ({useAuth: () => ({effectiveCompany: {id: "c"}})}));
vi.mock("@/hooks/usePermissions", () => ({usePermissions: () => ({isAdmin: false, canEditCustomers: true, canViewOrderAmounts: m.importi})}));
vi.mock("@/hooks/use-toast", () => ({useToast: () => ({toast: vi.fn()})}));
vi.mock("@/integrations/supabase/client", () => ({supabase: {}}));
vi.mock("react-router-dom", async () => {
  const vero = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {...vero, useParams: () => ({id: "k"}), useNavigate: () => vi.fn()};
});
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({invalidateQueries: vi.fn()}),
  useMutation: () => ({isPending: false, mutate: vi.fn()}),
  useQuery: ({queryKey}: {queryKey: unknown[]}) => {
    const k = String(queryKey[0]);
    if (k === "committente") {
      const vuoto: string | null = null;
      return {data: {id: "k", business_name: "Edil Rossi S.r.l.", customer_type: m.tipo, fiscal_code: "IT123", first_name: vuoto, last_name: vuoto, email: vuoto, phone: vuoto, address: vuoto, city: vuoto, postal_code: vuoto, province: vuoto}, isLoading: false};
    }
    if (k === "appalto-contratti") return {data: [{id: "t1", nome: "Accordo 2026", valido_dal: "2026-01-01", valido_al: null as string | null, giorni_pagamento: 60, ritenuta_pct: 0, maggiorazione_straordinario_pct: 25, maggiorazione_festivo_pct: 50, modo_fatturazione: "mensile_cumulativa", include_fornitura: false, riferimento_committente: null as string | null, condizioni: null as string | null, note: null as string | null, attivo: true}], isLoading: false};
    if (k === "appalto-tariffe") return {data: [{id: "r1", contratto_id: "t1", tipo: "manodopera", codice: null as string | null, descrizione: "Giornata uomo", unita_misura: "uomo_giorno", prezzo_unitario: 180, maggiorazione_straordinario_pct: null as number | null, maggiorazione_festivo_pct: null as number | null, qualifica: null as string | null, note: null as string | null, ordine: 0, attivo: true}], isLoading: false};
    return {data: [] as unknown[], isLoading: false};
  },
}));

beforeEach(() => {m.importi = true; m.tipo = "appaltatore";});
afterEach(cleanup);
const draw = () => render(<MemoryRouter><CommittenteDetail /></MemoryRouter>);

it("la scheda apre sul contratto in corso e sulle sue condizioni", () => {
  draw();
  expect(screen.getByText("Edil Rossi S.r.l.")).toBeVisible();
  expect(screen.getByText("Accordo 2026")).toBeVisible();
  expect(screen.getByText("60 gg")).toBeVisible();
  // Il modo di fatturazione e' una condizione, non un dettaglio tecnico.
  expect(screen.getByText("Mensile, tutte le commesse")).toBeVisible();
  expect(screen.getByText("Sola manodopera")).toBeVisible();
});

it("il listino si vede con il permesso sugli importi", () => {
  draw();
  expect(screen.getByText("Giornata uomo")).toBeVisible();
  expect(screen.getByText("€ 180,00")).toBeVisible();
});

it("senza il permesso sugli importi i prezzi del committente non compaiono", () => {
  m.importi = false;
  draw();
  expect(screen.queryByText("€ 180,00")).not.toBeInTheDocument();
  expect(screen.queryByText("Giornata uomo")).not.toBeInTheDocument();
  expect(screen.getByText(/Importi delle commesse/)).toBeVisible();
  // Le condizioni del contratto restano: non sono prezzi.
  expect(screen.getByText("60 gg")).toBeVisible();
});

it("un cliente privato aperto come committente non mostra contratto e listino", () => {
  m.tipo = "privato";
  draw();
  expect(screen.getByText(/è un cliente, non un committente/)).toBeVisible();
  expect(screen.queryByText("Accordo 2026")).not.toBeInTheDocument();
  expect(screen.queryByText("€ 180,00")).not.toBeInTheDocument();
});
