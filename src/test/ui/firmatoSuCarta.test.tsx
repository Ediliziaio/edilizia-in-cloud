import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const finto = vi.hoisted(() => ({ upload: vi.fn(), rpc: vi.fn(), signed: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ upload: finto.upload, createSignedUrl: finto.signed }) },
    rpc: finto.rpc,
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ContrattoFirmatoCard, FirmatoSuCartaDialog } from "@/components/marketing/preventivi/FirmatoSuCarta";

const disegna = (onOpenChange = vi.fn()) => render(
  <QueryClientProvider client={new QueryClient()}>
    <FirmatoSuCartaDialog open onOpenChange={onOpenChange} quote={{ id: "q1", company_id: "az", client_name: "Mario Rossi", quote_number: "OFF-1" }} />
  </QueryClientProvider>,
);

describe("firmato su carta", () => {
  beforeEach(() => {
    finto.upload.mockReset().mockResolvedValue({ error: null });
    finto.rpc.mockReset().mockResolvedValue({ error: null });
  });

  it("senza scansione non registra niente", async () => {
    disegna();
    fireEvent.click(screen.getByRole("button", { name: /Registra la firma/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Carica la scansione/);
    expect(finto.upload).not.toHaveBeenCalled();
    expect(finto.rpc).not.toHaveBeenCalled();
  });

  it("carica la scansione nella cartella del preventivo e registra la firma col firmatario", async () => {
    const chiudi = vi.fn();
    disegna(chiudi);
    const file = new File(["%PDF"], "Contratto Rossi.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Scansione del contratto firmato"), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText("Firmato il"), { target: { value: "2026-10-20" } });
    expect(screen.getByLabelText("Firmato da")).toHaveValue("Mario Rossi");
    fireEvent.click(screen.getByRole("button", { name: /Registra la firma/ }));
    await waitFor(() => expect(chiudi).toHaveBeenCalledWith(false));
    const percorso = finto.upload.mock.calls[0][0] as string;
    expect(percorso).toMatch(/^az\/contratti-carta\/q1\/\d+-Contratto-Rossi\.pdf$/);
    expect(finto.upload.mock.calls[0][2]).toMatchObject({ upsert: false });
    // Prima la verifica senza file, poi la firma col file.
    expect(finto.rpc.mock.calls[0][1]).toMatchObject({ p_quote: "q1", p_path: null, p_solo_verifica: true });
    expect(finto.rpc.mock.calls[1][1]).toMatchObject({ p_quote: "q1", p_path: percorso, p_firmato_il: "2026-10-20", p_firmatario: "Mario Rossi" });
  });

  it("se la verifica rifiuta, la scansione non si carica (resterebbe orfana)", async () => {
    finto.rpc.mockResolvedValue({ error: new Error("Il preventivo è già firmato: è già il contratto.") });
    const chiudi = vi.fn();
    disegna(chiudi);
    fireEvent.change(screen.getByLabelText("Scansione del contratto firmato"), { target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] } });
    fireEvent.click(screen.getByRole("button", { name: /Registra la firma/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/già il contratto/);
    expect(chiudi).not.toHaveBeenCalled();
    expect(finto.upload).not.toHaveBeenCalled();
  });

  it("il riquadro dice come è stato firmato e apre il documento", () => {
    render(<ContrattoFirmatoCard quote={{ firma_modo: "carta", signed_at: "2026-10-20T10:00:00Z", signed_by_name: "Mario Rossi",
      contratto_firmato: { bucket: "quote-pdfs", path: "az/contratti-carta/q1/1-a.pdf", name: "a.pdf" } }} />);
    expect(screen.getByText("Firmato su carta")).toBeInTheDocument();
    expect(screen.getByText(/da Mario Rossi/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apri il contratto firmato/ })).toBeInTheDocument();
  });

  it("senza firma il riquadro non c'è", () => {
    const { container } = render(<ContrattoFirmatoCard quote={{ signed_at: null }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
