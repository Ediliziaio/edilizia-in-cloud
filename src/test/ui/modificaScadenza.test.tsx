import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ModificaScadenzaDialog } from "@/components/scadenzario/ModificaScadenzaDialog";
import { percheScadenzaNonModificabile } from "@/lib/finance/modificaScadenza";
import type { Scadenza } from "@/hooks/useScadenzario";

const scadenza = { id: "s1", description: "Saldo materiale", amount: 120, due_date: "2026-11-30", payment_method: "bonifico", notes: "", status: "da_pagare", paid_amount: 0, is_auto_generated: false, invoice_id: null, cost_id: null, order_item_id: null, prima_nota_entry_id: null } as Scadenza;
afterEach(cleanup);

describe("modifica delle scadenze manuali", () => {
  it("precompila e salva una virgola decimale, senza alterare i collegamenti", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<ModificaScadenzaDialog scadenza={scadenza} onClose={vi.fn()} onConfirm={onConfirm} isPending={false} />);
    expect(screen.getByLabelText("Descrizione")).toHaveValue("Saldo materiale");
    fireEvent.change(screen.getByLabelText("Importo (€)"), { target: { value: "130,50" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ amount: 130.5, due_date: "2026-11-30" })));
    expect(onConfirm.mock.calls[0][0]).not.toHaveProperty("invoice_id");
  });
  it("mostra l'errore e conserva i dati se il server rifiuta la modifica", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("La scadenza è cambiata. Ricarica l'elenco."));
    render(<ModificaScadenzaDialog scadenza={scadenza} onClose={vi.fn()} onConfirm={onConfirm} isPending={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ricarica");
    expect(screen.getByLabelText("Descrizione")).toHaveValue("Saldo materiale");
  });
  it("blocca i valori non validi e impedisce un secondo invio prima dell'esito", () => {
    const onConfirm = vi.fn(() => new Promise(() => {}));
    render(<ModificaScadenzaDialog scadenza={scadenza} onClose={vi.fn()} onConfirm={onConfirm} isPending={false} />);
    fireEvent.change(screen.getByLabelText("Importo (€)"), { target: { value: "-2" } });
    expect(screen.getByRole("button", { name: "Salva modifiche" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Importo (€)"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
  it("esclude fatture, costi, rate di commessa e scadenze con pagamenti", () => {
    expect(percheScadenzaNonModificabile(scadenza)).toBeNull();
    for (const patch of [{ invoice_id: "f" }, { cost_id: "c" }, { order_item_id: "r" }, { is_auto_generated: true }]) expect(percheScadenzaNonModificabile({ ...scadenza, ...patch })).toMatch(/documento/);
    expect(percheScadenzaNonModificabile({ ...scadenza, paid_amount: 10 })).toMatch(/pagamenti/);
    expect(percheScadenzaNonModificabile({ ...scadenza, status: "annullata" })).toMatch(/annullata/);
  });
});
