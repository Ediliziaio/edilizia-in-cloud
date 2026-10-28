import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { normalizzaMezzoFonte } from "../../../supabase/functions/_shared/posMezzi";
import {
  normalizzaDocumentoMezzo,
  normalizzaControlliMezzo,
} from "../../../supabase/functions/_shared/posDocumentiMezzi";
const s = vi.hoisted(() => ({
  allowed: true,
  fleet: false,
  error: false,
  docError: false,
  fetching: false,
  empty: false,
  open: vi.fn(),
  refresh: vi.fn(),
  mezzi: vi.fn(),
  documenti: vi.fn(),
}));
const fonte = normalizzaMezzoFonte({
  mezzo_id: "m1",
  fonte_id: "a1",
  order_id: "c1",
  nome: "Trapano DEMO",
  codice: "T-1",
  stato: "in_servizio",
  fonte_tipo: "assegnazione",
  dal: "2026-11-09",
  al: "2026-11-13",
});
const documento = normalizzaDocumentoMezzo({
  id: "d1",
  mezzo_id: "m1",
  categoria: "manuale_ce",
  titolo: "Manuale DEMO",
  disponibile: true,
  file_name: "manuale.pdf",
  data_scadenza: "2026-11-08",
});
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewSicurezzaCantiere: s.allowed,
    canViewMezzi: s.fleet,
  }),
}));
vi.mock("@/hooks/useMezziPos", () => ({
  useMezziPos: (...a: unknown[]) => {
    s.mezzi(...a);
    return {
      data: { fonti: s.empty ? [] : [fonte] },
      isError: s.error,
      isFetching: s.fetching,
      isLoading: false,
      refetch: s.refresh,
    };
  },
}));
vi.mock("@/hooks/useDocumentiMezziPos", () => ({
  useDocumentiMezzoPos: (...a: unknown[]) => {
    s.documenti(...a);
    return {
      data: {
        documenti: [documento],
        controlli: normalizzaControlliMezzo({
          mezzo_id: "m1",
          manutenzioni: [],
          segnalazioni: [{ id: "s1", stato: "aperta" }],
        }),
      },
      isError: s.docError,
      isFetching: false,
      isLoading: false,
      refetch: s.refresh,
    };
  },
  apriDocumentoMezzoPos: s.open,
}));
import { AttrezzatureCommessa } from "@/components/sicurezza/AttrezzatureCommessa";
const mostra = (data = "2026-11-10") =>
  render(
    <MemoryRouter>
      <AttrezzatureCommessa
        companyId="az"
        orderId="c1"
        dataRiferimento={data}
        faseRiferimento="f1"
      />
    </MemoryRouter>,
  );
const apri = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "Consulta attrezzature" }),
  );
afterEach(cleanup);
beforeEach(() => {
  Object.assign(s, {
    allowed: true,
    fleet: false,
    error: false,
    docError: false,
    fetching: false,
    empty: false,
  });
  vi.clearAllMocks();
  s.open.mockResolvedValue(undefined);
});
describe("Attrezzature e documenti nella commessa", () => {
  it("carica su richiesta e legge documenti solo per la macchina selezionata", () => {
    mostra();
    expect(s.mezzi).toHaveBeenLastCalledWith("az", "c1", false);
    apri();
    expect(s.mezzi).toHaveBeenLastCalledWith("az", "c1", true);
    expect(s.documenti).toHaveBeenLastCalledWith("az", "c1", null, false);
    fireEvent.click(screen.getByRole("button", { name: /Trapano DEMO/ }));
    expect(s.documenti).toHaveBeenLastCalledWith("az", "c1", "m1", true);
    expect(screen.getByText("Scaduto alla data scelta")).toBeInTheDocument();
    expect(screen.getByText(/segnalazioni da riesaminare/)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Scheda inventario" }),
    ).not.toBeInTheDocument();
  });
  it("apre l’originale attraverso il lettore autorizzato e gestisce la fonte cambiata", async () => {
    s.open.mockRejectedValue(new Error("Fonte cambiata"));
    mostra();
    apri();
    fireEvent.click(screen.getByRole("button", { name: /Trapano DEMO/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Apri originale Manuale DEMO" }),
    );
    await waitFor(() =>
      expect(s.open).toHaveBeenCalledWith("az", "c1", documento),
    );
  });
  it("non presenta errori di inventario come assenza di mezzi", () => {
    s.error = true;
    mostra();
    apri();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "l’errore non indica assenza",
    );
    expect(
      screen.queryByText("Nessuna attrezzatura restituita"),
    ).not.toBeInTheDocument();
  });
  it("non mostra documenti memorizzati quando il lettore va in errore", () => {
    s.docError = true;
    mostra();
    apri();
    fireEvent.click(screen.getByRole("button", { name: /Trapano DEMO/ }));
    expect(screen.queryByText("Manuale DEMO")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Documenti e controlli non disponibili",
    );
  });
  it("cambiando data esclude il mezzo fuori periodo e disabilita la lettura dei suoi documenti", () => {
    const v = mostra();
    apri();
    fireEvent.click(screen.getByRole("button", { name: /Trapano DEMO/ }));
    v.rerender(
      <MemoryRouter>
        <AttrezzatureCommessa
          companyId="az"
          orderId="c1"
          dataRiferimento="2026-11-14"
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Manuale DEMO")).not.toBeInTheDocument();
    expect(s.documenti).toHaveBeenLastCalledWith("az", "c1", null, false);
  });
  it("non ricava una fase dall’assegnazione e offre la scheda solo con permesso mezzi", () => {
    s.fleet = true;
    mostra();
    apri();
    fireEvent.click(screen.getByRole("button", { name: /Trapano DEMO/ }));
    expect(
      screen.getByText(/il filtro fase non ne prova l’impiego/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Scheda inventario" }),
    ).toHaveAttribute("href", "/azienda/mezzi/m1");
  });
  it("non propone la vista senza il permesso sicurezza", () => {
    s.allowed = false;
    mostra();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

it("nel popup mostra subito le attrezzature senza un secondo clic", () => {
  render(
    <MemoryRouter>
      <AttrezzatureCommessa
        companyId="az"
        orderId="c1"
        dataRiferimento="2026-11-10"
        inizialmenteAperto
      />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("button", { name: /Trapano DEMO/ }),
  ).toBeInTheDocument();
  expect(s.mezzi).toHaveBeenLastCalledWith("az", "c1", true);
});
