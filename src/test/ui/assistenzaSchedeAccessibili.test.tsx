import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import AssistenzaPage from "@/pages/azienda/AssistenzaPage";

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewTickets: true, canViewManutenzione: true }) }));
vi.mock("@/pages/azienda/TicketsList", () => ({ default: () => <p>Elenco assistenze di prova</p> }));
vi.mock("@/pages/azienda/ManutenzioneList", () => ({ default: () => <p>Elenco manutenzioni di prova</p> }));
function Location() { return <output data-testid="url">{useLocation().search}</output>; }
afterEach(cleanup);

it("collega schede e pannello, mantiene gli altri parametri e permette le frecce da tastiera", async () => {
  render(<MemoryRouter initialEntries={["/azienda/assistenza?tipo=intervento&cerca=demo"]}><AssistenzaPage /><Location /></MemoryRouter>);
  const assistenza = screen.getByRole("tab", { name: "Assistenza" });
  const manutenzioni = screen.getByRole("tab", { name: "Manutenzioni" });
  await waitFor(() => expect(screen.getByRole("tabpanel", { name: "Assistenza" })).toHaveTextContent("Elenco assistenze di prova"));
  assistenza.focus();
  fireEvent.keyDown(assistenza, { key: "ArrowRight", code: "ArrowRight" });
  await waitFor(() => expect(manutenzioni).toHaveAttribute("aria-selected", "true"));
  await waitFor(() => expect(screen.getByRole("tabpanel", { name: "Manutenzioni" })).toHaveTextContent("Elenco manutenzioni di prova"));
  expect(screen.getByTestId("url").textContent).toContain("cerca=demo");
  expect(screen.getByTestId("url").textContent).toContain("vista=manutenzioni");
  expect(screen.getByTestId("url").textContent).not.toContain("tipo=");
});
