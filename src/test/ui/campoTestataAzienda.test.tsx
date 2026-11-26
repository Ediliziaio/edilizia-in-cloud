/** Intestazione dell'app di cantiere (26/11/2026): solo l'area in alto; dal logo si sceglie l'azienda se ce n'è più d'una. */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const stato = vi.hoisted(() => ({
  accessi: [] as Array<{ company_id: string; access_role: string; company: { name: string; logo_url: string | null } }>,
  selezionata: "a1" as string | null,
  logo: null as string | null,
  area: false,
  cambia: vi.fn(),
}));
vi.mock("@/lib/campo/lingua/LinguaCampo", () => ({ useT: () => (s: string) => s }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    // `null as null`: il progetto ha strictNullChecks spento, e lì un `null` nudo vale `any` (TS7018).
    effectiveCompany: { name: "Edil Rossi Srl", logo_url: stato.logo }, company: null as null,
    multiCompanyAccesses: stato.accessi, selectedMultiCompanyId: stato.selezionata,
    switchMultiCompany: stato.cambia, puoCambiareArea: stato.area,
  }),
}));

import { TestataAziendaCampo } from "@/components/campo/TestataAziendaCampo";

const mostra = () => render(<MemoryRouter><TestataAziendaCampo home="/campo" area="Area Operaio" /></MemoryRouter>);

beforeEach(() => { stato.accessi = []; stato.logo = null; stato.area = false; stato.cambia.mockReset(); });

describe("intestazione dell'app di cantiere", () => {
  it("con una sola azienda: logo verso la Home, solo l'area, niente nome dell'azienda né linguetta", () => {
    mostra();
    expect(screen.getByText("Area Operaio")).toBeInTheDocument();
    expect(screen.queryByText("Edil Rossi Srl")).toBeNull();
    expect(screen.getByRole("link", { name: "Home Edilizia in Cloud" })).toHaveAttribute("href", "/campo");
    expect(screen.queryByRole("button", { name: "Cambia azienda o area" })).toBeNull();
  });

  it("usa il logo dell'azienda se l'ha caricato", () => {
    stato.logo = "https://esempio.it/logo.png";
    mostra();
    expect(screen.getByRole("img", { name: "Edil Rossi Srl" })).toHaveAttribute("src", "https://esempio.it/logo.png");
  });

  it("con più aziende il logo apre la scelta e cambia azienda", () => {
    stato.accessi = [
      { company_id: "a1", access_role: "employee", company: { name: "Edil Rossi Srl", logo_url: null } },
      { company_id: "a2", access_role: "employee", company: { name: "Impianti Bianchi", logo_url: null } },
    ];
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Cambia azienda o area" }));
    expect(screen.getByText("Le tue aziende")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Impianti Bianchi/ }));
    expect(stato.cambia).toHaveBeenCalledWith("a2");
  });

  it("chi passa anche dall'ufficio trova «Torna al gestionale»", () => {
    stato.area = true;
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Cambia azienda o area" }));
    expect(screen.getByRole("button", { name: /Torna al gestionale/ })).toBeInTheDocument();
  });
});
