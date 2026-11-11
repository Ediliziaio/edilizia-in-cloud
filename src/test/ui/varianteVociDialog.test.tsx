/**
 * «Variante sulle voci» (lotto 8, 10/11/2026): solo le righe cambiate vanno al database, la differenza è riga
 * per riga al centesimo, senza motivo non si registra, e una quota in bozza entra scrivendo la quantità.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VarianteVociDialog, righeVariante } from "@/components/orders/VarianteVociDialog";
import type { AffidamentoChiFaCosa } from "@/lib/subappaltatori/affidamentiCommessa";

const finto = vi.hoisted(() => ({ rpc: vi.fn(async () => ({ data: { importo: 1085, differenza: 14, revisione: 2 }, error: null as null })) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: finto.rpc } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => { cleanup(); finto.rpc.mockClear(); });

const quote: AffidamentoChiFaCosa[] = [
  { id: "a1", voce_id: "v1", subappaltatore_id: "rossi", quantita: 120, prezzo_unitario: 9, origine_prezzo: "listino_ditta", comprende: "posa", stato: "a_contratto", contratto_id: "c1" },
  { id: "a2", voce_id: "v2", subappaltatore_id: "rossi", quantita: 2, prezzo_unitario: 7, origine_prezzo: "manuale", comprende: "posa", stato: "bozza", contratto_id: null },
];
const voci = [
  { id: "v1", descrizione: "Demolizione tramezzi", unita: "mq", quantita: 120 },
  { id: "v2", descrizione: "Muri perimetrali", unita: "mq", quantita: 50 },
];

describe("variante sulle voci", () => {
  it("il conto: solo le righe cambiate, differenza riga per riga", () => {
    expect(righeVariante(quote, { a1: { quantita: "120", prezzo: "9" } }).righe).toEqual([]);
    const r = righeVariante(quote, { a1: { quantita: "119", prezzo: "9" }, a2: { quantita: "2", prezzo: "7" } });
    expect(r.righe).toEqual([{ affidamento_id: "a1", quantita: 119, prezzo: 9 }, { affidamento_id: "a2", quantita: 2, prezzo: 7 }]);
    expect(r.differenza).toBe(5);
    expect(righeVariante(quote, { a1: { quantita: "abc", prezzo: "9" } }).errori).toEqual(["a1"]);
  });

  it("si registra solo col motivo, e manda le righe cambiate", async () => {
    const fatto = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}>
      <VarianteVociDialog companyId="az" contrattoId="c1" nomeDitta="Rossi srl" importo={1080} quote={quote} voci={voci} onChiudi={vi.fn()} onFatto={fatto} />
    </QueryClientProvider>);
    expect(screen.getByText(/affidata, non ancora nel contratto/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Quantità di Muri perimetrali"), { target: { value: "2" } });
    expect(screen.getByRole("status").textContent).toMatch(/1\.094,00.*\+14,00.*1 voce/);
    const registra = screen.getByRole("button", { name: "Registra la variante" });
    expect(registra).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo della variante"), { target: { value: "Muri in più al piano terra" } });
    fireEvent.click(registra);
    await waitFor(() => expect(finto.rpc).toHaveBeenCalledWith("subappalto_variante_voci", {
      p_company: "az", p_contratto: "c1", p_righe: [{ affidamento_id: "a2", quantita: 2, prezzo: 7 }], p_motivo: "Muri in più al piano terra",
    }));
    await waitFor(() => expect(fatto).toHaveBeenCalled());
  });
});
