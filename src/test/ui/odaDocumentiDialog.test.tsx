import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OdaDocumentiDialog } from "@/components/orders/OdaDocumentiDialog";

// Clic su un ordine d'acquisto della commessa: si vedono solo le sue bolle e le sue fatture.
vi.mock("@/components/orders/OrderDocumentiFornitore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/orders/OrderDocumentiFornitore")>()),
  useBolleCommessa: () => ({ isLoading: false, isError: false, data: [
    { id: "d1", origine: "fornitore", numero: "DDT-46", data: "2025-10-20", controparte: "Fornitore Uno · ODA-46", stato: "Controllata", attenzione: false, link: "/azienda/ddt/d1", purchaseOrderId: "po1" },
    { id: "d2", origine: "fornitore", numero: "DDT-99", data: "2025-10-21", controparte: "Altro", stato: "Controllata", attenzione: false, purchaseOrderId: "po2" },
  ] }),
  useFattureFornitoriCommessa: () => ({ isLoading: false, isError: false, data: [
    { id: "f1", numero: "FOR-46", data: "2025-10-20", fornitore: "Fornitore Uno", totale: 47577.39, stato: "registrata", legame: "oda", oda: "ODA-46", purchaseOrderId: "po1", notaCredito: false, quota: null as number | null, totaleDocumento: null as number | null },
    { id: "f2", numero: "COSTO-1", data: "2025-12-15", fornitore: "Noleggi", totale: 2973.59, stato: "registrata", legame: "costo", oda: null, purchaseOrderId: null, notaCredito: false, quota: null, totaleDocumento: null },
  ] }),
}));

afterEach(cleanup);
const oda = { id: "po1", oda_number: "ODA-46", status: "ricevuto", total: 47577.39, fornitore: "Fornitore Uno" };
const mostra = (mostraImporti = true) => render(<MemoryRouter><OdaDocumentiDialog orderId="o1" oda={oda} onClose={() => {}} mostraImporti={mostraImporti} /></MemoryRouter>);

describe("finestra dell'ordine d'acquisto", () => {
  it("mostra solo bolle e fatture di quell'ordine", () => {
    mostra();
    expect(screen.getByText(/N° DDT-46/)).toBeInTheDocument();
    expect(screen.queryByText(/DDT-99/)).not.toBeInTheDocument();
    expect(screen.getByText(/FOR-46/)).toBeInTheDocument();
    expect(screen.queryByText(/COSTO-1/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Apri l’ordine d’acquisto/ })).toHaveAttribute("href", "/azienda/ordini-acquisto/po1");
  });

  it("senza permesso sui costi non mostra gli importi", () => {
    mostra(false);
    expect(document.body.textContent).not.toMatch(/47\.577,39/);
  });
});
