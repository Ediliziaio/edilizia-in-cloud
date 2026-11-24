import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DocumentoDalRilievo } from "@/components/sopralluoghi/DocumentoDalRilievo";
import type { SurveyDetail } from "@/lib/api/surveys";
import { bozzaComputoSchema } from "@/lib/computo/editorNativo";

/** Dal rilievo al preventivo e al computo (piano sopralluoghi, lotto 4). */
const s = vi.hoisted(() => ({
  insert: vi.fn(), rpc: vi.fn(), update: vi.fn(), salva: vi.fn(), navigate: vi.fn(),
  permessi: { canEditPreventivi: true, solaLettura: false },
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => s.navigate }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "az" }, user: { id: "u" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => s.permessi }));
vi.mock("@/lib/api/surveys", () => ({ updateSurvey: async (id: string, patch: unknown) => { s.update(id, patch); } }));
vi.mock("@/lib/computo/cloudComputo", () => ({ salvaComputoCloud: async (...a: unknown[]) => { s.salva(...a); return {}; } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async (nome: string, args: unknown): Promise<{ data: unknown; error: { message: string } | null }> => {
    s.rpc(nome, args);
    return { data: nome === "generate_quote_number" ? "OFF-2026-042" : null, error: null };
  },
  from: () => ({ insert: (r: unknown) => { s.insert(r); return { select: () => ({ single: async (): Promise<{ data: { id: string }; error: { message: string } | null }> => ({ data: { id: "q-1" }, error: null }) }) }; } }),
} }));

const detail = {
  survey: { id: "sop-1", code: "SOP-2026-0042", status: "reviewed", contact_id: "c-1", opportunity_id: "o-1", estimate_id: null,
    address: "Via Roma", address_number: "3", city: "Torino", zip: "10100", province: "TO", template_schema_snapshot: null },
  template: { name: "Rilievo Bagno", category: "bagno", schema: {
    version: 1, header_schema: [], general_required_photos: [], area_definition: { label: "A", label_plural: "A", fields: [] },
    element_types: [{ key: "wc", label: "WC", label_plural: "WC", required_photos: [], sections: [] }, { key: "rivestimenti", label: "Rivestimenti", label_plural: "R", required_photos: [], sections: [] }],
    output_mapping: { estimate_lines: { wc: { unit: "pz", description_template: "WC {tipo_nuovo}" }, rivestimenti: { unit: "mq", description_template: "Rivestimento {pavimento_tipo_nuovo}" } } },
  } },
  areas: [{ id: "a", name: "Bagno", position: 0 }],
  elements: [
    { id: "e1", area_id: "a", element_type: "wc", element_label: null, position: 0, values: { tipo_nuovo: "sospeso" }, quantity: 1 },
    { id: "e2", area_id: "a", element_type: "rivestimenti", element_label: null, position: 1, values: { pavimento_tipo_nuovo: "Gres" }, quantity: 1 },
  ],
  media: [],
} as unknown as SurveyDetail;

beforeEach(() => { for (const f of [s.insert, s.rpc, s.update, s.salva, s.navigate]) f.mockClear(); s.permessi = { canEditPreventivi: true, solaLettura: false }; });
afterEach(cleanup);

