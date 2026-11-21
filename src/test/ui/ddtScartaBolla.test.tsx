/**
 * Una bolla caricata e non registrata si scarta (12/11/2026).
 *
 * Una bolla doppia restava «Da controllare in ufficio»: il cestino della finestra «Carica più
 * bolle» la toglieva solo dalla finestra, e nell'elenco ricompariva. Ora «Scarta» la toglie
 * davvero, col file caricato.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn(), ok: vi.fn(), err: vi.fn(), vocale: vi.fn(), firma: vi.fn(), conferma: true }));
vi.mock("sonner", () => ({ toast: { success: m.ok, error: m.err } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => async () => m.conferma }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/integrations/supabase/client", () => {
  const q = { select: () => q, eq: () => q, maybeSingle: m.vocale };
  return { supabase: { rpc: m.rpc, from: () => q, storage: { from: () => ({ remove: m.remove, createSignedUrl: m.firma }) } } };
});

import { RigaDocumentoInIngresso } from "@/components/ddt/DocumentiInIngresso";
import type { DocumentoPersistente } from "@/lib/ddt/documentiPersistenti";

const doc = {
  id: "j1", company_id: "c1", created_by: "u1", order_id: null, source: "desktop", status: "review", destinazione: "cantiere",
  warehouse_id: null, files: [{ name: "IC0001.pdf", path: "c1/u1/j1/1-originale.pdf", mime: "application/pdf", size: 10 }],
  split_ids: null, last_error: null, ddt_id: null, created_at: "2026-11-11T10:00:00Z", updated_at: "2026-11-11T10:00:00Z", result: null,
} as unknown as DocumentoPersistente;

function disegna(documento = doc) {
  render(
    <QueryClientProvider client={new QueryClient()}><MemoryRouter>
      <table><tbody><RigaDocumentoInIngresso documento={documento} apri={vi.fn()} riprova={vi.fn()} riprovando={null} /></tbody></table>
    </MemoryRouter></QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks(); m.conferma = true;
  m.rpc.mockResolvedValue({ data: { scartato: true, files: doc.files }, error: null });
  m.remove.mockResolvedValue({ error: null });
});

it("apre dalla bolla il vocale originale e la trascrizione solo su richiesta", async () => {
  m.vocale.mockResolvedValue({ data: {
    media_storage_path: "c1/2026-11/vocale.ogg", ai_extracted_data: { trascrizione_italiana: "La merce va a PROVA-SIMULA." },
  }, error: null });
  m.firma.mockResolvedValue({ data: { signedUrl: "https://file.invalid/vocale.ogg" }, error: null });
  disegna({ ...doc, source: "whatsapp", whatsapp_voice_message_id: "m1" });
  expect(m.vocale).not.toHaveBeenCalled();
  const pannello = screen.getByText("Destinazione indicata a voce").closest("details")!;
  pannello.open = true;
  fireEvent(pannello, new Event("toggle"));
  expect(await screen.findByText("La merce va a PROVA-SIMULA.")).toBeInTheDocument();
  expect(screen.getByLabelText("Vocale WhatsApp originale")).toHaveAttribute("src", "https://file.invalid/vocale.ogg");
  expect(m.firma).toHaveBeenCalledWith("c1/2026-11/vocale.ogg", 300);
});
afterEach(cleanup);

describe("Scartare una bolla caricata", () => {
  it("con la conferma la scarta e toglie il file", async () => {
    disegna();
    fireEvent.click(screen.getByRole("button", { name: "Scarta" }));
    await waitFor(() => expect(m.ok).toHaveBeenCalledWith("Bolla scartata"));
    expect(m.rpc).toHaveBeenCalledWith("ddt_documento_scarta", { p_id: "j1" });
    expect(m.remove).toHaveBeenCalledWith(["c1/u1/j1/1-originale.pdf"]);
  });

  it("senza conferma non fa niente", async () => {
    m.conferma = false;
    disegna();
    fireEvent.click(screen.getByRole("button", { name: "Scarta" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("col database di prima dice che non è ancora attivo", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "not found" } });
    disegna();
    fireEvent.click(screen.getByRole("button", { name: "Scarta" }));
    await waitFor(() => expect(m.err).toHaveBeenCalled());
    expect(m.err.mock.calls[0][1].description).toMatch(/non è ancora attivo/);
  });
});
