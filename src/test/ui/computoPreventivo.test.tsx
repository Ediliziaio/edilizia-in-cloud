import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { bozzaVuota, chiaveBozzaComputo } from "@/lib/computo/editorNativo";
import ComputoPreventivo from "@/pages/azienda/marketing/ComputoPreventivo";
import ComputiPreventivoLocali from "@/components/computo/ComputiPreventivoLocali";

const stato = vi.hoisted(() => ({ company: "c1", user: "u1" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: stato.user }, effectiveCompany: { id: stato.company, name: "Impresa di prova" } }) }));
vi.mock("@/components/computo/ComputoNativoEditor", () => ({ default: ({ storageKey, onBack }: { storageKey: string; onBack: () => void }) =>
  <><output data-testid="storage-key">{storageKey}</output><button onClick={onBack}>Torna ai Preventivi</button></> }));
const ID = "22222222-2222-4222-8222-222222222222";
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
beforeEach(() => { localStorage.clear(); stato.company = "c1"; stato.user = "u1"; });

describe("computo nel flusso Preventivi", () => {
  it("mantiene l'identità della bozza nell'URL e non richiede una commessa", () => {
    render(<MemoryRouter initialEntries={[`/azienda/marketing/preventivi/computo?bozza=${ID}`]}><ComputoPreventivo /><Location /></MemoryRouter>);
    expect(screen.getByTestId("storage-key")).toHaveTextContent(chiaveBozzaComputo("c1", "u1", `preventivo:${ID}`));
    fireEvent.click(screen.getByRole("button", { name: "Torna ai Preventivi" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/azienda/marketing/preventivi");
  });
  it("assegna un identificativo al nuovo preventivo locale", () => {
    render(<MemoryRouter initialEntries={["/azienda/marketing/preventivi/computo"]}><ComputoPreventivo /><Location /></MemoryRouter>);
    expect(screen.getByTestId("location").textContent).toMatch(/bozza=[0-9a-f-]{36}/);
  });
  it("nella versione pubblicata blocca altre aziende anche con URL diretto", () => {
    vi.stubEnv("DEV", false);
    try {
      render(<MemoryRouter initialEntries={[`/azienda/marketing/preventivi/computo?bozza=${ID}`]}><ComputoPreventivo /></MemoryRouter>);
      expect(screen.getByRole("alert")).toHaveTextContent("solo per Demo Azienda 2");
      expect(screen.queryByTestId("storage-key")).not.toBeInTheDocument();
    } finally { vi.unstubAllEnvs(); }
  });
  it("elenca e riprende solo le bozze dell'azienda e utente attivi", () => {
    localStorage.setItem(chiaveBozzaComputo("c1", "u1", `preventivo:${ID}`), JSON.stringify({ ...bozzaVuota(), titolo: "Preventivo locale A" }));
    localStorage.setItem(chiaveBozzaComputo("c2", "u1", `preventivo:${ID}`), JSON.stringify({ ...bozzaVuota(), titolo: "Riservato azienda B" }));
    localStorage.setItem(chiaveBozzaComputo("c1", "u2", `preventivo:${ID}`), JSON.stringify({ ...bozzaVuota(), titolo: "Riservato altro utente" }));
    const { rerender } = render(<MemoryRouter><ComputiPreventivoLocali /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /Preventivo locale A/ })).toHaveAttribute("href", `/azienda/marketing/preventivi/computo?bozza=${ID}`);
    expect(screen.queryByText(/Riservato/)).not.toBeInTheDocument();
    stato.company = "c2"; rerender(<MemoryRouter><ComputiPreventivoLocali /></MemoryRouter>);
    expect(screen.queryByText("Preventivo locale A")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Riservato azienda B/ })).toBeInTheDocument();
  });
});
