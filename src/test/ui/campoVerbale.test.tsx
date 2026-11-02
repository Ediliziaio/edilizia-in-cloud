import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CampoVerbale from "@/pages/campo/CampoVerbale";
import { BottoneCollaudo } from "@/components/campo/BottoneCollaudo";

const stato = vi.hoisted(() => ({
  modelli: [] as unknown[], erroreModelli: null as unknown, invocazioni: [] as Array<Record<string, unknown>>, righe: [] as unknown[], naviga: vi.fn(), fallisceSalva: false,
}));
vi.mock("react-router-dom", () => ({ useParams: () => ({ orderId: "o1" }), useNavigate: () => stato.naviga }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, profile: { first_name: "Marco", last_name: "Capo" } }) }));
vi.mock("@/components/campo/FirmaPad", () => ({ FirmaPad: ({ label, onChange }: { label: string; onChange: (v: string | null) => void }) => <button onClick={() => onChange("data:image/png;base64,AAA")}>Traccia {label}</button> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async () => ({ data: stato.erroreModelli ? null : stato.modelli, error: stato.erroreModelli }),
  functions: { invoke: async (_n: string, o: { body: Record<string, unknown> }) => {
    stato.invocazioni.push(o.body);
    if (o.body.action === "list") return { data: { reports: stato.righe }, error: null as null };
    if (stato.fallisceSalva && o.body.action === "save") return { data: { error: "Verbale modificato" }, error: null as null };
    return { data: { report: { id: "r1", status: o.body.action === "sign" ? "finalized" : "draft", version: 2, pdf_path: "a.pdf", document_hash: "h", content: o.body.content ?? {}, firma_cliente_nome: "Mario Rossi" }, url: "https://x/a.pdf" }, error: null as null };
  } },
} }));

const modello = (id: string, nome: string) => ({ id, nome, schema: { formato: 1, blocchi: {}, voci: ["Vetri integri"], titolo: `Collaudo ${nome}`, dal_cantiere: true,
  campi: [{ chiave: "pz", etichetta: "Pezzi controllati", tipo: "number", obbligatorio: true, chi: "tutti", ditte: "tutti", quando: "sempre", livello: "rapportino", stampa: "cliente" }] } });
