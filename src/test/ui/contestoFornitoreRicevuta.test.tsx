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
  company_cost_id: "costo", totale_documento: 333.06, piano_pagamento: [], scadenze: [], residuoFattura: null,
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
  expect(contesto.getByText("Residuo rata da verificare")).toBeVisible();
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

it("il filtro da pagare non include rate richiamate o da bloccare", () => {
  finto.dati = [
    { ...documento("F1"), scadenze: [{ id: "r1", numero: 1, scadenza: null, importo: 100, residuo: 100, metodo: null, stato: "richiamata", prevista: false }] },
    { ...documento("F2"), scadenze: [{ id: "r2", numero: 1, scadenza: null, importo: 100, residuo: 100, metodo: null, stato: "da bloccare", prevista: false }] },
  ];
  monta();
  fireEvent.click(screen.getByRole("button", { name: "Da pagare" }));
  expect(screen.queryByText("Fattura F1")).toBeNull();
  expect(screen.queryByText("Fattura F2")).toBeNull();
  expect(screen.getByText("Nessuna fattura da pagare trovata.")).toBeVisible();
});

it("mostra una rata ancora aperta anche se la vecchia spunta della fattura dice pagata", () => {
  finto.dati = [{ ...documento("F1"), pagata_il: "2026-11-01", scadenze: [
    { id: "r1", numero: 1, scadenza: null, importo: 100, residuo: 70, metodo: null, stato: "pagamento parziale", prevista: false },
  ] }];
  monta();
  fireEvent.click(screen.getByRole("button", { name: "Da pagare" }));
  expect(screen.getByText("Fattura F1")).toBeVisible();
  expect(screen.getByText(/Residuo rata 70,00/)).toBeVisible();
});

it("mostra il residuo complessivo senza attribuirlo a una singola rata", () => {
  finto.dati[0].residuoFattura = 250;
  monta();
  const contesto = within(screen.getByLabelText("Fatture e scadenze del fornitore"));
  expect(contesto.getByText("Residuo fattura")).toHaveTextContent("250,00");
  expect(contesto.getByText("Residuo rata da verificare")).toBeVisible();
});

it("usa il saldo disponibile per filtrare le fatture senza rate", () => {
  finto.dati = [
    { ...documento("F1"), residuoFattura: 0 },
    { ...documento("F2"), residuoFattura: 50, pagata_il: "2026-11-01" },
  ];
  monta();
  fireEvent.click(screen.getByRole("button", { name: "Da pagare" }));
  expect(screen.queryByText("Fattura F1")).toBeNull();
  expect(screen.getByText("Fattura F2")).toBeVisible();
  expect(screen.getByText("Scadenze non indicate")).toBeVisible();
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
