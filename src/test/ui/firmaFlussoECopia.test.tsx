import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
const mock = vi.hoisted(() => ({ invoke: vi.fn(), error: vi.fn(), signed: false, failure: "" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mock.invoke } } }));
vi.mock("sonner", () => ({ toast: { error: mock.error } }));
import FirmaDocumento from "@/pages/public/FirmaDocumento";
const token = "12345678123412341234123456789abc";
beforeEach(() => {
  mock.signed = false; mock.failure = ""; mock.error.mockClear(); mock.invoke.mockReset();
  mock.invoke.mockImplementation(async (nome: string) => {
    if (nome === mock.failure) return { data: { error: "Errore di prova" }, error: null };
    if (nome === "fea-documento-pubblico") return { data: mock.signed
      ? { already_signed: true, signed_at: "2026-10-09T10:00:00Z", pdf_firmato_url: "https://example.test/firmato.pdf" }
      : { request_id: "r1", tipo_documento: "quote", tipo_firmatario: "b2b", status: "pending", signer_name: "Mario Rossi", azienda_nome: "Demo", documento_titolo: "PREV-1", expires_at: "2099-01-01T10:00:00Z" }, error: null };
    if (nome === "fea-completa-firma") mock.signed = true;
    return { data: { success: true, firma_timestamp: "2026-10-09T10:00:00Z" }, error: null };
  });
});
afterEach(cleanup);
const disegna = () => render(<MemoryRouter initialEntries={[`/firma-fea/${token}`]}><Routes><Route path="/firma-fea/:token" element={<FirmaDocumento />} /></Routes></MemoryRouter>);
async function versoFirma() {
  fireEvent.click(await screen.findByRole("button", { name: "Continua con il codice" }));
  const cifra = await screen.findByLabelText("Cifra 1 di 6");
  fireEvent.paste(cifra, { clipboardData: { getData: () => "123456" } });
}
describe("Pagina firma: prove UI senza invii esterni", () => {
  it("invio OTP con token, incolla codice, consenso, firma e download della COPIA firmata", async () => {
    disegna(); await versoFirma();
    expect(mock.invoke).toHaveBeenCalledWith("fea-genera-otp", { body: expect.objectContaining({ token, request_id: "r1" }) });
    const firma = await screen.findByRole("button", { name: /Accetto e firmo/ }); expect(firma).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Confermo di aver letto/)); fireEvent.click(firma);
    expect(await screen.findByText("Documento firmato!")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Scarica copia firmata" })).toHaveAttribute("href", "https://example.test/firmato.pdf");
  });
  it("errore OTP: non entra nella firma e non comunica successo", async () => {
    mock.failure = "fea-verifica-otp"; disegna(); await versoFirma();
    expect(await screen.findByText("Errore di prova")).toBeInTheDocument(); expect(screen.queryByRole("button", { name: /Accetto e firmo/ })).toBeNull();
  });
  it("errore di firma: rimane sulla firma e permette di riprovare", async () => {
    mock.failure = "fea-completa-firma"; disegna(); await versoFirma();
    const firma = await screen.findByRole("button", { name: /Accetto e firmo/ });
    fireEvent.click(screen.getByLabelText(/Confermo di aver letto/)); fireEvent.click(firma);
    await waitFor(() => expect(mock.error).toHaveBeenCalledWith("Errore di prova"));
    expect(screen.queryByText("Documento firmato!")).toBeNull(); expect(firma).toBeEnabled();
  });
  it("riaprendo il link già firmato offre solo la copia, senza un secondo OTP", async () => {
    mock.signed = true; disegna();
    expect(await screen.findByRole("link", { name: "Scarica copia firmata" })).toHaveAttribute("href", "https://example.test/firmato.pdf");
    expect(mock.invoke).toHaveBeenCalledTimes(1); expect(screen.queryByRole("button", { name: "Continua con il codice" })).toBeNull();
  });
});
