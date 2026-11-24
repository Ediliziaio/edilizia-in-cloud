import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SopralluoghiVendita } from "@/components/sopralluoghi/SopralluoghiVendita";
import { ordinaRilieviVendita, percorsoNuovoSopralluogo, type RilievoVendita } from "@/lib/sopralluoghi/vendita";

/** I sopralluoghi nelle Vendite (piano sopralluoghi, lotto 3). */
const s = vi.hoisted(() => ({ navigate: vi.fn(), righe: [] as unknown[], attivo: true, permessi: { canViewSopralluoghi: true, solaLettura: false } }));
vi.mock("react-router-dom", () => ({ useNavigate: () => s.navigate }));
vi.mock("@/hooks/useFeatureFlags", () => ({ useFeatureFlags: () => ({ isFeatureEnabled: () => s.attivo }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => s.permessi }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({ useQuery: ({ enabled }: { enabled: boolean }) => ({ data: enabled ? s.righe : undefined, isLoading: false, isError: false }) }));

const r = (id: string, patch: Partial<RilievoVendita>): RilievoVendita => ({
  id, code: id.toUpperCase(), status: "draft", tipo: "commerciale", scheduled_at: null, completed_at: null,
  opportunity_id: null, order_id: null, estimate_id: null, created_at: "2026-11-01T10:00:00Z", ...patch,
});
beforeEach(() => { s.navigate.mockClear(); s.attivo = true; s.permessi = { canViewSopralluoghi: true, solaLettura: false }; });
afterEach(cleanup);

it("prima quelli della trattativa, poi gli altri del contatto, i più recenti in cima", () => {
  const ordinati = ordinaRilieviVendita([
    r("altro", { opportunity_id: "opp-2", created_at: "2026-11-20T10:00:00Z" }),
    r("vecchio", { opportunity_id: "opp-1", created_at: "2026-10-01T10:00:00Z" }),
    r("nuovo", { opportunity_id: "opp-1", created_at: "2026-11-10T10:00:00Z" }),
  ], "opp-1");
  expect(ordinati.map((x) => x.id)).toEqual(["nuovo", "vecchio", "altro"]);
});

it("il nuovo sopralluogo parte già legato a contatto e trattativa, col tipo scelto", () => {
  expect(percorsoNuovoSopralluogo("c-1", "o-1", "commerciale")).toBe("/azienda/sopralluoghi/nuovo?contact=c-1&opportunity=o-1&tipo=commerciale");
});

it("mostra i rilievi col tipo, li apre, e crea commerciale o tecnico", () => {
  s.righe = [r("sop-1", { opportunity_id: "o-1", order_id: "ord" }), r("sop-2", { tipo: "tecnico", opportunity_id: "o-9" })];
  render(<SopralluoghiVendita companyId="az" contactId="c-1" opportunityId="o-1" />);
  expect(screen.getByText("Collegato a una commessa")).toBeTruthy();
  expect(screen.getByText("Dello stesso contatto, su un'altra trattativa")).toBeTruthy();
  fireEvent.click(screen.getByText("SOP-1"));
  expect(s.navigate).toHaveBeenLastCalledWith("/azienda/sopralluoghi/sop-1");
  fireEvent.click(screen.getByRole("button", { name: /Sopralluogo commerciale/ }));
  expect(s.navigate).toHaveBeenLastCalledWith("/azienda/sopralluoghi/nuovo?contact=c-1&opportunity=o-1&tipo=commerciale");
  fireEvent.click(screen.getByRole("button", { name: "Rilievo tecnico" }));
  expect(s.navigate).toHaveBeenLastCalledWith("/azienda/sopralluoghi/nuovo?contact=c-1&opportunity=o-1&tipo=tecnico");
});

it("senza modulo o permesso non c'è; in sola lettura niente pulsanti", () => {
  s.attivo = false;
  const { container, unmount } = render(<SopralluoghiVendita companyId="az" contactId="c-1" />);
  expect(container.textContent).toBe("");
  unmount();
  s.attivo = true; s.permessi = { canViewSopralluoghi: true, solaLettura: true }; s.righe = [];
  render(<SopralluoghiVendita companyId="az" contactId="c-1" />);
  expect(screen.queryByRole("button", { name: /Sopralluogo commerciale/ })).toBeNull();
});

it("porta alla bacheca filtrata sui commerciali (non c'è una voce di menu nelle Vendite)", () => {
  s.righe = [];
  render(<SopralluoghiVendita companyId="az" contactId="c-1" />);
  fireEvent.click(screen.getByRole("button", { name: "Tutti i sopralluoghi" }));
  expect(s.navigate).toHaveBeenCalledWith("/azienda/sopralluoghi?sop_tipo=commerciali");
});
