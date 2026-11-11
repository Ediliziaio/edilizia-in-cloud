/**
 * «Variante sulle voci» (lotto 8, 10/11/2026): solo le righe cambiate vanno al database, la differenza è riga
 * per riga al centesimo, senza motivo non si registra, e una quota in bozza entra scrivendo la quantità.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VarianteVociDialog, righeVariante } from "@/components/orders/VarianteVociDialog";
import type { AffidamentoChiFaCosa } from "@/lib/subappaltatori/affidamentiCommessa";

const finto = vi.hoisted(() => {
  const stato = { quadri: [{ id: "ql1" }] as Array<{ id: string }> };
  const from = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {};
    for (const m of ["select", "eq", "limit"]) c[m] = () => c;
    c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve({ data: stato.quadri, error: null as null }).then(ok, ko);
    return c;
  };
  return { stato, from, rpc: vi.fn(async (_n: string, _a?: unknown) => ({ data: { importo: 1085, differenza: 14, revisione: 2 }, error: null as null })) };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: finto.rpc, from: finto.from } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => { cleanup(); finto.rpc.mockClear(); finto.stato.quadri = [{ id: "ql1" }]; });

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
    await waitFor(() => expect(registra).toBeEnabled());
    fireEvent.click(registra);
    await waitFor(() => expect(finto.rpc).toHaveBeenCalledWith("subappalto_variante_voci", {
      p_company: "az", p_contratto: "c1", p_righe: [{ affidamento_id: "a2", quantita: 2, prezzo: 7 }], p_motivo: "Muri in più al piano terra",
    }));
    await waitFor(() => expect(fatto).toHaveBeenCalled());
  });

  it("contratto appena firmato, senza quadro lavori: si sceglie quando matura, si crea il quadro dal contratto, poi la variante", async () => {
    finto.stato.quadri = [];
    const elenco = [
      { fase: "Demolizioni", descrizione: "Demolizione tramezzi", unita: "mq", quantita: 120, prezzo: 9, importo: 1080, voce_id: "v1", affidamento_id: "a1" },
    ];
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <VarianteVociDialog companyId="az" contrattoId="c1" nomeDitta="Rossi srl" importo={1080} quote={quote} voci={voci} elencoContratto={elenco} onChiudi={vi.fn()} onFatto={vi.fn()} />
    </QueryClientProvider>);
    const quando = await screen.findByLabelText("Quando matura il compenso");
    fireEvent.change(screen.getByLabelText("Quantità di Demolizione tramezzi"), { target: { value: "119" } });
    fireEvent.change(screen.getByLabelText("Motivo della variante"), { target: { value: "Un tramezzo resta" } });
    const registra = screen.getByRole("button", { name: "Registra la variante" });
    expect(registra).toBeDisabled();
    fireEvent.change(quando, { target: { value: "sal_periodici" } });
    fireEvent.click(registra);
    await waitFor(() => expect(finto.rpc).toHaveBeenCalledWith("subappalto_variante_voci", expect.anything()));
    const [prima, dopo] = finto.rpc.mock.calls.map((c) => c[0]);
    expect([prima, dopo]).toEqual(["subappalto_quadro_registra", "subappalto_variante_voci"]);
    const argomenti = finto.rpc.mock.calls[0][1] as { p_maturazione: string; p_voci: Array<Record<string, unknown>>; p_importo_atteso: number };
    expect(argomenti.p_maturazione).toBe("sal_periodici");
    expect(argomenti.p_importo_atteso).toBe(1080);
    expect(argomenti.p_voci[0]).toMatchObject({ base: "misura", quantita: 120, prezzo: 9, voce_commessa_id: "v1", affidamento_id: "a1" });
  });
});
