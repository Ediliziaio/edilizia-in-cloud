import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Il cliente apre il link di firma dal telefono. La cornice della pagina era
// un componente definito dentro FirmaDocumento: a ogni render (il timer
// dell'OTP scatta ogni secondo) React rimontava tutto, i sei campi perdevano
// il fuoco e l'autofocus tornava sulla prima cifra; su iPhone la tastiera si
// chiudeva a ogni cifra.

const invoke = vi.fn(async (nome: string) => {
  if (nome === "fea-documento-pubblico") {
    return {
      data: {
        request_id: "r1",
        tipo_documento: "preventivo",
        tipo_firmatario: "b2b",
        signer_name: "Mario Rossi",
        azienda_nome: "Demo Srl",
        documento_titolo: "Preventivo PREV-1",
        pdf_url: null,
        status: "pending",
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        b2c_testo_recesso: null,
        b2c_clausole: null,
        signer_email_mascherata: "m***@esempio.it",
        // OTP già valido (partito con l'offerta): la pagina va dritta ai 6 campi.
        otp_valido_fino: new Date(Date.now() + 5 * 60_000).toISOString(),
      },
      error: null,
    };
  }
  return { data: null, error: null };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...(a as [string])) } } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import FirmaDocumento from "@/pages/public/FirmaDocumento";

afterEach(cleanup);

describe("firma del cliente: i campi OTP tengono il fuoco", () => {
  it("dopo una cifra il fuoco passa alla seconda e resta lì anche quando scatta il timer", async () => {
    render(
      <MemoryRouter initialEntries={["/firma-fea/abc"]}>
        <Routes>
          <Route path="/firma-fea/:token" element={<FirmaDocumento />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Continua con il codice" }));
    const prima = await screen.findByLabelText("Cifra 1 di 6");
    // La pagina mette il fuoco sulla prima cifra dopo 100ms: una persona scrive dopo.
    await act(() => new Promise((r) => setTimeout(r, 150)));
    expect(document.activeElement).toBe(prima);

    fireEvent.change(prima, { target: { value: "4" } });
    await act(() => new Promise((r) => setTimeout(r, 30)));
    expect(document.activeElement).toBe(screen.getByLabelText("Cifra 2 di 6"));

    // Un giro del timer (1s): prima rimontava la pagina e il fuoco tornava alla prima cifra.
    await act(() => new Promise((r) => setTimeout(r, 1100)));
    expect(screen.getByLabelText("Cifra 1 di 6")).toBe(prima);
    expect(prima).toHaveValue("4");
    expect(document.activeElement).toBe(screen.getByLabelText("Cifra 2 di 6"));
  });
});
