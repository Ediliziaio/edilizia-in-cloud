import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { WeatherDay } from "@/hooks/useWeatherForecast";
const state = vi.hoisted(() => ({
  supported: true,
  status: "ready",
  address: "Via Roma 10, Monza",
  data: { maxTemp: 18, minTemp: 9, precip: 3.2, code: 80 } as
    | WeatherDay
    | undefined,
  retry: vi.fn(),
}));
vi.mock("@/hooks/useCalendarSiteWeather", () => ({
  useCalendarSiteWeather: () => state,
}));
import { CalendarSiteWeather } from "@/components/calendar/CalendarSiteWeather";
const event = { type: "lavoro" as const, color: "" };
afterEach(cleanup);
beforeEach(() => {
  state.supported = true;
  state.status = "ready";
  state.data = { maxTemp: 18, minTemp: 9, precip: 3.2, code: 80 };
  state.retry.mockClear();
});
describe("Badge meteo e dettagli leggibili", () => {
  it("il badge in elenco contiene indirizzo e data e non crea pulsanti annidati", () => {
    const { container } = render(
      <button>
        <CalendarSiteWeather event={event} day="2026-10-14" compact />
      </button>,
    );
    expect(
      screen.getByRole("img", { name: /Via Roma 10, Monza · 14 ott/ }),
    ).toHaveTextContent("18°");
    expect(container.querySelector("button button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("mostra condizione, min/max, pioggia e fonte per l'indirizzo", () => {
    render(<CalendarSiteWeather event={event} day="2026-10-14" />);
    expect(
      screen.getByRole("region", { name: "Meteo presso questo indirizzo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Rovesci di pioggia · 9°–18°C"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Precipitazioni previste: 3,2 mm."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open-Meteo" })).toHaveAttribute(
      "href",
      "https://open-meteo.com/",
    );
  });
  it.each([
    [
      "outside-range",
      "Previsioni disponibili da oggi per i prossimi 16 giorni.",
    ],
    ["missing-address", "Indirizzo del cantiere non impostato."],
    ["missing-position", "Indirizzo non localizzato: meteo non disponibile."],
    ["loading", "Caricamento meteo…"],
  ])(
    "senza dati mostra una spiegazione, mai temperatura fittizia: %s",
    (status, message) => {
      state.status = status;
      state.data = undefined;
      render(<CalendarSiteWeather event={event} day="2026-10-14" />);
      expect(screen.getByRole("status")).toHaveTextContent(message);
      expect(screen.queryByText(/Precipitazioni previste/)).toBeNull();
      expect(screen.getByRole("img")).toHaveTextContent("—");
    },
  );
  it("consente di ritentare un errore senza modificare la commessa", () => {
    state.status = "error";
    state.data = undefined;
    render(<CalendarSiteWeather event={event} day="2026-10-14" />);
    fireEvent.click(screen.getByRole("button", { name: "Riprova meteo" }));
    expect(state.retry).toHaveBeenCalledOnce();
  });
});
