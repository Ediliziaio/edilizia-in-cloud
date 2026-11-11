import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
const mock = vi.hoisted(() => ({ invoke: vi.fn(), error: vi.fn(), signed: false, failure: "", sessione: {} as Record<string, unknown> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mock.invoke } } }));
vi.mock("sonner", () => ({ toast: { error: mock.error } }));
import FirmaDocumento from "@/pages/public/FirmaDocumento";
const token = "12345678123412341234123456789abc";
beforeEach(() => {
  mock.signed = false; mock.failure = ""; mock.sessione = {}; mock.error.mockClear(); mock.invoke.mockReset();
  mock.invoke.mockImplementation(async (nome: string) => {
    if (nome === mock.failure) return { data: { error: "Errore di prova" }, error: null };
    if (nome === "fea-documento-pubblico") return { data: mock.signed
      ? { already_signed: true, signed_at: "2026-10-09T10:00:00Z", pdf_firmato_url: "https://example.test/firmato.pdf" }
      : { request_id: "r1", tipo_documento: "quote", tipo_firmatario: "b2b", status: "pending", signer_name: "Mario Rossi", azienda_nome: "Demo", documento_titolo: "PREV-1", expires_at: "2099-01-01T10:00:00Z", ...mock.sessione }, error: null };
    if (nome === "fea-completa-firma") mock.signed = true;
    // Il codice giusto restituisce la chiave di sessione con cui si firma.
    if (nome === "fea-verifica-otp") return { data: { success: true, sessione_firma: "a".repeat(64) }, error: null };
    return { data: { success: true, firma_timestamp: "2026-10-09T10:00:00Z" }, error: null };
  });
});
afterEach(cleanup);
const disegna = () => render(<MemoryRouter initialEntries={[`/firma-fea/${token}`]}><Routes><Route path="/firma-fea/:token" element={<FirmaDocumento />} /></Routes></MemoryRouter>);
async function versoFirma() {
  fireEvent.click(await screen.findByLabelText(/Ho letto il documento/));
  fireEvent.click(screen.getByRole("button", { name: "Accetto e ricevo il codice" }));
  const cifra = await screen.findByLabelText("Cifra 1 di 6");
  fireEvent.paste(cifra, { clipboardData: { getData: () => "123456" } });
}
describe("Pagina firma: prove UI senza invii esterni", () => {
  it("senza la spunta il codice non parte; con la spunta parte, e col codice giusto è firmato senza altri passaggi", async () => {
    disegna();
    const invia = await screen.findByRole("button", { name: "Accetto e ricevo il codice" });
    expect(invia).toBeDisabled();
    expect(mock.invoke).not.toHaveBeenCalledWith("fea-genera-otp", expect.anything());
    fireEvent.click(screen.getByLabelText(/Ho letto il documento/)); fireEvent.click(invia);
    const cifra = await screen.findByLabelText("Cifra 1 di 6");
    expect(mock.invoke).toHaveBeenCalledWith("fea-genera-otp", { body: expect.objectContaining({ token, request_id: "r1" }) });
    fireEvent.paste(cifra, { clipboardData: { getData: () => "123456" } });
    expect(await screen.findByText("Documento firmato!")).toBeInTheDocument();
    // Si firma con la chiave data dalla verifica del codice; il dispositivo lo legge il server.
    expect(mock.invoke).toHaveBeenCalledWith("fea-completa-firma", { body: expect.objectContaining({ token, sessione_firma: "a".repeat(64) }) });
    expect(await screen.findByRole("link", { name: "Scarica copia firmata" })).toHaveAttribute("href", "https://example.test/firmato.pdf");
  });
  it("una sola spunta vale per clausole, recesso e privacy: il server le riceve tutte", async () => {
    mock.sessione = { tipo_firmatario: "b2c", informativa_privacy: "Informativa di prova", clausole_1341: [{ id: "c1", testo: "Art. 5 – Pagamenti: a trenta giorni" }, { id: "c2", testo: "Art. 7 – Penali: testo" }] };
    disegna();
    expect(await screen.findByLabelText(/Approvo specificamente.*Art\. 5 – Pagamenti; Art\. 7 – Penali/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approva clausola/ })).toBeNull();
    await versoFirma();
    await screen.findByText("Documento firmato!");
    expect(mock.invoke).toHaveBeenCalledWith("fea-completa-firma", { body: expect.objectContaining({
      clausole_approvate: ["c1", "c2"], b2c_clausole_approvate: ["c1", "c2"], b2c_recesso_accettato: true, privacy_accettata: true,
    }) });
  });
  it("si può rifiutare dalla prima pagina, senza chiedere il codice", async () => {
    disegna();
    fireEvent.click(await screen.findByRole("button", { name: "Rifiuta il documento" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Conferma rifiuto" }));
    await waitFor(() => expect(mock.invoke).toHaveBeenCalledWith("fea-rifiuta-firma", expect.anything()));
    expect(mock.invoke).not.toHaveBeenCalledWith("fea-genera-otp", expect.anything());
  });
  it("errore OTP: non firma e non comunica successo", async () => {
    mock.failure = "fea-verifica-otp"; disegna(); await versoFirma();
    expect(await screen.findByText("Errore di prova")).toBeInTheDocument();
    expect(mock.invoke).not.toHaveBeenCalledWith("fea-completa-firma", expect.anything());
    expect(screen.queryByText("Documento firmato!")).toBeNull();
  });
  it("firma non registrata: si riprova senza rifare il codice", async () => {
    mock.failure = "fea-completa-firma"; disegna(); await versoFirma();
    const riprova = await screen.findByRole("button", { name: "Riprova a firmare" });
    await waitFor(() => expect(mock.error).toHaveBeenCalledWith("Errore di prova"));
    expect(screen.queryByText("Documento firmato!")).toBeNull();
    mock.failure = ""; fireEvent.click(riprova);
    expect(await screen.findByText("Documento firmato!")).toBeInTheDocument();
  });
  it("firma avanzata al primo documento: dopo il codice chiede il documento d'identità, poi si firma", async () => {
    const base = mock.invoke.getMockImplementation()!;
    mock.invoke.mockImplementation(async (nome: string, opz: unknown) => nome === "fea-documento-pubblico" && !mock.signed
      ? { data: { request_id: "r1", tipo_documento: "quote", tipo_firmatario: "b2b", status: "pending", signer_name: "Mario Rossi", azienda_nome: "Demo", documento_titolo: "PREV-1", expires_at: "2099-01-01T10:00:00Z",
          livello_firma: "avanzata", identificazione_richiesta: true, dichiarazione_fea: { versione: "2026-10-22", testo: "Condizioni di prova" } }, error: null }
      : base(nome, opz));
    disegna(); await versoFirma();
    expect(await screen.findByRole("heading", { name: "Chi sei" })).toBeInTheDocument();
    expect(screen.getByText("Condizioni di prova")).toBeInTheDocument();
    const conferma = screen.getByRole("button", { name: "Conferma e continua" });
    expect(conferma).toBeDisabled();
    expect(mock.invoke).not.toHaveBeenCalledWith("fea-completa-firma", expect.anything());
  });
  it("riaprendo il link già firmato offre solo la copia, senza un secondo OTP", async () => {
    mock.signed = true; disegna();
    expect(await screen.findByRole("link", { name: "Scarica copia firmata" })).toHaveAttribute("href", "https://example.test/firmato.pdf");
    expect(mock.invoke).toHaveBeenCalledTimes(1); expect(screen.queryByRole("button", { name: "Accetto e ricevo il codice" })).toBeNull();
  });
});
