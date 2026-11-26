/**
 * «Il gestionale mi ha buttata fuori per qualche minuto, appena mi ha ridato l'accesso avevo
 * delle fatture non ancora inviate a SDI, non ci sono più perché?» (26/11/2026, Impresa Vulcano).
 *
 * Le fatture erano tutte al loro posto: l'elenco si era riaperto sul **Cestino**. Dal 26/11 i
 * filtri di un elenco si ricordano, e fra questi c'era anche la linguetta: chi apre i documenti
 * eliminati ci resta dentro, e da quel momento l'elenco si riapre sempre lì — anche dopo essere
 * usciti e rientrati, perché la memoria è della scheda del browser e l'uscita non la svuota.
 *
 * Un cestino non è un filtro di lavoro: si ricorda, ma non si rimette.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { useOperationalViewMemory } from "@/hooks/useOperationalViewMemory";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u" }, effectiveCompany: { id: "co" } }),
}));

function Elenco() {
  useOperationalViewMemory("emesse", ["tipo", "stato"], { nonRipristinare: { tipo: ["annullate"] } });
  const [params] = useSearchParams();
  return <output data-testid="url">{params.toString()}</output>;
}

const apri = (url: string) => render(
  <MemoryRouter initialEntries={[url]}><Elenco /></MemoryRouter>,
);

beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

describe("la memoria dell'elenco non riapre il cestino", () => {
  it("dopo essere stati nel cestino, l'elenco si riapre sulle fatture", async () => {
    apri("/?tipo=annullate");
    await waitFor(() => expect(sessionStorage.getItem("operational-view:u:co:emesse")).toContain("annullate"));
    cleanup();

    apri("/");
    await waitFor(() => expect(screen.getByTestId("url").textContent).toBe(""));
  });

  it("gli altri filtri si rimettono come prima", async () => {
    apri("/?tipo=annullate&stato=bozza");
    await waitFor(() => expect(sessionStorage.getItem("operational-view:u:co:emesse")).toContain("stato=bozza"));
    cleanup();

    apri("/");
    await waitFor(() => expect(screen.getByTestId("url").textContent).toBe("stato=bozza"));
  });

  it("il cestino chiesto nell'indirizzo si apre: è una scelta, non una memoria", async () => {
    apri("/?tipo=annullate");
    await waitFor(() => expect(screen.getByTestId("url").textContent).toBe("tipo=annullate"));
  });
});
