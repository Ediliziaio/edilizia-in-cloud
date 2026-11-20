import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VerificaDatiMateriale } from "@/components/orders/materiali/VerificaDatiMateriale";
import type { MaterialeFase } from "@/hooks/useMaterialiPerFase";

const stato = vi.hoisted(() => ({ update: vi.fn(), conferma: vi.fn(), toast: vi.fn(), errore: vi.fn(), timestamp: "t1", conflitto: false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda" }, user: { id: "tecnico" } }) }));
vi.mock("sonner", () => ({ toast: { success: stato.toast, error: stato.errore } }));
const origini = [{ tipo: "computo", voce_id: "v1", descrizione: "Pittura applicata", quantita_voce: 100, unita_voce: "mq", quantita: 100,
  fonte: "fornitura", verifica_acquisto: { stato: "da_verificare", motivi: ["Resa e prodotto mancanti"], campi_mancanti: ["resa"] } }];
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (tabella: string) => {
  let modifica = false;
  const q = { select: () => q, eq: (k: string, v: unknown) => { if (modifica && k === "updated_at") stato.conferma(v); return q; },
    is: () => q, neq: () => q, limit: () => q, maybeSingle: () => q, single: () => q,
    update: (p: unknown) => { modifica = true; stato.update(p); return q; },
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(resolve({ error: null, data: modifica ? stato.conflitto ? [] : [{ id: "materiale" }] : tabella === "orders" ? { id: "ordine" }
      : tabella === "order_items" ? { id: "materiale", updated_at: stato.timestamp, origini, status: "da_ordinare", phase_id: "fase" }
        : tabella === "purchase_order_items" ? [] : { stato: "bozza" } })) };
  return q;
} } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); stato.conflitto = false; });
const materiale = { id: "materiale", order_id: "ordine", name: "Pittura", quantity: 100, unita_misura: "mq", specifiche: null, origini } as unknown as MaterialeFase;
const mostra = (m = materiale) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><VerificaDatiMateriale m={m} /></QueryClientProvider>);

describe("conferma tecnica della singola riga", () => {
  it("non approva una quantità stimata con la sola apertura o la sola spunta", () => {
    mostra(); fireEvent.click(screen.getByRole("button", { name: "Completa dati tecnici" }));
    expect(screen.getByRole("button", { name: "Conferma dati di questa riga" })).toBeDisabled();
    expect(screen.getByLabelText("Dati richiesti per salvare")).toHaveTextContent("Fonte usata per la verifica");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Conferma dati di questa riga" })).toBeDisabled();
    expect(stato.update).not.toHaveBeenCalled();
  });
  it("salva quantità, unità e motivazione confermate preservando le misure originali, con controllo di concorrenza", async () => {
    mostra(); fireEvent.click(screen.getByRole("button", { name: "Completa dati tecnici" }));
    fireEvent.change(screen.getByLabelText("Quantità verificata"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Unità d'acquisto"), { target: { value: "l" } });
    fireEvent.change(screen.getByLabelText("Specifiche confermate"), { target: { value: "Pittura A, confezioni da 10 l" } });
    fireEvent.change(screen.getByLabelText("Fonte della verifica e calcolo della quantità"), { target: { value: "Scheda A: 10 m²/l per mano, 100 m², due mani = 20 l" } });
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Conferma dati di questa riga" }));
    await waitFor(() => expect(stato.toast).toHaveBeenCalled());
    expect(stato.update).toHaveBeenCalledWith(expect.objectContaining({ quantity: 20, quantita_calcolata: 20, unita_misura: "l",
      origini: [expect.objectContaining({ quantita_voce: 100, unita_voce: "mq", verifica_acquisto: expect.objectContaining({ stato: "confermata", confermata_da: "tecnico" }) })] }));
    expect(stato.conferma).toHaveBeenCalledWith("t1");
  });
  it("i pezzi frazionari richiedono una correzione esplicita e non vengono arrotondati", () => {
    mostra(); fireEvent.click(screen.getByRole("button", { name: "Completa dati tecnici" }));
    fireEvent.change(screen.getByLabelText("Quantità verificata"), { target: { value: "13,5" } });
    fireEvent.change(screen.getByLabelText("Unità d'acquisto"), { target: { value: "pz" } });
    fireEvent.change(screen.getByLabelText("Specifiche confermate"), { target: { value: "Modello A" } });
    fireEvent.change(screen.getByLabelText("Fonte della verifica e calcolo della quantità"), { target: { value: "Rilievo dei vani" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByLabelText("Dati richiesti per salvare")).toHaveTextContent("Numero intero di pezzi");
    expect(screen.getByRole("button", { name: "Conferma dati di questa riga" })).toBeDisabled();
    expect(screen.getByLabelText("Quantità verificata")).toHaveValue("13,5");
    expect(stato.update).not.toHaveBeenCalled();
  });
  it("un conflitto resta visibile nel modulo senza perdere il lavoro inserito", async () => {
    stato.conflitto = true;
    mostra(); fireEvent.click(screen.getByRole("button", { name: "Completa dati tecnici" }));
    fireEvent.change(screen.getByLabelText("Specifiche confermate"), { target: { value: "Pittura A" } });
    fireEvent.change(screen.getByLabelText("Fonte della verifica e calcolo della quantità"), { target: { value: "Scheda del fornitore" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Conferma dati di questa riga" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La riga è cambiata durante la verifica");
    expect(screen.getByLabelText("Specifiche confermate")).toHaveValue("Pittura A");
    expect(stato.toast).not.toHaveBeenCalled();
  });
  it("una riga senza dati tecnici pendenti non richiede una nuova approvazione", () => {
    mostra({ ...materiale, origini: [] }); expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
