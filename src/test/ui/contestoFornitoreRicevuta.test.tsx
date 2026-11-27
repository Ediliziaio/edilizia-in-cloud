import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, expect, it, vi } from "vitest";
import { ContestoFornitoreRicevuta } from "@/components/fatturazione/ContestoFornitoreRicevuta";
import type { FatturaConScadenze } from "@/hooks/useFattureFornitoreContestuali";

const finto = vi.hoisted(() => ({ dati: [] as FatturaConScadenze[], errore: false, refetch: vi.fn() }));
vi.mock("@/hooks/useFattureFornitoreContestuali", () => ({
  filtriFornitore: () => ["fornitore_id.eq.test"],
  useFattureFornitoreContestuali: () => ({ data: finto.dati, isLoading: false, isError: finto.errore, refetch: finto.refetch }),
}));

const documento = (id: string): FatturaConScadenze => ({
  id, numero_fattura: id, data_fattura: "2026-11-20", tipo_documento: "TD01", stato: "letta", pagata_il: null,
  company_cost_id: "costo", totale_documento: 333.06, piano_pagamento: [], scadenze: [],
});
const apri = vi.fn(), chiudi = vi.fn();
const monta = () => render(<ContestoFornitoreRicevuta companyId="azienda" fatturaId="F1" supplierId="fornitore" onApriFattura={apri} onChiudi={chiudi} />);
beforeEach(() => {
  finto.errore = false; finto.refetch.mockReset(); apri.mockReset(); chiudi.mockReset();
  finto.dati = [
    { ...documento("F1"), scadenze: [{ id: "r1", numero: 1, scadenza: "2026-11-30", importo: 100, residuo: null, metodo: "riba", stato: "da pagare", prevista: false }] },
    { ...documento("F2"), scadenze: [{ id: "r2", numero: 1, scadenza: "2026-12-31", importo: 233.06, residuo: 0, metodo: "bonifico", stato: "pagata", prevista: false }] },
  ];
});

it("mostra fatture e rate senza inventare il residuo e apre la fattura scelta", () => {
  monta();
  const contesto = within(screen.getByLabelText("Fatture e scadenze del fornitore"));
  expect(contesto.getByText("Fattura F1")).toBeVisible();
  expect(contesto.getByText("Residuo da verificare")).toBeVisible();
  expect(contesto.getByText("Ri.Ba. · da pagare")).toBeVisible();
  expect(contesto.getByText("Fattura F2")).toBeVisible();
  fireEvent.click(contesto.getByRole("button", { name: "Apri fattura F2" }));
  expect(apri).toHaveBeenCalledWith("F2");
  fireEvent.click(contesto.getByRole("button", { name: "Chiudi" }));
  expect(chiudi).toHaveBeenCalledOnce();
});

it("filtra le fatture pagate senza nasconderle definitivamente", () => {
  monta();
  fireEvent.click(screen.getByRole("button", { name: "Da pagare" }));
  expect(screen.getByText("Fattura F1")).toBeVisible();
  expect(screen.queryByText("Fattura F2")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Tutte" }));
  expect(screen.getByText("Fattura F2")).toBeVisible();
});

it("consente di riprovare se la lettura delle scadenze fallisce", () => {
  finto.errore = true;
  monta();
  expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a caricare");
  fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
  expect(finto.refetch).toHaveBeenCalledOnce();
});

it("gestisce molti documenti con caricamento progressivo e ricerca sull'intero elenco", () => {
  finto.dati = Array.from({ length: 45 }, (_, i) => documento(`F${i}`));
  monta();
  expect(screen.getByText("Fattura F19")).toBeVisible();
  expect(screen.queryByText("Fattura F20")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Mostra altre fatture/ }));
  expect(screen.getByText("Fattura F39")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Cerca una fattura del fornitore"), { target: { value: "F44" } });
  expect(screen.getByText("Fattura F44")).toBeVisible();
  expect(screen.queryByText("Fattura F0")).toBeNull();
});