const mostra = (ui: React.ReactNode = <CampoVerbale />) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const azioni = () => stato.invocazioni.map(b => b.action);
const compila = () => {
  fireEvent.click(screen.getByRole("button", { name: "Verificato: Vetri integri" }));
  fireEvent.change(screen.getByLabelText("Pezzi controllati"), { target: { value: "4" } });
  fireEvent.change(screen.getByLabelText("Lavori verificati"), { target: { value: "Piano primo" } });
  fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "Mario Rossi" } });
  fireEvent.change(screen.getByLabelText("Esito"), { target: { value: "positive" } });
  fireEvent.change(screen.getByLabelText("Documenti consegnati"), { target: { value: "Istruzioni" } });
};
beforeEach(() => { stato.modelli = [modello("a", "Serramenti")]; stato.erroreModelli = null; stato.invocazioni = []; stato.righe = []; vi.clearAllMocks(); vi.spyOn(window, "open").mockReturnValue(null); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Pulsante Collaudo", () => {
  it("compare solo se il capo ha modelli da usare", async () => {
    mostra(<BottoneCollaudo orderId="o1" />);
    expect(await screen.findByRole("button", { name: "Collaudo" })).toBeInTheDocument();
  });
  it("senza modelli non compare", async () => {
    stato.modelli = [];
    const { container } = mostra(<BottoneCollaudo orderId="o1" />);
    await new Promise(r => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });
  it("con il database senza la funzione non compare e non dà errori", async () => {
    stato.erroreModelli = { code: "PGRST202" };
    const { container } = mostra(<BottoneCollaudo orderId="o1" />);
    await new Promise(r => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Verbale dal telefono", () => {
  it("con più modelli chiede quale usare", async () => {
    stato.modelli = [modello("a", "Serramenti"), modello("b", "Fotovoltaico")];
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Nuovo: Fotovoltaico" }));
    expect(screen.getByText("Collaudo Fotovoltaico")).toBeInTheDocument();
  });
  it("ogni voce ha le quattro scelte e una riserva chiede il motivo", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Nuovo: Serramenti" }));
    for (const s of ["Verificato", "Con riserva", "Non applicabile", "Da verificare"]) expect(screen.getByRole("button", { name: `${s}: Vetri integri` })).toBeInTheDocument();
    expect(screen.queryByLabelText("Motivo: Vetri integri")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Con riserva: Vetri integri" }));
    expect(screen.getByLabelText("Motivo: Vetri integri")).toBeInTheDocument();
  });
  it("il verificatore parte dal nome del capo", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Nuovo: Serramenti" }));
    expect(screen.getByLabelText("Verificatore")).toHaveValue("Marco Capo");
  });
  it("il capo salva la bozza e la riprende", async () => {
    stato.righe = [{ id: "r9", status: "draft", version: 3, created_at: "2026-11-02T10:00:00Z", content: { ...modello("a", "S").schema, title: "Bozza vecchia", date: "2026-11-02", scope: "Ripreso", inspector: "M", customer: "C", outcome: "pending", checks: [{ label: "Vetri integri", result: "ok", note: "" }], reservations: "", actions: [], documents: "", notes: "", campi: [], valori: [] } }];
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: /Bozza vecchia/ }));
    expect(screen.getByLabelText("Lavori verificati")).toHaveValue("Ripreso");
    fireEvent.change(screen.getByLabelText("Lavori verificati"), { target: { value: "Altro" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva bozza" }));
    await waitFor(() => expect(azioni()).toContain("save"));
    const s = stato.invocazioni.find(b => b.action === "save")!;
    expect(s).toMatchObject({ order_id: "o1", id: "r9", version: 3 });
  });
  it("si firma solo dopo l'anteprima, con il documento mostrato al cliente", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Nuovo: Serramenti" }));
    compila();
    expect(screen.queryByRole("button", { name: "Fai firmare al cliente" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mostra il PDF" }));
    await waitFor(() => expect(azioni()).toEqual(expect.arrayContaining(["list", "save", "preview"])));
    await waitFor(() => expect(window.open).toHaveBeenCalledWith("https://x/a.pdf", "_blank"));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Il cliente ha visto il documento" }));
    fireEvent.click(screen.getByRole("button", { name: "Fai firmare al cliente" }));
    fireEvent.click(screen.getByRole("button", { name: /Traccia/ }));
    fireEvent.click(screen.getByRole("button", { name: "Conferma la firma" }));
    await waitFor(() => expect(azioni()).toContain("sign"));
    const f = stato.invocazioni.find(b => b.action === "sign")!;
    expect(f).toMatchObject({ reviewed: true, document_hash: "h", version: 2, firma: { nome: "Mario Rossi" } });
    expect(await screen.findByText("Firmato da Mario Rossi")).toBeInTheDocument();
  });
  it("con un dato mancante dice cosa manca e non fa partire la firma", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Nuovo: Serramenti" }));
    fireEvent.click(screen.getByRole("button", { name: "Mostra il PDF" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Compila: Pezzi controllati");
    expect(azioni()).not.toContain("preview");
  });
  it("modificare dopo l'anteprima richiede di rivederla", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Nuovo: Serramenti" }));
    compila();
    fireEvent.click(screen.getByRole("button", { name: "Mostra il PDF" }));
    await screen.findByRole("checkbox", { name: "Il cliente ha visto il documento" });
    fireEvent.change(screen.getByLabelText("Lavori verificati"), { target: { value: "Cambiato" } });
    expect(screen.queryByRole("checkbox", { name: "Il cliente ha visto il documento" })).toBeNull();
  });
  it("un verbale chiuso si apre soltanto", async () => {
    stato.righe = [{ id: "r2", status: "finalized", version: 5, pdf_path: "b.pdf", firma_cliente_nome: "Anna", created_at: "2026-11-02T10:00:00Z", content: { title: "Chiuso" } }];
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: /Chiuso/ }));
    await waitFor(() => expect(azioni()).toContain("open"));
    expect(screen.queryByRole("button", { name: "Salva bozza" })).toBeNull();
  });

  it("con le riserve si scrivono gli interventi e si può far firmare", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Nuovo: Serramenti" }));
    compila();
    fireEvent.click(screen.getByRole("button", { name: "Con riserva: Vetri integri" }));
    fireEvent.change(screen.getByLabelText("Motivo: Vetri integri"), { target: { value: "Vetro graffiato" } });
    fireEvent.change(screen.getByLabelText("Esito"), { target: { value: "reserves" } });
    fireEvent.change(screen.getByLabelText("Riserve"), { target: { value: "Da sostituire" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi un intervento" }));
    fireEvent.change(screen.getByLabelText("Intervento 1"), { target: { value: "Sostituire il vetro" } });
    fireEvent.change(screen.getByLabelText("Responsabile 1"), { target: { value: "Marco" } });
    fireEvent.change(screen.getByLabelText("Entro 1"), { target: { value: "2099-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Mostra il PDF" }));
    await waitFor(() => expect(azioni()).toContain("preview"));
    const s = stato.invocazioni.find(b => b.action === "save")! as { content: { actions: unknown[] } };
    expect(s.content.actions).toEqual([{ work: "Sostituire il vetro", owner: "Marco", due: "2099-01-01" }]);
  });
  it("dopo l'anteprima l'elenco si rilegge, così la bozza riaperta ha la versione giusta", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Nuovo: Serramenti" }));
    compila();
    fireEvent.click(screen.getByRole("button", { name: "Mostra il PDF" }));
    await screen.findByRole("checkbox", { name: "Il cliente ha visto il documento" });
    await waitFor(() => expect(azioni().filter(a => a === "list").length).toBeGreaterThan(1));
  });
  it("il verbale nuovo porta con sé il modello da cui nasce", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Nuovo: Serramenti" }));
    compila();
    fireEvent.click(screen.getByRole("button", { name: "Salva bozza" }));
    await waitFor(() => expect(azioni()).toContain("save"));
    expect((stato.invocazioni.find(b => b.action === "save") as { content: { modulo_id: string } }).content.modulo_id).toBe("a");
  });

  it("se il verbale è cambiato nel frattempo rilegge l'elenco, così si riapre aggiornato", async () => {
    stato.righe = [{ id: "r9", status: "draft", version: 3, created_at: "2026-11-02T10:00:00Z", content: { title: "Bozza", date: "2026-11-02", scope: "", inspector: "", customer: "", outcome: "pending", checks: [{ label: "V", result: "ok", note: "" }], reservations: "", actions: [], documents: "", notes: "" } }];
    stato.fallisceSalva = true;
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: /Bozza/ }));
    fireEvent.change(screen.getByLabelText("Lavori verificati"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva bozza" }));
    await waitFor(() => expect(azioni().filter(a => a === "list").length).toBeGreaterThan(1));
    stato.fallisceSalva = false;
  });
});
