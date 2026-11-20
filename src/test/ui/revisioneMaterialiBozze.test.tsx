import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RevisioneMateriali } from "@/components/orders/materiali/RevisioneMateriali";
import type { MaterialeFase } from "@/hooks/useMaterialiPerFase";

const db = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: db }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda" }, user: { id: "tecnico" } }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const materiale = (id: string, quantity = 13) => ({ id, order_id: "ordine", name: "Serramento " + id, quantity, unita_misura: "pz", specifiche: "Modello da scegliere",
  origini: [{ tipo: "computo", voce_id: "v1", codice: "S.01", descrizione: "Serramento", quantita: quantity, quantita_voce: quantity, unita_voce: "pz",
    verifica_acquisto: { stato: "da_verificare", motivi: ["Misure e modello da verificare"], campi_mancanti: ["abaco", "modello"] } }] } as MaterialeFase);
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
describe("bozze della revisione senza approvazione implicita", () => {
  it("salta una riga irrisolta, prosegue e riprende i dati parziali senza conservarne la spunta", () => {
    render(<QueryClientProvider client={client()}><RevisioneMateriali materiali={[materiale("a"), materiale("b")]} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Inizia revisione" }));
    fireEvent.change(screen.getByLabelText("Quantità verificata"), { target: { value: "13,5" } });
    fireEvent.change(screen.getByLabelText("Fonte della verifica e calcolo della quantità"), { target: { value: "Rilievo ancora da completare" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Salta per ora" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Articolo 2 di 2");
    expect(screen.getByLabelText("Prodotto")).toHaveValue("Serramento b");
    fireEvent.click(screen.getByRole("button", { name: "Salta per ora" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 verificati · 2 rimandati: restano da verificare.");
    fireEvent.click(screen.getByRole("button", { name: "Riprendi revisione" }));
    expect(screen.getByLabelText("Prodotto")).toHaveValue("Serramento a");
    expect(screen.getByLabelText("Quantità verificata")).toHaveValue("13,5");
    expect(screen.getByLabelText("Fonte della verifica e calcolo della quantità")).toHaveValue("Rilievo ancora da completare");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Salva e continua" })).toBeDisabled();
    expect(db.from).not.toHaveBeenCalled();
  });
  it("chiudere conserva la bozza finché la fonte non cambia", () => {
    const qc = client();
    const m = materiale("a");
    const vista = render(<QueryClientProvider client={qc}><RevisioneMateriali materiali={[m]} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Inizia revisione" }));
    fireEvent.change(screen.getByLabelText("Quantità verificata"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Pausa", exact: true }));
    expect(screen.getByText(/1 bozza da riprendere/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riprendi revisione" }));
    expect(screen.getByLabelText("Quantità verificata")).toHaveValue("15");
    fireEvent.click(screen.getByRole("button", { name: "Pausa", exact: true }));
    vista.rerender(<QueryClientProvider client={qc}><RevisioneMateriali materiali={[materiale("a", 20)]} /></QueryClientProvider>);
    expect(screen.queryByText(/bozza da riprendere/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riprendi revisione" }));
    expect(screen.getByLabelText("Quantità verificata")).toHaveValue("20");
    expect(db.from).not.toHaveBeenCalled();
  });
  it("riprende la riga in pausa anche senza modifiche, lasciando irrisolta quella saltata", () => {
    render(<QueryClientProvider client={client()}><RevisioneMateriali materiali={[materiale("a"), materiale("b")]} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Inizia revisione" }));
    fireEvent.click(screen.getByRole("button", { name: "Salta per ora" }));
    fireEvent.click(screen.getByRole("button", { name: "Pausa", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Riprendi revisione" }));
    expect(screen.getByLabelText("Prodotto")).toHaveValue("Serramento b");
    expect(screen.getByRole("dialog")).toHaveTextContent("Articolo 2 di 2");
    expect(db.from).not.toHaveBeenCalled();
  });
  it("il tasto Escape mantiene il lavoro e non conferma l'articolo", () => {
    render(<QueryClientProvider client={client()}><RevisioneMateriali materiali={[materiale("a")]} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Inizia revisione" }));
    fireEvent.change(screen.getByLabelText("Specifiche confermate"), { target: { value: "Profilo A, dimensioni da rilievo" } });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riprendi revisione" }));
    expect(within(screen.getByRole("dialog")).getByLabelText("Specifiche confermate")).toHaveValue("Profilo A, dimensioni da rilievo");
    expect(db.from).not.toHaveBeenCalled();
  });
});
