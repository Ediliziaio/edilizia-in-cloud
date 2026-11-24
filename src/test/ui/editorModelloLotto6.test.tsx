import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SurveyTemplateEditor } from "@/pages/azienda/impostazioni/SurveyTemplateEditor";
import type { TemplateSchema } from "@/types/surveys";

/** Editor dei modelli: riga del preventivo e limiti dei numeri si salvano (piano sopralluoghi, lotto 6). */
const s = vi.hoisted(() => ({ aggiorna: vi.fn(async () => undefined) }));
vi.mock("@/lib/api/surveys", () => ({ updateTemplate: (...a: unknown[]) => s.aggiorna(...(a as [])) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useSettingsDraftGuard", () => ({ useSettingsDraftGuard: () => () => true }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: ({ mutationFn, onSuccess }: { mutationFn: () => Promise<void>; onSuccess: () => void }) => ({ isPending: false, mutate: () => { void mutationFn().then(onSuccess); } }),
}));
afterEach(cleanup);

const schema = {
  version: 1, header_schema: [], general_required_photos: [], area_definition: { label: "Stanza", label_plural: "Stanze", fields: [] },
  element_types: [{ key: "finestra", label: "Finestra", label_plural: "Finestre", required_photos: [], sections: [{ key: "dati", label: "Dati", fields: [
    { key: "materiale", label: "Materiale", type: "select", options: [{ value: "pvc", label: "PVC" }] },
    { key: "larghezza", label: "Larghezza", type: "dimension", unit: "cm" },
    { key: "altezza", label: "Altezza", type: "dimension", unit: "cm" },
  ] }] }],
} as unknown as TemplateSchema;

it("la riga del preventivo parte da una proposta, si salva e segnala i campi inesistenti", async () => {
  render(<SurveyTemplateEditor templateId="t" initialName="Prova" initialDescription={null} initialCategory="infissi" initialAreaLabel="Stanza"
    initialAreaLabelPlural="Stanze" initialElementLabel="Elemento" initialSchema={schema} puoModificare onClose={vi.fn()} />);
  fireEvent.mouseDown(screen.getByRole("tab", { name: /Elementi/ }));
  fireEvent.click(screen.getByRole("tab", { name: /Elementi/ }));
  fireEvent.click(await screen.findByText("Finestra"));
  fireEvent.click(screen.getByRole("button", { name: "Imposta" }));
  const descrizione = screen.getByLabelText("Descrizione nel preventivo di Finestra") as HTMLInputElement;
  expect(descrizione.value).toBe("Finestra {materiale} {larghezza}x{altezza} cm");
  fireEvent.change(descrizione, { target: { value: "Finestra {materiale} {colore}" } });
  expect(screen.getByText(/Non sono campi di questo elemento: \{colore\}/)).toBeTruthy();
  fireEvent.change(descrizione, { target: { value: "Finestra {materiale} {larghezza}x{altezza} cm" } });
  fireEvent.click(screen.getByRole("button", { name: /Salva/ }));
  await waitFor(() => expect(s.aggiorna).toHaveBeenCalled());
  const salvato = (s.aggiorna.mock.calls[0] as unknown as [string, { schema: TemplateSchema }])[1].schema;
  expect(salvato.output_mapping?.estimate_lines?.finestra).toEqual({ description_template: "Finestra {materiale} {larghezza}x{altezza} cm", unit: "pz", quantity_field: "quantity" });
});
