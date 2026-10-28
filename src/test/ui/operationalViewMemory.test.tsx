import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { useOperationalViewMemory } from "@/hooks/useOperationalViewMemory";
import {
  useOperationalArchive,
  inOperationalScope,
} from "@/hooks/useOperationalArchive";
import { OperationalArchive } from "@/components/orders/OperationalArchive";
const auth = vi.hoisted(() => ({ company: "co", user: "u" }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: auth.user },
    effectiveCompany: { id: auth.company },
  }),
}));
function App() {
  useOperationalViewMemory("rdo", ["rdo_vista", "rdo_cerca", "rdo_ambito"]);
  const [params] = useSearchParams();
  const archive = useOperationalArchive("rdo_ambito");
  return (
    <>
      <OperationalArchive
        label="test"
        active={2}
        history={3}
        scope={archive.scope}
        onChange={(v) => archive.setScope(v, ["rdo_stato"])}
      />
      <output data-testid="url">{params.toString()}</output>
    </>
  );
}
function open(url = "/?tab=offerte") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <App />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  sessionStorage.clear();
  auth.company = "co";
  auth.user = "u";
});
afterEach(cleanup);
describe("Preferenze delle viste operative", () => {
  it("ripristina le scelte al ritorno senza sostituire gli altri parametri", async () => {
    sessionStorage.setItem(
      "operational-view:u:co:rdo",
      "rdo_vista=elenco&rdo_cerca=rame&rdo_ambito=history&tab=ddt",
    );
    open();
    await waitFor(() =>
      expect(screen.getByTestId("url")).toHaveTextContent("rdo_vista=elenco"),
    );
    expect(screen.getByTestId("url")).toHaveTextContent("tab=offerte");
    expect(screen.getByTestId("url")).toHaveTextContent("rdo_cerca=rame");
    expect(screen.getByRole("button", { name: "Storico 3" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("un URL esplicito prevale sulle preferenze salvate", () => {
    sessionStorage.setItem(
      "operational-view:u:co:rdo",
      "rdo_vista=elenco&rdo_ambito=history",
    );
    open("/?tab=offerte&rdo_ambito=active");
    expect(screen.getByTestId("url")).not.toHaveTextContent("rdo_vista");
    expect(screen.getByRole("button", { name: "Da gestire 2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("isola le scelte per utente e azienda", () => {
    sessionStorage.setItem(
      "operational-view:u:other:rdo",
      "rdo_ambito=history",
    );
    sessionStorage.setItem(
      "operational-view:other:co:rdo",
      "rdo_ambito=history",
    );
    open();
    expect(screen.getByTestId("url")).not.toHaveTextContent("history");
  });
  it("cambiare ambito rimuove lo stato precedente e mantiene gli altri filtri", () => {
    open("/?tab=offerte&rdo_stato=aggiudicata&rdo_cerca=rame");
    fireEvent.click(screen.getByRole("button", { name: "Storico 3" }));
    expect(screen.getByTestId("url")).toHaveTextContent("rdo_ambito=history");
    expect(screen.getByTestId("url")).toHaveTextContent("rdo_cerca=rame");
    expect(screen.getByTestId("url")).not.toHaveTextContent("rdo_stato");
  });
  it("separa storico e lavoro attivo senza perdere la vista completa", () => {
    expect(inOperationalScope(true, "active")).toBe(false);
    expect(inOperationalScope(false, "history")).toBe(false);
    expect(inOperationalScope(true, "history")).toBe(true);
    expect(inOperationalScope(true, "all")).toBe(true);
    expect(inOperationalScope(false, "all")).toBe(true);
  });
});
