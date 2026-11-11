import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Calendar } from "@/components/ui/calendar";
afterEach(cleanup);
it("espone mesi, navigazione e selezione in italiano conservando le date", () => {
  const onSelect = vi.fn();
  render(<Calendar mode="single" today={new Date(2026,10,9)} month={new Date(2026,10,1)} selected={new Date(2026,10,9)} onSelect={onSelect} />);
  expect(screen.getByRole("navigation", { name: "Navigazione calendario" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Mese precedente" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Mese successivo" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "lunedì 9 novembre 2026, oggi, selezionato" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "martedì 10 novembre 2026" }));
  expect(onSelect.mock.calls[0][0]).toEqual(new Date(2026,10,10));
});
it("mantiene le etichette specifiche passate dal chiamante", () => {
  render(<Calendar month={new Date(2026,10,1)} labels={{ labelNext: () => "Prossimo mese del periodo" }} />);
  expect(screen.getByRole("button", { name: "Prossimo mese del periodo" })).toBeTruthy();
});

it("con un locale parziale conserva le traduzioni italiane e applica le opzioni richieste", () => {
  render(<Calendar mode="single" today={new Date(2026,10,9)} month={new Date(2026,10,1)} locale={{ options: { weekStartsOn: 0 } }} />);
  expect(screen.getByText("novembre 2026")).toBeTruthy();
  expect(screen.getAllByRole("button", { name: /^(lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)/ })[0].getAttribute("aria-label")).toBe("domenica 1 novembre 2026");
  expect(screen.getByRole("button", { name: "martedì 10 novembre 2026" })).toBeTruthy();
});
