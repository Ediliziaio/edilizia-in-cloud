import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({
  caricati: [] as string[],
  rimossi: [] as string[][],
  inserti: [] as Array<Record<string, unknown>>,
  cancellati: [] as string[],
  erroreRiga: null as null | { message: string },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({
      upload: (p: string) => { state.caricati.push(p); return Promise.resolve({ data: { path: p }, error: null }); },
      remove: (p: string[]) => { state.rimossi.push(p); return Promise.resolve({ error: null }); },
      createSignedUrl: () => Promise.resolve({ data: { signedUrl: "https://x" }, error: null }),
    }) },
    from: () => ({
      insert: (r: Record<string, unknown>) => { state.inserti.push(r); return Promise.resolve({ error: state.erroreRiga }); },
      delete: () => ({ eq: (_c: string, v: string) => { state.cancellati.push(v); return Promise.resolve({ error: null }); } }),
    }),
  },
}));
import { OdaDocumentoCard } from "@/components/orders/OdaDocumentoCard";

const pdf = () => new File(["%PDF-1.4"], "ordine firmato.pdf", { type: "application/pdf" });

beforeEach(() => { state.caricati = []; state.rimossi = []; state.inserti = []; state.cancellati = []; state.erroreRiga = null; });

describe("Documento dell'ordine nella pagina dell'ordine", () => {
  it("si carica sotto la commessa, si registra tra i suoi documenti e poi si collega all'ordine", async () => {
    const onChange = vi.fn();
    render(<OdaDocumentoCard odaId="po1" commessaId="o1" label="Documento d'ordine" attachmentUrl={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("File: documento d'ordine"), { target: { files: [pdf()] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const percorso = onChange.mock.calls[0][0] as string;
    expect(percorso).toMatch(/^orders\/o1\/.+-ordine_firmato\.pdf$/);
    expect(state.caricati).toEqual([percorso]);
    expect(state.inserti[0]).toMatchObject({ order_id: "o1", file_url: percorso, access_scope: "costi", visible_to_customer: false });
  });

  it("se la registrazione fallisce il file si toglie e l'ordine non punta a un documento illeggibile", async () => {
    state.erroreRiga = { message: "permesso negato" };
    const onChange = vi.fn();
    render(<OdaDocumentoCard odaId="po1" commessaId="o1" label="Documento d'ordine" attachmentUrl={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("File: documento d'ordine"), { target: { files: [pdf()] } });
    await waitFor(() => expect(state.rimossi).toEqual([[state.caricati[0]]]));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("senza commessa spiega perché non si può caricare", () => {
    render(<OdaDocumentoCard odaId="po1" commessaId={null} label="Documento d'ordine" attachmentUrl={null} onChange={vi.fn()} />);
    expect(screen.getByText(/collega prima l’ordine a una commessa/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Carica/ })).not.toBeInTheDocument();
  });

  it("togliere il documento stacca l'ordine, toglie la riga della commessa e il file", async () => {
    const onChange = vi.fn();
    render(<OdaDocumentoCard odaId="po1" commessaId="o1" label="Documento d'ordine" attachmentUrl="orders/o1/1-x-ordine.pdf" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi documento d'ordine" }));
    await waitFor(() => expect(state.rimossi).toEqual([["orders/o1/1-x-ordine.pdf"]]));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(state.cancellati).toEqual(["orders/o1/1-x-ordine.pdf"]);
  });
});
