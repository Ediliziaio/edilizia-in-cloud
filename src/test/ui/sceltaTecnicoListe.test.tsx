import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SurveyAssignDialog } from "@/components/sopralluoghi/SurveyAssignDialog";

/**
 * «Assegna sopralluogo» mostrava tutte le persone legate all'azienda, clienti compresi.
 * Ora solo lo staff, con i tecnici (area «Tecnico» in Utenti e permessi) in cima.
 */
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "az" }));
vi.mock("@/hooks/useCompanyStaffUsers", () => ({ useCompanyStaffUsers: () => ({ data: [
  { id: "comm", first_name: "Carla", last_name: "Commerciale", roles: ["salesperson"] },
  { id: "op", first_name: "Oscar", last_name: "Operaio", roles: ["employee"] },
  { id: "tec", first_name: "Tina", last_name: "Tecnica", roles: ["company_staff"] },
] }) }));
vi.mock("@/hooks/useTecniciAzienda", () => ({ useTecniciAzienda: () => new Set(["tec"]) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [] as unknown[], isError: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => { throw new Error("non deve leggere profiles"); } } }));
afterEach(cleanup);

it("solo staff, tecnici prima, divisi per gruppo", () => {
  render(<SurveyAssignDialog surveyId="s" open onOpenChange={vi.fn()} />);
  fireEvent.click(screen.getAllByRole("combobox")[0]);
  const lista = screen.getByRole("listbox");
  const testo = within(lista).getAllByText(/./).map((n) => n.textContent);
  expect(testo.indexOf("Tecnici")).toBeLessThan(testo.indexOf("Tina Tecnica"));
  expect(testo.indexOf("Tina Tecnica")).toBeLessThan(testo.indexOf("Operai e subappaltatori"));
  expect(testo.indexOf("Oscar Operaio")).toBeLessThan(testo.indexOf("Altro personale"));
  expect(testo).toContain("Carla Commerciale");
});
