/**
 * Analisi Acquisti (21/10/2026): schede con filtri nell'URL, errori con
 * «Riprova» al posto del falso «Nessuna spesa registrata», «Senza commessa»
 * in evidenza.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const stato = vi.hoisted(() => ({ errore: false, refetch: vi.fn() }));

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditOrders: true, canEditSettingsSuppliers: true }) }));
vi.mock("@/hooks/useProcurementAnalysis", async () => {
  const { calcolaAnalisiAcquisti: calcola } = await import("@/lib/procurement/spendAnalysis");
  const periodo = { dal: "2026-01-01", al: "2026-10-21" };
  const analisi = calcola(
    {
      ordini: [
        { id: "o1", supplier_id: "s1", order_id: "c1", issue_date: "2026-03-01", status: "inviato", subtotal: 1000 },
        { id: "o2", supplier_id: "s1", order_id: null, issue_date: "2026-04-01", status: "inviato", subtotal: 250 },
      ],
      fatture: [],
      scadenze: [{ id: "x", supplier_id: "s1", due_date: "2026-10-01", amount: 300, paid_amount: 0, status: "da_pagare", is_previsionale: false, tipo: "pagamento_fornitore" }],
      fornitori: [{ id: "s1", name: "Edilmateriali Srl", vat_number: null, product_category: null }],
      commesse: [{ id: "c1", order_code: "C-001", client_name: "Rossi" }],
    },
    periodo,
    {},
    new Date(2026, 9, 21),
  );
  const q = <T,>(data: T) => ({ data: stato.errore ? undefined : data, isLoading: false, isError: stato.errore, refetch: stato.refetch });
  return {
    useProcurementAnalysis: () => ({
      analisiQuery: q({ analisi, origine: "browser" }),
      anagraficheQuery: q({ fornitori: [], commesse: [] }),
      prezziQuery: q({ benchmarks: [], totalSaving: 0, analyzedLines: 0 }),
      firmaQuery: q(null),
    }),
  };
});

import AnalisiAcquisti from "@/pages/azienda/AnalisiAcquisti";

const apri = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <AnalisiAcquisti />
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  stato.errore = false;
});

describe("Analisi Acquisti", () => {
  it("la panoramica mostra i quattro riquadri e l'avviso degli acquisti senza commessa", () => {
    apri("/azienda/analisi-acquisti");
    expect(screen.getAllByText("Ordinato").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Fatturato").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Scaduto").length).toBeGreaterThan(0);
    expect(screen.getByText("In scadenza 30 gg")).toBeTruthy();
    expect(screen.getByText(/di acquisti senza commessa/)).toBeTruthy();
    expect(screen.queryByText(/Top:/)).toBeNull();
    expect(screen.queryByText("Sola lettura")).toBeNull();
  });

  it("la scheda Commesse mette «Senza commessa» in cima", () => {
    apri("/azienda/analisi-acquisti?scheda=commesse");
    const righe = screen.getAllByRole("row");
    expect(righe[1].textContent).toContain("Senza commessa");
    expect(righe[2].textContent).toContain("C-001");
  });

  it("se la lettura fallisce dice di riprovare, non che non c'è spesa", () => {
    stato.errore = true;
    apri("/azienda/analisi-acquisti?scheda=fornitori");
    expect(screen.queryByText(/Nessun/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Riprova/ }));
    expect(stato.refetch).toHaveBeenCalled();
  });
});
