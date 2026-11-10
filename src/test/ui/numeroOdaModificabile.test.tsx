import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  esito: { error: null as null | { code: string; message: string } },
  aggiornato: vi.fn(),
  invalida: vi.fn(),
  successo: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: m.successo, error: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: m.invalida }) }));
vi.mock("@/integrations/supabase/client", () => {
  const catena = {
    update: (v: unknown) => { m.aggiornato(v); return catena; },
    eq: () => catena,
    select: () => catena,
    single: () => Promise.resolve(m.esito),
  };
  return { supabase: { from: () => catena } };
});

import { NumeroOdaModificabile } from "@/components/orders/NumeroOdaModificabile";

afterEach(cleanup);
beforeEach(() => { m.esito = { error: null }; m.aggiornato.mockReset(); m.invalida.mockReset(); m.successo.mockReset(); });

const apri = (puoModificare = true) =>
  render(<NumeroOdaModificabile odaId="oda-1" companyId="vulcano" numero="ODA-2026-0007" puoModificare={puoModificare} />);

it("senza permesso di modifica la matita non c'è", () => {
  apri(false);
  expect(screen.getByText(/ODA-2026-0007/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cambia il numero dell'ordine" })).not.toBeInTheDocument();
});

it("cambia il numero dalla matita", async () => {
  apri();
  fireEvent.click(screen.getByRole("button", { name: "Cambia il numero dell'ordine" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Numero dell'ordine" }), { target: { value: " 26130 " } });
  fireEvent.click(screen.getByRole("button", { name: "Salva il numero" }));
  await waitFor(() => expect(m.successo).toHaveBeenCalledWith("Numero dell'ordine cambiato in 26130"));
  expect(m.aggiornato).toHaveBeenCalledWith({ oda_number: "26130" });
  expect(m.invalida).toHaveBeenCalled();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

it("un numero già usato resta in modifica e lo dice", async () => {
  m.esito = { error: { code: "23505", message: 'duplicate key value violates unique constraint "uq_oda_number_company"' } };
  apri();
  fireEvent.click(screen.getByRole("button", { name: "Cambia il numero dell'ordine" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Numero dell'ordine" }), { target: { value: "26131" } });
  fireEvent.click(screen.getByRole("button", { name: "Salva il numero" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Il numero 26131 è già usato da un altro ordine");
  expect(screen.getByRole("textbox", { name: "Numero dell'ordine" })).toHaveValue("26131");
  expect(m.successo).not.toHaveBeenCalled();
});

it("vuoto non si salva", () => {
  apri();
  fireEvent.click(screen.getByRole("button", { name: "Cambia il numero dell'ordine" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Numero dell'ordine" }), { target: { value: "  " } });
  fireEvent.click(screen.getByRole("button", { name: "Salva il numero" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Scrivi il numero dell'ordine");
  expect(m.aggiornato).not.toHaveBeenCalled();
});
