import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import type { RfqSupplier } from "@/hooks/useSupplierRfqs";
import { RdoCondizioniOfferta } from "@/components/acquisti/RdoCondizioniOfferta";
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
afterEach(cleanup);
const f = {
  id: "f",
  suppliers: { name: "Tegole" },
  trasporto_tipo: "da_confermare",
  disponibilita_note: null,
} as RfqSupplier;
it("salva trasporto extra e disponibilità solo con dati validi", async () => {
  const save = vi.fn().mockResolvedValue(undefined),
    editing = vi.fn();
  render(
    <RdoCondizioniOfferta
      fornitore={f}
      chiusa={false}
      onSave={save}
      onEditingChange={editing}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Modifica trasporto e disponibilità Tegole",
    }),
  );
  fireEvent.change(screen.getByLabelText("Trasporto"), {
    target: { value: "extra" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salva condizioni" }));
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Costo trasporto, IVA esclusa (€)"), {
    target: { value: "25" },
  });
  fireEvent.change(screen.getByLabelText("Disponibilità e vincoli"), {
    target: { value: "Disponibile subito" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salva condizioni" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      trasporto_tipo: "extra",
      costo_trasporto: 25,
      disponibilita_note: "Disponibile subito",
    }),
  );
  await waitFor(() => expect(editing).toHaveBeenLastCalledWith(false));
});
it("un errore conserva i dati aperti e il blocco degli export", async () => {
  const editing = vi.fn();
  render(
    <RdoCondizioniOfferta
      fornitore={f}
      chiusa={false}
      onSave={vi.fn().mockRejectedValue(new Error("Rete"))}
      onEditingChange={editing}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Modifica trasporto/ }));
  fireEvent.change(screen.getByLabelText("Disponibilità e vincoli"), {
    target: { value: "Consegna in due lotti" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salva condizioni" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Salva condizioni" }),
    ).toBeEnabled(),
  );
  expect(screen.getByLabelText("Disponibilità e vincoli")).toHaveValue(
    "Consegna in due lotti",
  );
  expect(editing).not.toHaveBeenCalledWith(false);
});
it("una richiesta chiusa mantiene le condizioni in lettura", () => {
  render(
    <RdoCondizioniOfferta
      fornitore={f}
      chiusa
      onSave={vi.fn()}
      onEditingChange={vi.fn()}
    />,
  );
  expect(
    screen.queryByRole("button", { name: /Modifica/ }),
  ).not.toBeInTheDocument();
});
