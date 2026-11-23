import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useTestoCheSegue } from "@/hooks/useTestoCheSegue";

/**
 * Il campo di ricerca delle fatture ricevute restava indietro di due o tre
 * lettere (23/11/2026, Impresa Vulcano): ogni lettera ridisegnava la pagina con
 * tutte le sue 1.294 righe. Il campo adesso ha lo stato suo e la pagina lo
 * riceve quando si smette di digitare.
 */
function Campo({ valore, onCambia }: { valore: string; onCambia: (t: string) => void }) {
  const [testo, scrivi] = useTestoCheSegue(valore, onCambia);
  return <input aria-label="cerca" value={testo} onChange={(e) => scrivi(e.target.value)} />;
}

function Pagina({ registra }: { registra: (t: string) => void }) {
  const [cerca, setCerca] = useState("");
  return (
    <>
      <Campo valore={cerca} onCambia={(t) => { registra(t); setCerca(t); }} />
      <button onClick={() => setCerca("")}>Azzera</button>
      <output aria-label="pagina">{cerca}</output>
    </>
  );
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const digita = (campo: HTMLElement, parola: string) => {
  for (let i = 1; i <= parola.length; i++) fireEvent.change(campo, { target: { value: parola.slice(0, i) } });
};

it("ogni lettera compare subito, la pagina riceve la parola una volta sola", () => {
  const registra = vi.fn();
  render(<Pagina registra={registra} />);
  const campo = screen.getByLabelText("cerca");
  digita(campo, "BLUMATICA");
  expect(campo).toHaveValue("BLUMATICA");
  expect(registra).not.toHaveBeenCalled();
  expect(screen.getByLabelText("pagina")).toHaveTextContent("");
  act(() => { vi.advanceTimersByTime(200); });
  expect(registra).toHaveBeenCalledTimes(1);
  expect(registra).toHaveBeenCalledWith("BLUMATICA");
  expect(screen.getByLabelText("pagina")).toHaveTextContent("BLUMATICA");
});

it("«Azzera» svuota il campo e butta la scrittura ancora in attesa", () => {
  const registra = vi.fn();
  render(<Pagina registra={registra} />);
  const campo = screen.getByLabelText("cerca");
  digita(campo, "BLU");
  act(() => { vi.advanceTimersByTime(200); });
  digita(campo, "BLUMA");
  fireEvent.click(screen.getByText("Azzera"));
  expect(campo).toHaveValue("");
  act(() => { vi.advanceTimersByTime(500); });
  // «BLUMA» non deve tornare dopo che l'utente ha azzerato.
  expect(registra).toHaveBeenLastCalledWith("BLU");
  expect(campo).toHaveValue("");
  expect(screen.getByLabelText("pagina")).toHaveTextContent("");
});

it("il proprio valore che torna dalla pagina non cancella quello che si sta scrivendo", () => {
  const registra = vi.fn();
  render(<Pagina registra={registra} />);
  const campo = screen.getByLabelText("cerca");
  digita(campo, "BL");
  act(() => { vi.advanceTimersByTime(200); });
  digita(campo, "BLUM");
  expect(campo).toHaveValue("BLUM");
});
