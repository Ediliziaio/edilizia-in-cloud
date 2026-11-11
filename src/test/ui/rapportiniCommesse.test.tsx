import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RapportinoCompleto } from "@/hooks/useRapportiniMese";
import type { GiornaleRiga } from "@/lib/orders/documentiCantiere";

const stato = vi.hoisted(() => ({
  ruolo: undefined as string | undefined,
  canViewCosts: true,
  canViewGiornale: false,
  featureEnabled: true,
  scopri: false,
  giornali: [] as unknown[],
  erroreGiornali: false,
  chiamateGiornali: [] as unknown[][],
  refetchGiornali: vi.fn(),
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

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" }, role: stato.ruolo, user: { id: "ufficio" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewCosts: stato.canViewCosts, canEditOrders: !!stato.ruolo, canViewGiornaleLavori: stato.canViewGiornale }) }));
vi.mock("@/hooks/useFeatureAccess", () => ({ useFeatureAccess: () => ({ isEnabled: stato.featureEnabled, isPreview: false }) }));
vi.mock("@/hooks/useSubscriptionLimits", () => ({ useSubscriptionLimits: () => ({ isScopriPlan: stato.scopri }) }));
vi.mock("@/hooks/useGiornaliPeriodo", () => ({ useGiornaliPeriodo: (...args: unknown[]) => {
  stato.chiamateGiornali.push(args);
  return { data: stato.giornali, isLoading: false, isError: stato.erroreGiornali, isFetching: false, refetch: stato.refetchGiornali };
} }));
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
vi.mock("@/components/orders/LaborApprovalDialog", () => ({ LaborApprovalDialog: (p: { reportId: string; onReject?: () => void }) => <div role="dialog">Controllo di {p.reportId}<button onClick={p.onReject}>Rifiuta</button></div> }));
vi.mock("@/components/campo/RapportinoBlocchi", () => ({ RapportinoBlocchi: () => <div>Blocchi del rapportino</div> }));

import RapportiniCommesse from "@/pages/azienda/RapportiniCommesse";

const Indirizzo = () => {
  const l = useLocation();
  return <output data-testid="indirizzo">{l.search}</output>;
};
const apri = (search = "?tab=rapportini&rap_vista=giorni", mensile = true) => render(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={[`/azienda/ordini${search}${mensile && !search.includes("rap_periodo=") ? "&rap_periodo=mese" : ""}`]}><RapportiniCommesse /><Indirizzo /></MemoryRouter>
  </QueryClientProvider>,
);
const indirizzo = () => screen.getByTestId("indirizzo").textContent ?? "";

const riga = (r: Partial<RapportinoCompleto> & { id: string }): RapportinoCompleto => ({
  order_id: "o1", data_lavoro: "2026-09-02", stato: "approvato", order: { client_name: "Rossi", order_code: "ORD-1" },
  presenze: [{ employee_id: "a", nome: "Anna Blu", ore: 8 }], descrizione_lavori: "Posa guaina", costo_manodopera: 240, ...r,
});

beforeEach(() => {
  stato.ruolo = undefined;
  stato.canViewCosts = true;
  stato.canViewGiornale = false;
  stato.featureEnabled = true;
  stato.scopri = false;
  stato.giornali = [];
  stato.erroreGiornali = false;
  stato.chiamateGiornali = [];
  stato.refetchGiornali.mockReset();
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

  it("sul telefono niente mappa: un link salvato ricade sull’elenco", () => {
    stato.isMobile = true;
    apri("?tab=rapportini&rap_vista=mappa");
    expect(screen.queryByRole("tab", { name: "Mappa del mese" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Elenco" })).toHaveAttribute("aria-selected", "true");
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

  it("senza il permesso di approvare il popup mostra il lavoro e porta alla commessa", () => {
    apri();
    fireEvent.click(screen.getByText("Getto soletta").closest("button")!);
    const scheda = screen.getByRole("dialog");
    expect(within(scheda).getByText("Bruno Neri")).toBeInTheDocument();
    expect(within(scheda).getByText("Blocchi del rapportino")).toBeInTheDocument();
    expect(within(scheda).getByRole("link", { name: /Apri la commessa/ }))
      .toHaveAttribute("href", "/azienda/ordini/o2?tab=cantiere&vista_cantiere=diario");
  });

  it("chi approva apre un popup solo, con il controllo e il rifiuto", () => {
    stato.ruolo = "company_admin";
    apri();
    fireEvent.click(screen.getByText("Getto soletta").closest("button")!);
    expect(screen.getByRole("dialog")).toHaveTextContent("Controllo di");
    expect(screen.queryByRole("link", { name: /Apri la commessa/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rifiuta" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Rifiuta rapportino");
    stato.ruolo = undefined;
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

  it("se il PDF non si genera lo dice", async () => {
    stato.pdf.mockRejectedValue(new Error("PDF non generato"));
    apri("?tab=rapportini");
    fireEvent.click(screen.getAllByRole("button", { name: /Scarica il PDF: Verdi/ })[0]);
    await waitFor(() => expect(stato.toastErrore).toHaveBeenCalledWith("PDF non generato"));
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
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a leggere tutti i documenti");
    expect(screen.queryByText("Ore lavorate")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(stato.refetch).toHaveBeenCalled();
  });
});


describe("Navigazione e filtri dei rapportini", () => {
  it("rimuove un singolo filtro mantenendo gli altri", () => {
    apri("?tab=rapportini&rap_cantiere=o2&rap_stato=inviato");
    fireEvent.click(screen.getByRole("button", { name: "Togli filtro: Da approvare" }));
    expect(indirizzo()).toContain("rap_cantiere=o2");
    expect(indirizzo()).not.toContain("rap_stato");
    expect(screen.getByText("Doppione")).toBeInTheDocument();
  });

  it("sfoglia soltanto i rapportini dell'elenco filtrato", () => {
    apri("?tab=rapportini&rap_cantiere=o2&rap_id=r2");
    expect(screen.getByRole("button", { name: "Precedente" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Successivo" }));
    expect(indirizzo()).toContain("rap_id=r3");
    expect(screen.getByText("Ore sbagliate")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Successivo" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Precedente" }));
    expect(indirizzo()).toContain("rap_id=r2");
  });
});


describe("Rapportini: elenco compatto e periodi", () => {
  it("cambiare raggruppamento non cambia il periodo scelto", () => {
    apri("?tab=rapportini", false);
    fireEvent.click(screen.getByRole("tab", { name: "Per giorno" }));
    expect(stato.chiamate.at(-1)?.[1]).toEqual({});
    expect(screen.queryByRole("button", { name: "Mese precedente" })).not.toBeInTheDocument();
  });
  it("Questo mese rimane sul mese anche partendo da un vecchio collegamento", () => {
    apri("?tab=rapportini&rap_mese=2026-08", false);
    fireEvent.click(screen.getByRole("button", { name: "Questo mese" }));
    expect(stato.chiamate.at(-1)?.[1]).toBe("2026-09");
    expect(indirizzo()).toContain("rap_periodo=mese");
  });
  it("apre tutti i rapportini in tabella, una riga per documento e stato nella seconda colonna", () => {
    apri("?tab=rapportini", false);
    expect(stato.chiamate[0]).toEqual(["c1", {}, true]);
    expect(screen.getByRole("tab", { name: "Elenco" })).toHaveAttribute("aria-selected", "true");
    const tabella = screen.getByRole("table", { name: "Elenco rapportini" });
    expect(within(tabella).getAllByRole("row")).toHaveLength(4);
    expect(within(tabella).getAllByRole("columnheader")[1]).toHaveTextContent("Stato");
    expect(within(tabella).getByText("Posa guaina")).toHaveAttribute("title", "Posa guaina");
    expect(screen.queryByRole("button", { name: "Mese precedente" })).not.toBeInTheDocument();
  });
  it("un intervallo personalizzato incompleto non legge tutta la storia per errore", () => {
    apri("?tab=rapportini&rap_periodo=personalizzato&rap_da=2026-09-03&rap_a=2026-09-01", false);
    expect(stato.chiamate[0][1]).toBeNull();
    expect(screen.getByText(/data finale deve essere/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  it("legge un intervallo che attraversa due mesi", () => {
    apri("?tab=rapportini&rap_periodo=personalizzato&rap_da=2026-08-20&rap_a=2026-09-30", false);
    expect(stato.chiamate[0][1]).toEqual({ da: "2026-08-20", a: "2026-09-30" });
  });
  it("l’elenco mantiene il dettaglio apribile e l’esportazione su tutti i periodi", () => {
    apri("?tab=rapportini", false);
    fireEvent.click(within(screen.getByText("Getto soletta").closest("tr")!).getByRole("button", { name: /Apri rapportino:/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

const scegliDocumento = (etichetta: string, opzione: string) => {
  fireEvent.keyDown(screen.getByRole("combobox", { name: etichetta }), { key: "Enter" });
  fireEvent.click(screen.getByRole("option", { name: opzione }));
};

describe("giornali e rapportini nell'elenco comune", () => {
  beforeEach(() => {
    stato.canViewGiornale = true;
    stato.giornali = [
      { id: "g1", order_id: "o1", data_lavori: "2026-09-02", stato: "bozza", lavorazioni_eseguite: "Diario posa guaina", personale_presente: 3, order: { client_name: "Rossi", order_code: "ORD-1" }, giornale_foto: [{ id: "foto1" }] },
      { id: "g2", order_id: "o3", data_lavori: "2026-09-04", stato: "firmata", lavorazioni_eseguite: "Diario sopralluogo tetto", personale_presente: 2, order: { client_name: "Cantiere del solo giornale", order_code: "ORD-3" } },
    ] satisfies GiornaleRiga[];
  });
  it("apre tutti i documenti in una riga ciascuno, con stato e tipo distinti", () => {
    apri("?tab=rapportini", false);
    const tabella = screen.getByRole("table", { name: "Elenco rapportini" });
    expect(within(tabella).getAllByRole("row")).toHaveLength(6);
    expect(within(tabella).getAllByRole("columnheader").map((n) => n.textContent).slice(0, 3)).toEqual(["Data", "Stato", "Tipo"]);
    expect(within(tabella).getAllByRole("row")[1]).toHaveTextContent("Diario sopralluogo tetto");
    expect(screen.getByText("Firmata")).toBeInTheDocument();
    expect(stato.chiamateGiornali[0]).toEqual(["c1", {}, true]);
    const card = screen.getByText("Ore lavorate", { selector: "span.uppercase" }).parentElement!;
    expect(within(card).getByText("14 h")).toBeInTheDocument();
    expect(screen.getByText("Documenti", { selector: "span.uppercase" }).parentElement).toHaveTextContent("5");
  });
  it("i collegamenti portano alla pagina esatta del giornale", () => {
    apri("?tab=rapportini", false);
    expect(screen.getByRole("link", { name: /Apri giornale lavori: Cantiere del solo giornale/ })).toHaveAttribute("href", "/azienda/giornale-lavori?ordine=o3&pagina=g2");
    expect(screen.getByText("Diario sopralluogo tetto")).toHaveAttribute("title", "Diario sopralluogo tetto");
  });
  it("i soli giornali mantengono il periodo senza leggere o sommare i rapportini", () => {
    apri("?tab=rapportini&rap_tipo=giornale&rap_periodo=personalizzato&rap_da=2026-09-01&rap_a=2026-11-11", false);
    expect(stato.chiamate[0][1]).toBeNull();
    expect(stato.chiamateGiornali[0]).toEqual(["c1", { da: "2026-09-01", a: "2026-11-11" }, true]);
    expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(2);
    expect(screen.queryByText("Ore lavorate")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crea documento PDF" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Persona" })).not.toBeInTheDocument();
    expect(screen.getByText("Da firmare", { selector: "span.uppercase" }).parentElement).toHaveTextContent("1");
  });
  it("cambiare tipo azzera solo i filtri incompatibili e mantiene date e cantiere", () => {
    apri("?tab=rapportini&rap_tipo=rapportino&rap_vista=persone&rap_persona=e:a&rap_stato=approvato&rap_cantiere=o1&rap_periodo=mese&rap_mese=2026-09", false);
    scegliDocumento("Tipo documento", "Giornali lavori");
    expect(indirizzo()).toContain("rap_tipo=giornale");
    expect(indirizzo()).toContain("rap_cantiere=o1");
    expect(indirizzo()).toContain("rap_mese=2026-09");
    expect(indirizzo()).not.toMatch(/rap_persona|rap_stato|rap_vista/);
    expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(1);
    expect(screen.getByText("Diario posa guaina")).toBeInTheDocument();
  });
  it("firmata filtra i giornali senza scambiare la firma con l'approvazione", () => {
    apri("?tab=rapportini&rap_stato=firmata", false);
    expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(1);
    expect(screen.getByText("Diario sopralluogo tetto")).toBeInTheDocument();
    expect(screen.queryByText("Posa guaina")).not.toBeInTheDocument();
  });
  it("un errore dei giornali non mostra totali parziali; si può passare ai rapportini", () => {
    stato.erroreGiornali = true;
    apri("?tab=rapportini", false);
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a leggere tutti i documenti");
    expect(screen.queryByText("Ore lavorate")).not.toBeInTheDocument();
    scegliDocumento("Tipo documento", "Rapportini");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(3);
  });
  it("l'export di tutti i documenti mantiene i giornali ma non duplica ore e costi", () => {
    apri("?tab=rapportini", false);
    fireEvent.click(screen.getByRole("button", { name: "Esporta" }));
    const [righe] = stato.esporta.mock.calls[0];
    expect(righe).toHaveLength(5);
    expect(righe.filter((r: { tipo: string }) => r.tipo === "Giornale lavori").every((r: { ore: string }) => r.ore === "")).toBe(true);
    expect(righe.every((r: object) => !("costo" in r))).toBe(true);
  });
  it.each(["permesso", "funzione", "piano"])("non legge né mostra giornali senza accesso: %s", (blocco) => {
    if (blocco === "permesso") stato.canViewGiornale = false;
    if (blocco === "funzione") stato.featureEnabled = false;
    if (blocco === "piano") stato.scopri = true;
    apri("?tab=rapportini&rap_tipo=giornale", false);
    expect(stato.chiamateGiornali[0][2]).toBe(false);
    expect(screen.queryByRole("combobox", { name: "Tipo documento" })).not.toBeInTheDocument();
    expect(screen.queryByText("Diario posa guaina")).not.toBeInTheDocument();
    expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(3);
  });
});
