import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ImportaBusinessPlan } from "@/components/orders/generali/piano/ImportaBusinessPlan";
const m = vi.hoisted(() => ({ leggi: vi.fn() }));
vi.mock("@/lib/orders/documentImportAi", () => ({ leggiBusinessPlanAi: m.leggi }));
beforeEach(() => {
  vi.clearAllMocks(); m.leggi.mockResolvedValue({ raw: { valuta: "EUR", scenari: [
    { nome: "Base", righe: [{ tipo: "costo", descrizione: "Materiali", importo_eur: 100, mese: "2027-02", durata_mesi: 2 }, { tipo: "ricavo", descrizione: "Vendite", importo_eur: 200, mese: "2027-05" }] },
    { nome: "Prudente", righe: [{ tipo: "costo", descrizione: "Imprevisti", importo_eur: null, mese: null }] },
  ] } });
});
afterEach(cleanup);
async function carica(destinazione: "piano" | "simulatore" = "piano") {
  const onImporta = vi.fn(); render(<ImportaBusinessPlan companyId="demo" destinazione={destinazione} onImporta={onImporta} onAnnulla={vi.fn()}/>);
  const file = new File(["PDF demo"], "business-plan.pdf", { type: "application/pdf" }); Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(4) });
  fireEvent.change(screen.getByLabelText("File business plan"), { target: { files: [file] } });
  await screen.findByLabelText("Scenario da importare"); return { onImporta, file };
}
it("il PDF usa la stessa anteprima, conserva mesi, durata e originale prima di importare", async () => {
  const { onImporta, file } = await carica(); expect(m.leggi).toHaveBeenCalledWith(file, "demo");
  expect(onImporta).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Aggiungi 2 voci alla bozza" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/Ho verificato scenario/)); fireEvent.click(screen.getByRole("button", { name: "Aggiungi 2 voci alla bozza" }));
  expect(onImporta.mock.calls[0][0]).toEqual(expect.arrayContaining([expect.objectContaining({ importo: 100, mese: "2027-02", durataMesi: 2 }), expect.objectContaining({ tipo: "ricavo", importo: 200, mese: "2027-05" })]));
  expect(onImporta.mock.calls[0][1]).toMatchObject({ file, foglio: "Base" });
});
it("il simulatore richiede stima e calendario, senza perdere lo scenario selezionato", async () => {
  const { onImporta } = await carica("simulatore"); fireEvent.change(screen.getByLabelText("Scenario da importare"), { target: { value: "1" } });
  fireEvent.click(screen.getByLabelText(/Ho verificato scenario/)); expect(screen.getByRole("button", { name: "Usa 1 voci nell’ipotesi" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Importo previsto riga 1"), { target: { value: "0" } }); fireEvent.change(screen.getByLabelText("Mese previsto riga 1"), { target: { value: "2027-08" } });
  fireEvent.click(screen.getByLabelText(/Ho verificato scenario/)); fireEvent.click(screen.getByRole("button", { name: "Usa 1 voci nell’ipotesi" }));
  expect(onImporta.mock.calls[0][0][0]).toMatchObject({ importo: 0, mese: "2027-08" }); expect(onImporta.mock.calls[0][0][0].nota).not.toContain("[EIC:DA_STIMARE]"); expect(onImporta.mock.calls[0][1].foglio).toBe("Prudente");
});
