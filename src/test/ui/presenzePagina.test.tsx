import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { GiornataWithProfilo } from "@/hooks/useGiornate";
import type { DailyHoursController } from "@/hooks/useDailyHours";
const state = vi.hoisted(() => ({
  rows: [] as GiornataWithProfilo[],
  loading: false,
  error: false,
  refetch: vi.fn(),
  query: vi.fn(),
}));
vi.mock("@/hooks/useGiornate", () => ({
  useGiornate: (from: string, to: string) => {
    state.query(from, to);
    return {
      data: state.rows,
      isLoading: state.loading,
      isError: state.error,
      refetch: state.refetch,
    };
  },
}));
vi.mock("@/hooks/useOperai", () => ({ oggiRoma: () => "2026-10-26" }));
vi.mock("@/components/personale/DailyHoursPanel", () => ({
  DailyHoursPanel: ({ month }: { month: string }) => (
    <section aria-label="Registro ore mock">Registro ore {month}</section>
  ),
}));
import { TabPresenze } from "@/pages/azienda/personale/tabs/TabPresenze";
import { DailyHoursLedger } from "@/components/personale/DailyHoursLedger";
const giornata = (id: string, extra = {}): GiornataWithProfilo =>
  ({
    id,
    profilo_id: id,
    data: "2026-10-05",
    profilo_nome: "Anna",
    profilo_cognome: "Rossi",
    profilo_reparto: "Ufficio",
    stato: "presente",
    ore_lavorate: 7.5,
    anomalia: false,
    prima_entrata: "08:00:00",
    ultima_uscita: "16:00:00",
    ...extra,
  }) as GiornataWithProfilo;
