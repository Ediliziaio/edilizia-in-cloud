/**
 * L'anteprima del documento sulla pagina /stima (revisione del 05/10/2026, punto 5).
 *
 * Il riquadro era un iframe puntato direttamente allo storage di Supabase, ma la
 * CSP di public/_headers (frame-src) non ammette quell'host: restava un riquadro
 * vuoto alto il 75% dello schermo. In più il documento dei serramenti non è un PDF
 * ma una pagina HTML (sr-genera-pdf salva preventivo.html), che lo storage manda
 * come testo semplice. Stesso rimedio della pagina di firma: il documento si
 * scarica (la fetch è ammessa da connect-src) e si mostra da blob: se è un PDF, da
 * srcdoc isolato (sandbox, senza script) se è HTML.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

type Risposta = Record<string, unknown>;

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));

import SerramentiStimaPubblica from "@/pages/public/SerramentiStimaPubblica";

const STORAGE = "https://rsbrguhkodgnqfomrevo.supabase.co/storage/v1/object/sign/sr-progetti/az-1/p-1";
const URL_PDF = `${STORAGE}/preventivo.pdf?token=t`;
const URL_HTML = `${STORAGE}/preventivo.html?token=t`;
const BLOB = "blob:https://app.ediliziaincloud.com/anteprima-1";

const stima = (pdfUrl: string | null): Risposta => ({
  ok: true,
  firma_token: null,
  firma_in_corso: false,
  progetto: {
    code: "SR-2026-001", stato: "consegnato", cliente_nome: "Marta", cliente_cognome: "Rossi", cliente_citta: null, cantiere_citta: null,
    tipo_intervento: "sostituzione", intervento_titolo: "Infissi nuovi", intervento_sintesi: null, totale_serramenti: 8,
    totale_min: 8000, totale_max: 9000, iva_inclusa: true, risparmio_eur_anno: null, detrazione_eur_totale: null, payback_anni: null,
    co2_risparmiata_t_anno: null, consulenza_at: null, consulenza_luogo: null, valido_fino_data: null, allow_self_signing: false, firmato_il: null,
  },
  pdf_url: pdfUrl,
  azienda: { nome: "Azienda Prova", indirizzo: null, telefono: null, email: null, partita_iva: null, logo_url: null, colore_primario: "#2D7D5C" },
  consulente: null,
});

let fetchMock: ReturnType<typeof vi.fn>;

async function apri(pdfUrl: string) {
  invoke.mockResolvedValue({ data: stima(pdfUrl), error: null });
  render(
    <MemoryRouter initialEntries={["/stima/token-pubblico-della-stima"]}>
      <Routes>
        <Route path="/stima/:token" element={<SerramentiStimaPubblica />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText("Documento completo");
}

const iframes = () => Array.from(document.querySelectorAll("iframe"));

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => BLOB), configurable: true, writable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true, writable: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  invoke.mockReset();
  delete (URL as unknown as Record<string, unknown>).createObjectURL;
  delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
});

describe("pagina /stima: l'anteprima del documento", () => {
  it("un PDF si scarica e si mostra da blob: nessun iframe punta a Supabase", async () => {
    fetchMock.mockImplementation(async () => new Response(new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])]), { status: 200 }));
    await apri(URL_PDF);

    // Fin dal primo istante: niente riquadro verso lo storage.
    expect(iframes().every((f) => !(f.getAttribute("src") ?? "").includes("supabase.co"))).toBe(true);
    await waitFor(() => expect(iframes()).toHaveLength(1));
    expect(iframes()[0].getAttribute("src")).toBe(BLOB);
    expect(fetchMock).toHaveBeenCalledWith(URL_PDF);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("il documento dei serramenti è una pagina HTML: si scarica e si mostra isolato, senza script e senza src", async () => {
    fetchMock.mockImplementation(async () => new Response("<html><body><h1>Preventivo SR-2026-001</h1></body></html>", { status: 200 }));
    await apri(URL_HTML);

    await waitFor(() => expect(iframes()).toHaveLength(1));
    const quadro = iframes()[0];
    expect(quadro.getAttribute("srcdoc")).toContain("<h1>Preventivo SR-2026-001</h1>");
    expect(quadro.hasAttribute("sandbox")).toBe(true);
    expect(quadro.getAttribute("sandbox")).toBe("");
    expect(quadro.hasAttribute("src")).toBe(false);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("se il documento non si scarica non resta un riquadro vuoto, e «Apri in nuova scheda» c'è ancora", async () => {
    fetchMock.mockRejectedValue(new Error("rete"));
    await apri(URL_PDF);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(iframes()).toHaveLength(0);
    expect(screen.getByRole("link", { name: /Apri in nuova scheda/ })).toHaveAttribute("href", URL_PDF);
  });
});

describe("pagina /stima: «Apri in nuova scheda»", () => {
  it("per l'HTML la scheda si apre subito, dentro il clic, e poi va alla pagina scaricata (lo storage la darebbe come testo)", async () => {
    // Una risposta nuova a ogni richiesta: il corpo di una Response si legge una volta sola (anteprima e clic fanno due fetch).
    fetchMock.mockImplementation(async () => new Response("<html><body>Preventivo</body></html>", { status: 200 }));
    await apri(URL_HTML);
    await waitFor(() => expect(iframes()).toHaveLength(1));

    const scheda = { location: { href: "" }, close: vi.fn() };
    const apertura = vi.spyOn(window, "open").mockReturnValue(scheda as unknown as Window);
    const link = screen.getByRole("link", { name: /Apri in nuova scheda/ });
    const clic = createEvent.click(link);
    fireEvent(link, clic);

    // Subito, prima di qualsiasi attesa: il browser la lascia aprire solo qui.
    expect(apertura).toHaveBeenCalledTimes(1);
    expect(apertura).toHaveBeenCalledWith("", "_blank");
    expect(clic.defaultPrevented).toBe(true);
    await waitFor(() => expect(scheda.location.href).toBe(BLOB));
  });

  it("per un PDF resta un normale link: il browser lo apre da solo", async () => {
    fetchMock.mockImplementation(async () => new Response(new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])]), { status: 200 }));
    await apri(URL_PDF);
    await waitFor(() => expect(iframes()).toHaveLength(1));

    const apertura = vi.spyOn(window, "open").mockReturnValue(null);
    const link = screen.getByRole("link", { name: /Apri in nuova scheda/ });
    const clic = createEvent.click(link);
    fireEvent(link, clic);
    expect(apertura).not.toHaveBeenCalled();
    expect(clic.defaultPrevented).toBe(false);
    expect(link).toHaveAttribute("target", "_blank");
  });
});
