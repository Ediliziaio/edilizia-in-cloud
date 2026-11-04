import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RapportinoCompleto } from "@/hooks/useRapportiniMese";

const stato = vi.hoisted(() => ({
  canViewCosts: true,
  isMobile: false,
  isLoading: false,
  isError: false,
  righe: [] as unknown[],
  chiamate: [] as unknown[][],
  refetch: vi.fn(),
  pdf: vi.fn(),
  toastErrore: vi.fn(),
  esporta: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewCosts: stato.canViewCosts }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => stato.isMobile }));
vi.mock("@/lib/campo/workDay", async (orig) => ({ ...(await orig<object>()), campoWorkDay: () => "2026-09-30" }));
vi.mock("@/hooks/useRapportiniMese", () => ({
  useRapportiniMese: (...args: unknown[]) => {
    stato.chiamate.push(args);
    return { data: stato.righe, isLoading: stato.isLoading, isError: stato.isError, isFetching: false, refetch: stato.refetch };
  },
  useNomiFasiCommessa: () => ({ data: new Map() }),
}));
vi.mock("@/lib/campo/rapportinoPdf", () => ({ openRapportinoPdf: stato.pdf }));
vi.mock("@/lib/csvExport", () => ({ exportToCSV: stato.esporta }));
vi.mock("sonner", () => ({ toast: { error: stato.toastErrore } }));
vi.mock("@/components/campo/RapportinoBlocchi", () => ({ RapportinoBlocchi: () => <div>Blocchi del rapportino</div> }));

import RapportiniCommesse from "@/pages/azienda/RapportiniCommesse";

const Indirizzo = () => {
  const l = useLocation();
  return <output data-testid="indirizzo">{l.search}</output>;
};
const apri = (search = "?tab=rapportini") => render(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={[`/azienda/ordini${search}`]}><RapportiniCommesse /><Indirizzo /></MemoryRouter>
  </QueryClientProvider>,
);
const indirizzo = () => screen.getByTestId("indirizzo").textContent ?? "";

const riga = (r: Partial<RapportinoCompleto> & { id: string }): RapportinoCompleto => ({
  order_id: "o1", data_lavoro: "2026-09-02", stato: "approvato", order: { client_name: "Rossi", order_code: "ORD-1" },
  presenze: [{ employee_id: "a", nome: "Anna Blu", ore: 8 }], descrizione_lavori: "Posa guaina", costo_manodopera: 240, ...r,
});

beforeEach(() => {
  stato.canViewCosts = true;
  stato.isMobile = false;
  stato.isLoading = false;
  stato.isError = false;
  stato.chiamate = [];
  stato.pdf.mockReset().mockResolvedValue(undefined);
  stato.toastErrore.mockReset();
  stato.esporta.mockReset();
  stato.righe = [
    riga({ id: "r1" }),
    riga({ id: "r2", order_id: "o2", order: { client_name: "Verdi" }, stato: "inviato", data_lavoro: "2026-09-03", descrizione_lavori: "Getto soletta", presenze: [{ employee_id: "b", nome: "Bruno Neri", ore: 6 }], costo_manodopera: null }),
    riga({ id: "r3", order_id: "o2", order: { client_name: "Verdi" }, stato: "rifiutato", data_lavoro: "2026-09-03", descrizione_lavori: "Doppione", motivo_rifiuto: "Ore sbagliate", costo_manodopera: null }),
  ];
});
afterEach(cleanup);