it("crea il preventivo in bozza con le righe del rilievo, i prezzi scritti e il collegamento indietro", async () => {
  render(<DocumentoDalRilievo detail={detail} />);
  fireEvent.click(screen.getByRole("button", { name: "Crea preventivo" }));
  expect((screen.getByLabelText("Descrizione riga 1") as HTMLInputElement).value).toBe("WC sospeso");
  expect(screen.getByText("Misura non trovata")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Prezzo riga 1"), { target: { value: "350,5" } });
  fireEvent.change(screen.getByLabelText("Quantità riga 2"), { target: { value: "12,5" } });
  fireEvent.click(screen.getByRole("button", { name: "Crea preventivo (2)" }));
  await waitFor(() => expect(s.navigate).toHaveBeenCalledWith("/azienda/marketing/preventivi/q-1"));
  expect(s.insert).toHaveBeenCalledWith(expect.objectContaining({ status: "bozza", contact_id: "c-1", opportunity_id: "o-1", title: "Rilievo Bagno · SOP-2026-0042", quote_number: "OFF-2026-042" }));
  const items = (s.rpc.mock.calls.find(([n]) => n === "save_quote_items_atomic")![1] as { p_items: Array<Record<string, unknown>> }).p_items;
  expect(items).toEqual([
    expect.objectContaining({ name: "Bagno — WC sospeso", quantity: 1, unit_price: 350.5, vat_rate: 10, unit_of_measure: "pz" }),
    expect.objectContaining({ name: "Bagno — Rivestimento Gres", quantity: 12.5, unit_of_measure: "mq" }),
  ]);
  expect(s.update).toHaveBeenCalledWith("sop-1", { estimate_id: "q-1" });
});

it("una riga tolta non entra", async () => {
  render(<DocumentoDalRilievo detail={detail} />);
  fireEvent.click(screen.getByRole("button", { name: "Crea preventivo" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Includi Rivestimento Gres" }));
  fireEvent.click(screen.getByRole("button", { name: "Crea preventivo (1)" }));
  await waitFor(() => expect(s.navigate).toHaveBeenCalled());
  const items = (s.rpc.mock.calls.find(([n]) => n === "save_quote_items_atomic")![1] as { p_items: unknown[] }).p_items;
  expect(items).toHaveLength(1);
});

it("crea il computo con l'ambiente come capitolo, l'indirizzo del cantiere e il cliente", async () => {
  render(<DocumentoDalRilievo detail={detail} />);
  fireEvent.click(screen.getByRole("button", { name: "Crea computo" }));
  expect(screen.queryByLabelText("Prezzo riga 1")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Crea computo (2)" }));
  await waitFor(() => expect(s.salva).toHaveBeenCalledTimes(1));
  const [azienda, id, , bozza, revisione] = s.salva.mock.calls[0] as [string, string, string, { voci: Array<Record<string, unknown>>; [k: string]: unknown }, number];
  expect(azienda).toBe("az");
  expect(revisione).toBe(0);
  // la bozza è valida per l'editor del computo (salvaComputoCloud la rilegge con questo schema)
  expect(bozzaComputoSchema.safeParse(bozza).success).toBe(true);
  expect(bozza).toMatchObject({ oggetto: "Dal sopralluogo SOP-2026-0042", cantiere_indirizzo: "Via Roma 3", cantiere_citta: "Torino", clienteId: "c-1", opportunitaId: "o-1" });
  expect(bozza.voci.map((v) => [v.capitolo, v.descrizione, v.unita, v.quantita])).toEqual([["Bagno", "WC sospeso", "cad", "1"], ["Bagno", "Rivestimento Gres", "mq", "1"]]);
  expect(s.navigate).toHaveBeenCalledWith(`/azienda/marketing/preventivi/computo?bozza=${id}&esistente=1`);
});

it("senza il permesso dei preventivi non si vede niente; per il fotovoltaico solo il computo", () => {
  s.permessi = { canEditPreventivi: false, solaLettura: false };
  const { unmount } = render(<DocumentoDalRilievo detail={detail} />);
  expect(screen.queryByRole("button", { name: "Crea computo" })).toBeNull();
  unmount();
  s.permessi = { canEditPreventivi: true, solaLettura: false };
  render(<DocumentoDalRilievo detail={{ ...detail, template: { ...detail.template, category: "fotovoltaico" } }} />);
  expect(screen.queryByRole("button", { name: "Crea preventivo" })).toBeNull();
  expect(screen.getByRole("button", { name: "Crea computo" })).toBeTruthy();
});

it("se il rilievo ha già un preventivo, lo si apre da qui", () => {
  render(<DocumentoDalRilievo detail={{ ...detail, survey: { ...detail.survey, estimate_id: "q-9" } }} />);
  fireEvent.click(screen.getByRole("button", { name: "Apri preventivo" }));
  expect(s.navigate).toHaveBeenCalledWith("/azienda/marketing/preventivi/q-9");
});
