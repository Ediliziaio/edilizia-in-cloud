import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FaseOperazione, RapportinoCronoprogrammaOperazione } from "@/hooks/useMovimentiOperazione";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { CronoprogrammaOperazione } from "@/components/orders/generali/moduli/CronoprogrammaOperazione";

const mock = vi.hoisted(() => ({ mobile: false, ditte: vi.fn() }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => mock.mobile }));
vi.mock("@/hooks/useMovimentiOperazione", () => ({ useDitteFaseOperazione: mock.ditte }));

const riepilogo = {
  generale: { id: "g", codice: "GEN-001", nome: "Via del Parco" },
  figlie: [{ id: "a", codice: "C-01", nome: "Edificio A" }, { id: "b", codice: "C-02", nome: "Edificio B" }],
} as RiepilogoGenerale;

const fasi: FaseOperazione[] = [
  { id: "f1", order_id: "a", name: "Fondazioni", status: "in_corso", percentuale: 75, start_date: "2026-11-02", end_date: "2026-12-18", completata_il: null, position: 0 },
  { id: "f2", order_id: "a", name: "Impermeabilizzazione", status: "in_corso", percentuale: 60, start_date: "2026-11-04", end_date: "2026-11-20", completata_il: null, position: 1 },
  { id: "f3", order_id: "b", name: "Installazione", status: "da_iniziare", percentuale: 0, start_date: "2026-11-27", end_date: "2026-12-07", completata_il: null, position: 0 },
  { id: "f4", order_id: "b", name: "Collaudo", status: "da_iniziare", percentuale: 0, start_date: null, end_date: null, completata_il: null, position: 1 },
  { id: "f5", order_id: "g", name: "Allestimento", status: "completata", percentuale: 100, start_date: "2026-11-01", end_date: "2026-11-10", completata_il: "2026-11-12", position: 0 },
];
const rapportini: RapportinoCronoprogrammaOperazione[] = [
  { id: "r-inizio", order_id: "a", stato: "inviato", data_lavoro: "2026-11-20", fasi_lavorate: [{ phase_id: "f1", ore: 8 }] },
  { id: "r-ultimo", order_id: "a", stato: "approvato", data_lavoro: "2026-11-21", fasi_lavorate: [{ phase_id: "f1", ore: 5 }] },
  { id: "r-altra", order_id: "b", stato: "inviato", data_lavoro: "2026-11-22", fasi_lavorate: [{ phase_id: "f3", ore: 3 }] },
];