describe("Commesse → Rapportini", () => {
  it("apre il mese corrente con i numeri del mese, senza contare i rifiutati", () => {
    apri();
    expect(stato.chiamate[0]).toEqual(["c1", "2026-09", true]);
    expect(screen.getByText("Settembre 2026")).toBeInTheDocument();
    const numero = (nome: string) => screen.getByText(nome, { selector: "span.uppercase" }).parentElement!;
    expect(numero("Rapportini")).toHaveTextContent("2");
    expect(within(numero("Ore lavorate")).getByText("14 h")).toBeInTheDocument();
    expect(within(numero("Cantieri")).getByText("2")).toBeInTheDocument();
    expect(within(numero("Giorni lavorati")).getByText("22 feriali")).toBeInTheDocument();
    expect(within(numero("Manodopera")).getByText(/240/)).toBeInTheDocument();
  });

  it("senza il permesso sui costi non chiede né mostra il costo", () => {
    stato.canViewCosts = false;
    apri("?tab=rapportini&rap_vista=cantieri");
    expect(stato.chiamate[0]).toEqual(["c1", "2026-09", false]);
    expect(screen.queryByText("Manodopera")).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Costo" })).not.toBeInTheDocument();
  });

  it("divide giorno per giorno, dal più recente, e il rifiutato si vede", () => {
    apri();
    const titoli = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titoli).toEqual(["Giovedì 3 settembre", "Mercoledì 2 settembre"]);
    expect(screen.getByText("Doppione")).toBeInTheDocument();
    expect(screen.getByText("Rifiutato")).toBeInTheDocument();
  });

  it("cambia mese, e il giorno scelto non resta appeso", () => {
    apri("?tab=rapportini&rap_mese=2026-08&rap_giorno=2026-08-05");
    fireEvent.click(screen.getByRole("button", { name: "Mese precedente" }));
    expect(indirizzo()).toContain("rap_mese=2026-07");
    expect(indirizzo()).not.toContain("rap_giorno");
    expect(indirizzo()).toContain("tab=rapportini");
  });

  it("un mese futuro o scritto male torna al mese corrente, e non si va oltre", () => {
    apri("?tab=rapportini&rap_mese=2030-01");
    expect(stato.chiamate[0][1]).toBe("2026-09");
    expect(screen.getByRole("button", { name: "Mese successivo" })).toBeDisabled();
  });

  it("per cantiere: un clic porta ai rapportini di quel cantiere", () => {
    apri("?tab=rapportini&rap_vista=cantieri");
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: /Rossi/ }));
    expect(indirizzo()).toContain("rap_cantiere=o1");
    expect(indirizzo()).not.toContain("rap_vista");
    expect(screen.getByText("Posa guaina")).toBeInTheDocument();
    expect(screen.queryByText("Getto soletta")).not.toBeInTheDocument();
  });

  it("per persona: ore e giorni di ognuno", () => {
    apri("?tab=rapportini&rap_vista=persone");
    expect(screen.getByRole("button", { name: "Anna Blu" }).closest("tr")).toHaveTextContent("8 h");
    expect(screen.getByRole("button", { name: "Bruno Neri" }).closest("tr")).toHaveTextContent("6 h");
  });

  it("la mappa dice in che cantiere si è lavorato e quando; la cella apre quel giorno", () => {
    apri("?tab=rapportini&rap_vista=mappa");
    const cella = screen.getByRole("button", { name: /Verdi, Giovedì 3 settembre: 6 h/ });
    fireEvent.click(cella);
    expect(indirizzo()).toContain("rap_cantiere=o2");
    expect(indirizzo()).toContain("rap_giorno=2026-09-03");
    expect(screen.getByText("Getto soletta")).toBeInTheDocument();
  });

  it("sul telefono niente mappa: un link salvato ricade sui giorni", () => {
    stato.isMobile = true;
    apri("?tab=rapportini&rap_vista=mappa");
    expect(screen.queryByRole("tab", { name: "Mappa del mese" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Giorno per giorno" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Ore per giorno", { selector: "h2" })).not.toBeInTheDocument();
  });

  it("«Da approvare» filtra quelli da approvare, e si toglie", () => {
    apri();
    fireEvent.click(screen.getByText("Da approvare", { selector: "span.uppercase" }).closest("button")!);
    expect(indirizzo()).toContain("rap_stato=inviato");
    expect(screen.getByText("Getto soletta")).toBeInTheDocument();
    expect(screen.queryByText("Posa guaina")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Togli i filtri" }));
    expect(indirizzo()).not.toContain("rap_stato");
  });

  it("il dettaglio mostra il lavoro e chi c'era, e manda alla commessa per approvare", () => {
    apri();
    fireEvent.click(screen.getByText("Getto soletta").closest("button")!);
    const scheda = screen.getByRole("dialog");
    expect(within(scheda).getByText("Bruno Neri")).toBeInTheDocument();
    expect(within(scheda).getByText("Blocchi del rapportino")).toBeInTheDocument();
    expect(within(scheda).getByRole("link", { name: /Approva dalla commessa/ }))
      .toHaveAttribute("href", "/azienda/ordini/o2?tab=cantiere&vista_cantiere=diario");
  });

  it("il rifiutato mostra il motivo; un rapportino già approvato non invita ad approvare", () => {
    apri("?tab=rapportini&rap_id=r3");
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("Ore sbagliate");
    cleanup();
    apri("?tab=rapportini&rap_id=r1");
    expect(within(screen.getByRole("dialog")).getByRole("link", { name: /Apri la commessa/ })).toBeInTheDocument();
  });

  it("il PDF si scarica dalla riga, senza aprire il dettaglio", async () => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Scarica il PDF: Rossi, Mercoledì 2 settembre" }));
    await waitFor(() => expect(stato.pdf).toHaveBeenCalled());
    expect(stato.pdf.mock.calls[0][0]).toMatchObject({ id: "r1" });
    expect(stato.pdf.mock.calls[0][1]).toBe("o1");
    expect(indirizzo()).not.toContain("rap_id");
  });

  it("il PDF si scarica anche dal dettaglio; se fallisce lo dice", async () => {
    stato.pdf.mockRejectedValue(new Error("PDF non generato"));
    apri("?tab=rapportini&rap_id=r2");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Scarica PDF" }));
    await waitFor(() => expect(stato.toastErrore).toHaveBeenCalledWith("PDF non generato"));
    expect(stato.pdf.mock.calls[0][0]).toMatchObject({ id: "r2" });
  });

  it("esporta quello che vedi, e il costo solo a chi può vederlo", () => {
    stato.canViewCosts = false;
    apri("?tab=rapportini&rap_cantiere=o1");
    fireEvent.click(screen.getByRole("button", { name: "Esporta" }));
    const [righe, colonne, nome] = stato.esporta.mock.calls[0];
    expect(righe).toHaveLength(1);
    expect(righe[0]).not.toHaveProperty("costo");
    expect(colonne.map((c: { key: string }) => c.key)).not.toContain("costo");
    expect(nome).toBe("rapportini-2026-09.csv");
  });

  it("mese vuoto: lo dice e propone il mese prima", () => {
    stato.righe = [];
    apri();
    expect(screen.getByText("Nessun rapportino a settembre 2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Vai ad agosto 2026" }));
    expect(indirizzo()).toContain("rap_mese=2026-08");
  });

  it("errore di lettura: niente numeri finti, e si può riprovare", () => {
    stato.isError = true;
    stato.righe = [];
    apri();
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a leggere i rapportini");
    expect(screen.queryByText("Ore lavorate")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(stato.refetch).toHaveBeenCalled();
  });
});
