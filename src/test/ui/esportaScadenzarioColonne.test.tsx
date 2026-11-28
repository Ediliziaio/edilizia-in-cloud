import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Scadenza } from "@/hooks/useScadenzario";
import { EsportaScadenzario } from "@/components/scadenzario/EsportaScadenzario";

const state = vi.hoisted(() => ({ exportCsv: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" }, user: { id: "u1" } }) }));
vi.mock("@/lib/csvExport", () => ({ exportToCSV: state.exportCsv, neutralizeCsvFormula: (v: string) => v }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const righe = [{
  id: "1", company_id: "c", tipo: "pagamento_fornitore", direction: "uscita", description: "Posa pavimenti", amount: 100,
  due_date: "2026-11-30", status: "da_pagare", paid_amount: 0, payment_method: "riba", suppliers: { name: "ALFA SPA" },
}] as unknown as Scadenza[];

const monta = (colonneTabella?: string[]) => render(
  <EsportaScadenzario carica={async () => righe} descrizioneFiltri={[]} nomeFile="prova" colonneTabella={colonneTabella} />,
);
async function apri() {
  fireEvent.click(screen.getByRole("button", { name: "Esporta" }));
  return within(await screen.findByRole("dialog", { name: "Esporta scadenzario" }));
}
const conteggio = () => screen.getByTestId("esporta-conteggio-colonne").textContent;

beforeEach(() => { state.exportCsv.mockClear(); localStorage.removeItem("colonne-export-scadenzario-v1:u1:demo"); });
afterEach(cleanup);

describe("EsportaScadenzario: scelta delle colonne", () => {
  it("parte dalle colonne della tabella e scarica il CSV con solo quelle", async () => {
    monta(["scadenza", "controparte", "importo"]);
    const d = await apri();
    expect(conteggio()).toBe("3 colonne su 12");
    fireEvent.click(d.getByRole("button", { name: "CSV" }));
    await waitFor(() => expect(state.exportCsv).toHaveBeenCalledOnce());
    expect(state.exportCsv.mock.calls[0][0]).toEqual([{ data: "2026-11-30", controparte: "ALFA SPA", importo: "100", tipo: "Pagamento" }]);
    expect(state.exportCsv.mock.calls[0][1]).toEqual([{ key: "data", label: "Scadenza" }, { key: "controparte", label: "Fornitore / Cliente" }, { key: "importo", label: "Importo" }, { key: "tipo", label: "Tipo" }]);
  });

  it("spunte, frecce, «Tutte» e «Come la tabella»; la scelta si ricorda", async () => {
    const { unmount } = monta(["scadenza", "importo"]);
    const d = await apri();
    fireEvent.click(d.getByRole("checkbox", { name: "Stato" }));
    expect(conteggio()).toBe("3 colonne su 12");
    fireEvent.click(d.getByRole("button", { name: "Sposta Stato a sinistra" }));
    fireEvent.click(d.getByRole("button", { name: "Sposta Stato a sinistra" }));
    fireEvent.click(d.getByRole("button", { name: "CSV" }));
    await waitFor(() => expect(state.exportCsv).toHaveBeenCalledOnce());
    expect(state.exportCsv.mock.calls[0][1].map((c: { key: string }) => c.key)).toEqual(["stato", "data", "importo", "tipo"]);
    unmount(); cleanup();

    // riaprendo, l'ultima scelta c'è ancora anche se la tabella dice altro
    monta(["scadenza"]);
    const d2 = await apri();
    expect(conteggio()).toBe("3 colonne su 12");
    fireEvent.click(d2.getByRole("button", { name: "Come la tabella" }));
    expect(conteggio()).toBe("1 colonna su 12");
    fireEvent.click(d2.getByRole("button", { name: "Tutte" }));
    expect(conteggio()).toBe("12 colonne su 12");
  });

  it("non lascia spegnere l'ultima colonna", async () => {
    monta(["importo"]);
    const d = await apri();
    fireEvent.click(d.getByRole("checkbox", { name: "Importo" }));
    expect(conteggio()).toBe("1 colonna su 12");
    expect(d.getByText("Serve almeno una colonna.")).toBeInTheDocument();
  });
});
