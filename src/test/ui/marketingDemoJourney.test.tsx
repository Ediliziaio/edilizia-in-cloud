import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Demo from "@/pages/Demo";
import ChiSiamo from "@/pages/ChiSiamo";
const submit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/publicLeadSubmit", () => ({ submitPublicLeadToCrm: submit, attachReferralToLead: vi.fn() }));
vi.mock("@/components/landing/LandingNavbar", () => ({ default: () => <nav /> }));
vi.mock("@/components/landing/LandingFooter", () => ({ default: () => <footer /> }));
beforeEach(() => { submit.mockReset().mockResolvedValue(undefined); localStorage.clear(); HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);
function openDemo() { render(<MemoryRouter initialEntries={["/demo/"]}><Routes><Route path="/demo/" element={<Demo />} /><Route path="/demo/grazie" element={<h1>Scegli l’appuntamento</h1>} /></Routes></MemoryRouter>); }
function fill(phone = "+39 333 1234567") {
  for (const [name,value] of [["Nome", "Mario"],["Cognome","Rossi"],["Nome Azienda","Edile Test"],["Telefono",phone],["Email","mario@example.com"]]) fireEvent.change(screen.getByLabelText(`${name} *`, { exact: true }),{target:{value}});
  fireEvent.change(screen.getByLabelText(/^Fatturato Annuo/),{target:{value:"non-indicato"}});
  fireEvent.click(screen.getByRole("checkbox",{name:/Ho letto e accetto/}));
}
describe("percorso pubblico demo", () => {
  it("collega gli errori ai campi e non invia una richiesta incompleta", () => {
    openDemo(); fireEvent.submit(document.querySelector("form")!);
    const name=screen.getByLabelText(/^Nome \*/);
    expect(name).toHaveAttribute("aria-invalid","true");
    expect(document.getElementById(name.getAttribute("aria-describedby")!)?.textContent).toBe("Campo obbligatorio");
    expect(submit).not.toHaveBeenCalled();
  });
  it("non considera spazi e parentesi come cifre del telefono", () => {
    openDemo(); fill("(       )"); fireEvent.submit(document.querySelector("form")!);
    expect(screen.getByLabelText(/^Telefono/)).toHaveAttribute("aria-invalid","true");
    expect(submit).not.toHaveBeenCalled();
  });
  it("consente di non indicare il fatturato e conserva il consenso marketing facoltativo", async () => {
    openDemo(); fill(); await act(async () => { fireEvent.submit(document.querySelector("form")!); });
    await waitFor(()=>expect(screen.getByRole("heading",{name:"Scegli l’appuntamento"})).toBeInTheDocument());
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({nome:"Mario Rossi", source:"demo", marketing_consent:false, messaggio:expect.stringContaining("Preferisco parlarne durante la demo")}));
  });
  it("mantiene i dati nel modulo quando l’invio fallisce", async () => {
    submit.mockRejectedValueOnce(new Error("Temporary failure"));
    openDemo(); fill(); await act(async () => { fireEvent.submit(document.querySelector("form")!); });
    expect(await screen.findByRole("alert")).toHaveTextContent("Riprova");
    expect(screen.getByLabelText(/^Nome \*/)).toHaveValue("Mario");
    expect(screen.getByRole("button",{name:/Richiedi la Demo/})).toBeEnabled();
  });
  it("rende le risposte FAQ coerenti con i dati strutturati", () => {
    openDemo(); const faq=JSON.parse(document.getElementById("jsonld-faq-demo")!.textContent!);
    for(const entry of faq.mainEntity) expect(document.body.textContent).toContain(entry.acceptedAnswer.text);
  });
  it("presenta l’azienda e i riferimenti societari con collegamenti ai documenti", () => {
    render(<MemoryRouter><ChiSiamo /></MemoryRouter>);
    expect(screen.getByRole("heading",{name:"Edilizia in Cloud",exact:true})).toBeInTheDocument();
    expect(screen.queryByRole("heading",{name:"Florin Andriciuc"})).not.toBeInTheDocument();
    expect(screen.getByRole("link",{name:"Termini di servizio"})).toHaveAttribute("href","/termini-e-condizioni/");
    expect(document.querySelectorAll("h1")).toHaveLength(1);
  });
});
