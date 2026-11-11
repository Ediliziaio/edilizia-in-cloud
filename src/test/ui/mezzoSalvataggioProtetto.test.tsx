import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const api = vi.hoisted(() => ({ save: vi.fn(), saved: vi.fn() }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "company-test" }));
vi.mock("@/hooks/useOrganigramma", () => ({ useAllHrProfili: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/useMezzi", () => ({ useSalvaMezzo: () => ({ mutateAsync: api.save, isPending: false }), useMezzi: () => ({ data: [] as unknown[] }), useMezziCategorie: () => ({ data: [] as unknown[] }), allegaLibretto: vi.fn(), caricaFileMezzo: vi.fn(), leggiDocumentoConAI: vi.fn(), rimuoviFileMezzo: vi.fn() }));
vi.mock("@/components/warehouse/OrderSelectCombobox", () => ({ OrderSelectCombobox: ({ ariaLabel }: { ariaLabel: string }) => <button type="button" aria-label={ariaLabel}>Nessun cantiere</button> }));
import { MezzoFormDialog } from "@/components/mezzi/MezzoFormDialog";
function Form() { const [open, setOpen] = useState(true); return <MezzoFormDialog open={open} onOpenChange={setOpen} onSalvato={api.saved} />; }
beforeEach(() => { api.save.mockReset(); api.saved.mockReset(); });
afterEach(cleanup);
function setup() { render(<Form />); fireEvent.change(screen.getByRole("textbox", { name: "Nome" }), { target: { value: "Mezzo locale test" } }); }
it("blocca doppio invio, modifica e chiusura finché la registrazione è in corso", async () => {
  let resolve!: (id: string) => void;
  api.save.mockImplementation(() => new Promise<string>((done) => { resolve = done; }));
  setup();
  const save = screen.getByRole("button", { name: "Crea mezzo" });
  fireEvent.click(save); fireEvent.click(save);
  expect(api.save).toHaveBeenCalledOnce();
  expect(screen.getByRole("textbox", { name: "Nome" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await act(async () => { resolve("mezzo-creato"); });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(api.saved).toHaveBeenCalledExactlyOnceWith("mezzo-creato");
});
it("un errore mantiene i dati e consente un nuovo tentativo", async () => {
  api.save.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce("mezzo-creato");
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Crea mezzo" }));
  await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
  expect(screen.getByRole("textbox", { name: "Nome" })).toHaveValue("Mezzo locale test");
  expect(api.saved).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("button", { name: "Crea mezzo" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Crea mezzo" }));
  await waitFor(() => expect(api.saved).toHaveBeenCalledExactlyOnceWith("mezzo-creato"));
});
