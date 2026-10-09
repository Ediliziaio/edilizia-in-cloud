/**
 * La ricerca delle impostazioni trova le funzioni del preventivo per quello che sono, non solo per il nome della
 * pagina (09/10/2026): chi cerca «prezzo manuale» o «posa automatica» arriva alla sezione giusta, già scorsa.
 * Prima nell'indice c'era «Margini e sconti · Margini» con cinque parole e nessuna parlava del prezzo.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SettingsSearch } from "@/components/layouts/SettingsSearch";

const state = vi.hoisted(() => ({
  navigate: vi.fn(),
  permessi: { isAdmin: true, isLoading: false } as Record<string, unknown>,
}));
vi.mock("react-router-dom", async (importOriginal) => ({ ...(await importOriginal<typeof import("react-router-dom")>()), useNavigate: () => state.navigate }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.permessi }));
vi.mock("@/hooks/useStatoPiano", () => ({ useStatoPiano: () => ({ stato: { tuttoVisibile: true } }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

beforeAll(() => {
  // cmdk misura e scorre: in jsdom non esiste.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); state.navigate.mockClear(); state.permessi = { isAdmin: true, isLoading: false }; });

async function cerca(testo: string) {
  render(<MemoryRouter><SettingsSearch /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Cerca nelle impostazioni" }));
  const campo = await screen.findByPlaceholderText(/Cerca impostazioni/);
  fireEvent.change(campo, { target: { value: testo } });
}

describe("ricerca delle impostazioni: le funzioni del preventivo", () => {
  it.each([
    ["prezzo manuale", "Prezzo scritto a mano", "/azienda/impostazioni/margini#prezzo"],
    ["prezzo a mano", "Prezzo scritto a mano", "/azienda/impostazioni/margini#prezzo"],
    ["posa automatica", "Posa, trasporto e smaltimento", "/azienda/impostazioni/margini#posa-e-trasporto"],
    ["smaltimento", "Posa, trasporto e smaltimento", "/azienda/impostazioni/margini#posa-e-trasporto"],
    ["prefisso", "Numero del preventivo", "/azienda/impostazioni/margini#numerazione"],
    ["firma digitale", "PDF e firma del preventivo", "/azienda/impostazioni/margini#pdf-e-firma"],
    ["margine minimo", "Margini e spese generali", "/azienda/impostazioni/margini#margini"],
    ["seconda firma", "Modelli di preventivo · Approvazioni", "/azienda/impostazioni/approvazioni"],
    ["sconto massimo", "Modelli di preventivo · Sconti", "/azienda/impostazioni/scontistica"],
  ])("«%s» trova «%s» e apre %s", async (testo, titolo, url) => {
    await cerca(testo);
    const risultato = await screen.findByText(titolo);
    fireEvent.click(risultato);
    await waitFor(() => expect(state.navigate).toHaveBeenCalledWith(url));
  });

  it("senza il permesso sui costi le sezioni di Prezzo e margini non compaiono nei risultati", async () => {
    state.permessi = { isAdmin: false, isLoading: false, canViewSettingsPricing: true };
    await cerca("prezzo manuale");
    await waitFor(() => expect(screen.queryByText("Prezzo scritto a mano")).toBeNull());
  });

  it("non esiste più «Margini e sconti» tra i risultati", async () => {
    await cerca("margini");
    await screen.findByText("Modelli di preventivo · Prezzo e margini");
    expect(screen.queryByText(/^Margini e sconti ·/)).toBeNull();
  });
});