function Url() {
  return <output data-testid="url">{useLocation().search}</output>;
}
function mount(url = "/azienda/personale?tab=presenze") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <TabPresenze />
      <Url />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  state.rows = [
    giornata("1"),
    giornata("2", {
      profilo_nome: "Luca",
      profilo_reparto: "Cantiere",
      stato: "non_lavorativo",
      ore_lavorate: 0,
    }),
    giornata("3", {
      profilo_nome: "Carla",
      data: "2026-10-06",
      stato: "ferie",
      ore_lavorate: 0,
      anomalia: true,
      anomalia_motivo: "Controllare giustificativo",
    }),
  ];
  state.loading = false;
  state.error = false;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("pagina presenze: una vista alla volta", () => {
  it("starts with the calendar and does not mount the huge site ledger", () => {
    mount();
    expect(
      screen.getByRole("region", { name: "Calendario presenze HR" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Registro ore mock" }),
    ).toBeNull();
    expect(state.query).toHaveBeenCalledWith("2026-10-01", "2026-10-31");
    expect(screen.queryByText("?")).toBeNull();
    expect(screen.getByText("1 · Non lavorativo")).toBeInTheDocument();
  });
  it("switches views with the same month and preserves existing URL parameters", () => {
    mount("/azienda/personale?tab=presenze&mese=2026-12&keep=yes");
    fireEvent.click(screen.getByRole("button", { name: "Mese successivo" }));
    fireEvent.click(screen.getByRole("button", { name: "Ore per cantiere" }));
    expect(
      screen.getByRole("region", { name: "Registro ore mock" }),
    ).toHaveTextContent("2027-01");
    expect(
      screen.queryByRole("region", { name: "Calendario presenze HR" }),
    ).toBeNull();
    expect(screen.getByTestId("url")).toHaveTextContent("keep=yes");
    expect(
      screen.getByRole("button", { name: "Ore per cantiere" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Questo mese" }));
    expect(screen.getByLabelText("Mese delle presenze")).toHaveValue("2026-10");
  });
  it("accepts direct site-ledger links and safely defaults invalid view/month", () => {
    const view = mount(
      "/azienda/personale?tab=presenze&vista_presenze=cantieri&mese=2026-02",
    );
    expect(state.query).not.toHaveBeenCalled();
    expect(
      screen.getByRole("region", { name: "Registro ore mock" }),
    ).toHaveTextContent("2026-02");
    view.unmount();
    mount(
      "/azienda/personale?tab=presenze&vista_presenze=unknown&mese=2026-13",
    );
    expect(screen.getByLabelText("Mese delle presenze")).toHaveValue("2026-10");
    expect(
      screen.getByRole("button", { name: "Calendario HR" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
  it("combines search and department filters and resets the results", () => {
    mount();
    fireEvent.change(screen.getByLabelText("Cerca persona o mansione"), {
      target: { value: "anna" },
    });
    fireEvent.change(screen.getByLabelText("Reparto presenze"), {
      target: { value: "Cantiere" },
    });
    expect(
      screen.getByText("Nessuna presenza corrisponde ai filtri selezionati."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Azzera filtri" }));
    expect(screen.getByText(/3 giornate registrate/)).toBeInTheDocument();
  });
  it("shows anomaly details and full names in a read-only drawer", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Solo anomalie" }));
    fireEvent.click(
      screen.getByRole("button", { name: /martedì 6 ottobre: 1 presenza/ }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Carla Rossi")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Controllare giustificativo"),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: /Salva|Approva/ }),
    ).toBeNull();
  });
  it("shows network errors instead of a misleading zero-month", () => {
    state.error = true;
    state.rows = [];
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Impossibile caricare le presenze",
    );
    expect(screen.queryByText("Giornate lavorate")).toBeNull();
    expect(screen.queryByText(/Nessuna presenza HR registrata/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
  it("distinguishes loading from an actually empty month", () => {
    state.loading = true;
    const view = mount();
    expect(screen.getByText("Caricamento delle presenze…")).toBeInTheDocument();
    expect(screen.queryByText("Giornate lavorate")).toBeNull();
    view.unmount();
    state.loading = false;
    state.rows = [];
    mount();
    expect(
      screen.getByText(/Nessuna presenza HR registrata/),
    ).toBeInTheDocument();
  });
});

function controller(): DailyHoursController {
  const people = Array.from({ length: 31 }, (_, i) => ({
    id: `p${i}`,
    name: `Persona ${String(i).padStart(2, "0")}`,
  }));
  return {
    canEdit: true,
    showCosts: true,
    data: {
      people,
      orders: [{ id: "job", name: "Cantiere centro" }],
      activePeople: people,
      lines: people.map((p, i) => ({
        key: p.id,
        reportId: `r${i}`,
        employeeId: p.id,
        orderId: "job",
        hours: 7.5,
        cost: i ? 150 : null,
        pending: i === 0,
        office: i === 1,
        day: "2026-10-05",
        updatedAt: "now",
        note: "Una nota lunga da consultare solo quando serve.",
      })),
    },
  } as DailyHoursController;
}
describe("registro ore compatto", () => {
  it("paginates 31 rows and resets to page one after filtering", () => {
    render(
      <DailyHoursLedger
        controller={controller()}
        onCancel={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getAllByRole("row")).toHaveLength(16);
    expect(screen.getByText("1–15 di 31 registrazioni")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Pagina successiva delle ore" }),
    );
    expect(screen.getByText("16–30 di 31 registrazioni")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Cerca nelle ore di cantiere"), {
      target: { value: "Persona 30" },
    });
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByText("1–1 di 1 registrazioni")).toBeInTheDocument();
    expect(
      screen.getByRole("rowheader", { name: "Persona 30" }),
    ).toBeInTheDocument();
  });
  it("filters pending and unpriced entries and keeps the notes collapsed", () => {
    render(
      <DailyHoursLedger
        controller={controller()}
        onCancel={vi.fn()}
        busy={false}
      />,
    );
    fireEvent.change(screen.getByLabelText("Stato delle ore"), {
      target: { value: "pending" },
    });
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(
      screen.getByText("Note della registrazione").closest("details"),
    ).not.toHaveAttribute("open");
    fireEvent.change(screen.getByLabelText("Stato delle ore"), {
      target: { value: "unpriced" },
    });
    expect(screen.getAllByRole("row")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Azzera filtri" }));
    expect(screen.getAllByRole("row")).toHaveLength(16);
  });
  it("never exposes costs or destructive controls without the respective permissions", () => {
    const c = controller();
    c.showCosts = false;
    c.canEdit = false;
    render(<DailyHoursLedger controller={c} onCancel={vi.fn()} busy={false} />);
    expect(screen.queryByRole("columnheader", { name: "Costo" })).toBeNull();
    expect(screen.queryByText(/150,00/)).toBeNull();
    expect(screen.queryByRole("option", { name: "Da valorizzare" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Annulla registrazione" }),
    ).toBeNull();
  });
  it("only requests cancellation and preserves the link to the correct report", () => {
    const onCancel = vi.fn();
    render(
      <DailyHoursLedger
        controller={controller()}
        onCancel={onCancel}
        busy={false}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Annulla registrazione" }),
    );
    expect(onCancel).toHaveBeenCalledWith("r1");
    expect(
      screen.getAllByRole("link", { name: "Apri rapportini" })[0],
    ).toHaveAttribute(
      "href",
      "/azienda/ordini/job?tab=cantiere&vista_cantiere=diario#section-rapportini",
    );
  });
  it("shows no-results feedback and clamps pagination when data shrinks", () => {
    const c = controller();
    const view = render(
      <DailyHoursLedger controller={c} onCancel={vi.fn()} busy={false} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Pagina successiva delle ore" }),
    );
    view.rerender(
      <DailyHoursLedger
        controller={{
          ...c,
          data: { ...c.data!, lines: c.data!.lines.slice(0, 1) },
        }}
        onCancel={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByText("1–1 di 1 registrazioni")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Cerca nelle ore di cantiere"), {
      target: { value: "non esiste" },
    });
    expect(
      screen.getByText(
        "Nessuna registrazione corrisponde ai filtri selezionati.",
      ),
    ).toBeInTheDocument();
  });
});
