import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({ voci: [] as unknown[], equivalenze: [] as Array<{ chiave: string; voce_id: string }>, rpc: vi.fn() }));
vi.mock("@/hooks/useListinoFornitore", () => ({ useVociListinoFornitore: () => ({ voci: stato.voci, isLoading: false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: async (nome: string, args: Record<string, unknown>) => {
  stato.rpc(nome, args);
  if (nome === "listino_equivalenza_salva") stato.equivalenze.push({ chiave: "C:203", voce_id: String(args.p_voce) });
  return { data: nome === "listino_equivalenze_fornitore" ? [...stato.equivalenze] : null, error: null as unknown };
} } }));
import { PrezziListinoFattura } from "@/components/fatturazione/PrezziListinoFattura";

beforeEach(() => { stato.voci = []; stato.equivalenze = []; stato.rpc.mockReset(); });
afterEach(cleanup);
const voce = (id: string, descrizione: string, prezzo: number, unita = "mc") => ({ id, codice: null as string | null, descrizione, unita, prezzo, sconto_pct: 0, listinoScadutoIl: null as string | null });
const riga = (n: number, descrizione: string, prezzo: number, extra: Record<string, unknown> = {}) => ({ numero_linea: n, descrizione, quantita: 4, unita_misura: "MC", prezzo_unitario: prezzo, imponibile: prezzo * 4, ...extra });
const mostra = (el: ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{el}</QueryClientProvider>);

describe("fattura contro listino nel riepilogo (23/11/2026)", () => {
  it("le voci più care si raggruppano per articolo e prezzo, con le righe", async () => {
    stato.voci = [voce("a", "CLS Rck C 28/35 S4 XC1 XC2", 117), voce("b", "CLS Rck C 30/37 S4 XC1 XC2", 119)];
    mostra(<PrezziListinoFattura fornitoreId="s" xmlRaw={null} indiceCorpo={null}
      righe={[riga(1, "CLS RCK 37 S4 XC1 XC2", 121), riga(2, "126 CLS RCK35 S4 XC1XC2", 117), riga(4, "CLS RCK 37 S4 XC1 XC2", 121)]} />);
    expect(await screen.findByText("2 voci pagate più del listino del fornitore")).toBeInTheDocument();
    expect(screen.getByText(/CLS Rck C 30\/37 S4 XC1 XC2: 121,00.*in fattura, 119,00.*a listino \(\+1,7%\)/)).toBeInTheDocument();
    expect(screen.getByText(/righe 1, 4/)).toBeInTheDocument();
  });
  it("tutto in linea: una riga verde; niente listino: niente", async () => {
    stato.voci = [voce("a", "CLS Rck C 28/35 S4 XC1 XC2", 117)];
    const { unmount } = mostra(<PrezziListinoFattura fornitoreId="s" xmlRaw={null} indiceCorpo={null} righe={[riga(1, "126 CLS RCK35 S4 XC1XC2", 117)]} />);
    expect(await screen.findByText(/Prezzi in linea con il listino del fornitore \(1 voce confrontata\)/)).toBeInTheDocument();
    unmount();
    stato.voci = [];
    const { container } = mostra(<PrezziListinoFattura fornitoreId="s" xmlRaw={null} indiceCorpo={null} righe={[riga(1, "126 CLS RCK35 S4 XC1XC2", 117)]} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("una voce che il listino scrive diverso si abbina una volta, e da lì si confronta", async () => {
    stato.voci = [voce("a", "CLS Rck C 28/35 S4 XC1 XC2", 117), voce("e", "Fornitura di cubetti in PVC", 5, "cad")];
    mostra(<PrezziListinoFattura fornitoreId="s" xmlRaw={null} indiceCorpo={null} puoModificare
      righe={[riga(1, "126 CLS RCK35 S4 XC1XC2", 117), riga(2, "CUBIERE PVC", 6, { unita_misura: "NR", codice_articolo: "203" })]} />);
    fireEvent.click(await screen.findByText(/1 voce non trovata nel listino/));
    fireEvent.change(screen.getByLabelText("Voce del listino per CUBIERE PVC"), { target: { value: "e" } });
    fireEvent.click(screen.getByRole("button", { name: "Abbina" }));
    await waitFor(() => expect(stato.rpc).toHaveBeenCalledWith("listino_equivalenza_salva", { p_supplier: "s", p_voce: "e", p_codice: "203", p_descrizione: "CUBIERE PVC" }));
    expect(await screen.findByText("1 voce pagata più del listino del fornitore")).toBeInTheDocument();
    expect(screen.getByText(/Fornitura di cubetti in PVC: 6,00.*in fattura, 5,00.*a listino/)).toBeInTheDocument();
  });
});