beforeEach(() => {
  vi.setSystemTime(new Date(2026, 10, 23, 12));
  mock.mobile = false;
  mock.ditte.mockReset().mockReturnValue({ data: ["Ditta Strutture Demo"] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function mostra(indirizzo = "/") {
  const apri = vi.fn();
  const apriRapportino = vi.fn();
  render(<MemoryRouter initialEntries={[indirizzo]}>
    <CronoprogrammaOperazione riepilogo={riepilogo} fasi={fasi} rapportini={rapportini} onApri={apri} onApriRapportino={apriRapportino}
      edificioPerCommessa={new Map([["a", "Palazzina A"], ["b", "Palazzina B"]])} />
  </MemoryRouter>);
  return { apri, apriRapportino };
}

it("distingue avvii tardivi, scadenze superate, fasi in scadenza e date mancanti", () => {
  mostra();
  const grafico = within(screen.getByRole("region", { name: "Grafico delle fasi per commessa" }));
  const filtri = within(screen.getByRole("group", { name: "Filtra le fasi del cronoprogramma" }));
  expect(grafico.getByRole("button", { name: /Fondazioni.*Avvio \+18 gg/ })).toBeInTheDocument();
  expect(grafico.getByRole("button", { name: /Impermeabilizzazione.*Fine \+3 gg.*Avvio non registrato/ })).toBeInTheDocument();
  expect(grafico.getByRole("img", { name: /Registrato 20\/11\/2026 – 21\/11\/2026/ })).toBeInTheDocument();
  fireEvent.click(filtri.getByRole("button", { name: "Scadenze superate, 1 fase" }));
  expect(grafico.getByRole("button", { name: /Impermeabilizzazione/ })).toBeInTheDocument();
  expect(grafico.queryByRole("button", { name: /Allestimento|Fondazioni/ })).not.toBeInTheDocument();
  fireEvent.click(filtri.getByRole("button", { name: "Prossimi 14 giorni, 1 fase" }));
  expect(grafico.getByRole("button", { name: /Installazione/ })).toBeInTheDocument();
  expect(grafico.queryByRole("button", { name: /Impermeabilizzazione/ })).not.toBeInTheDocument();
  fireEvent.click(filtri.getByRole("button", { name: "Date da verificare, 1 fase" }));
  expect(grafico.getByRole("button", { name: /Collaudo.*Date da verificare/ })).toBeInTheDocument();
});

it("apre il dettaglio e porta alla lavorazione o all’ultimo rapportino della stessa fase", () => {
  const { apri, apriRapportino } = mostra();
  expect(mock.ditte).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Fondazioni/ }));
  let dettaglio = within(screen.getByRole("dialog", { name: "Fondazioni" }));
  expect(mock.ditte).toHaveBeenCalledWith("a", "f1");
  expect(dettaglio.getByText("Ditta Strutture Demo")).toBeInTheDocument();
  expect(dettaglio.getByText("02/11/2026")).toBeInTheDocument();
  expect(dettaglio.getByText("20/11/2026")).toBeInTheDocument();
  expect(dettaglio.getByText("21/11/2026")).toBeInTheDocument();
  expect(dettaglio.getByText("Fase aperta")).toBeInTheDocument();
  fireEvent.click(dettaglio.getByRole("button", { name: "Apri rapportino" }));
  expect(apriRapportino).toHaveBeenCalledWith("a", "r-ultimo");
  fireEvent.click(screen.getByRole("button", { name: /Fondazioni/ }));
  dettaglio = within(screen.getByRole("dialog", { name: "Fondazioni" }));
  fireEvent.click(dettaglio.getByRole("button", { name: "Apri lavorazione" }));
  expect(apri).toHaveBeenCalledWith("a", "f1");
});

it("su desktop comprime la commessa e su telefono raggruppa e filtra per palazzina", () => {
  mostra();
  fireEvent.click(screen.getByRole("button", { name: "Comprimi Edificio A" }));
  expect(screen.getByRole("button", { name: "Espandi Edificio A" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("button", { name: /Fondazioni/ })).not.toBeInTheDocument();
  cleanup();
  mock.mobile = true;
  mostra();
  const agenda = within(screen.getByRole("list", { name: "Fasi di Palazzina A" }));
  const righe = agenda.getAllByRole("listitem");
  expect(righe[0]).toHaveTextContent("Impermeabilizzazione");
  expect(righe[1]).toHaveTextContent("Fondazioni");
  expect(righe[1]).toHaveTextContent("Avvio registrato 20/11/2026");
  expect(screen.getByRole("list", { name: "Fasi di Palazzina B" })).toHaveTextContent("Installazione");
  fireEvent.change(screen.getByRole("searchbox", { name: "Cerca fase o unità" }), { target: { value: "C-01" } });
  expect(screen.queryByRole("list", { name: "Fasi di Palazzina B" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Impermeabilizzazione/ }));
  expect(screen.getByRole("dialog", { name: "Impermeabilizzazione" })).toBeInTheDocument();
});

it("ripristina i filtri dell’agenda da un link e può azzerarli lasciando solo il previsto", () => {
  mock.mobile = true;
  mostra("/?crono-palazzina=Palazzina+B&crono-cerca=C-02&crono-filtro=date&crono-periodo=previsto");
  expect(screen.getByRole("searchbox", { name: "Cerca fase o unità" })).toHaveValue("C-02");
  expect(screen.getByRole("button", { name: /Collaudo/ })).toBeVisible();
  expect(screen.queryByRole("button", { name: /Installazione|Fondazioni/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Azzera filtri" }));
  expect(screen.getByRole("searchbox", { name: "Cerca fase o unità" })).toHaveValue("");
  expect(screen.getByRole("button", { name: /Fondazioni/ })).toBeVisible();
  expect(screen.getByRole("button", { name: "Solo previsto" })).toHaveAttribute("aria-pressed", "true");
});
