import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ContactDialog } from "@/components/marketing/ContactDialog";

const db = vi.hoisted(() => ({ result: { data: null, error: null } as { data: unknown; error: unknown } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ neq: () => ({ limit: async () => db.result }) }) }) }) }) } }));
vi.mock("@/components/marketing/TagSelector", () => ({ TagSelector: (): null => null }));
vi.mock("@/components/sedi/SedeSelect", () => ({ SedeSelect: (): null => null }));
vi.mock("@/components/shared/ComuneAutocomplete", () => ({ ComuneAutocomplete: ({ id, value }: { id: string; value: string }) => <input id={id} value={value} readOnly /> }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
afterEach(() => { cleanup(); db.result = { data: null, error: null }; });
function setup(onSave = vi.fn().mockResolvedValue(undefined), companyId?: string) {
  const close = vi.fn();
  render(<ContactDialog open onOpenChange={close} onSave={onSave} companyId={companyId} initialData={{ first_name: "Demo", email: "demo@example.test" }} />);
  return { close, onSave };
}
it("associa i campi e blocca chiusura e doppio salvataggio durante la richiesta", async () => {
  let finish!: () => void;
  const save = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const { close } = setup(save);
  expect(screen.getByLabelText("Nome *")).toHaveValue("Demo");
  expect(screen.getByLabelText("Città")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText("Nome *")).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Salvataggio..." }));
  expect(close).not.toHaveBeenCalled();
  expect(save).toHaveBeenCalledTimes(1);
  finish();
  await waitFor(() => expect(close).toHaveBeenCalledWith(false));
});
it("se il controllo duplicati fallisce conserva la bozza e non salva senza controllo", async () => {
  db.result = { data: null, error: new Error("offline") };
  const { onSave, close } = setup(undefined, "azienda-demo");
  fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Impossibile salvare");
  expect(onSave).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Nome *")).toHaveValue("Demo");
  expect(screen.getByRole("button", { name: "Aggiungi" })).toBeEnabled();
});
