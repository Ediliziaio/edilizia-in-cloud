/**
 * Il PDF vero a destra dei preventivatori (07/11/2026).
 *
 * Florin: «a destra vorrei vedere l'anteprima proprio del PDF che si va a generare». Qui si prova che il
 * pannello fa il PDF con la funzione del modulo, poco dopo l'ultima modifica e una volta sola, e che non lo
 * fa quando non si vede.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pdf = vi.hoisted(() => ({ pagine: 3 }));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "worker.js" },
  getDocument: () => ({ promise: Promise.resolve({ numPages: pdf.pagine, getPage: vi.fn() }) }),
}));

import { AnteprimaPdfVero, RITARDO_PDF_VERO_MS } from "@/components/preventivatore/AnteprimaPdfVero";

const blob = () => ({ arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as Blob;

/** Lascia correre i timer e le promesse che ne nascono. */
async function avanza(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

beforeEach(() => { vi.useFakeTimers(); pdf.pagine = 3; });
afterEach(() => { vi.useRealTimers(); });

describe("Il PDF vero a destra", () => {
  it("lo fa con la funzione del modulo e dice quante pagine ha", async () => {
    const genera = vi.fn(async () => blob());
    render(<AnteprimaPdfVero genera={genera} chiave="a" attivo />);
    await avanza(300);
    expect(genera).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("3 pagine · aggiornato alle");
    expect(screen.getAllByLabelText(/Pagina \d di 3/)).toHaveLength(3);
  });

  it("dopo una modifica aspetta un attimo, e tante modifiche di fila fanno un PDF solo", async () => {
    const genera = vi.fn(async () => blob());
    const { rerender } = render(<AnteprimaPdfVero genera={genera} chiave="a" attivo />);
    await avanza(300);
    for (const k of ["b", "c", "d"]) {
      rerender(<AnteprimaPdfVero genera={genera} chiave={k} attivo />);
      await avanza(200);
    }
    expect(genera).toHaveBeenCalledTimes(1);
    await avanza(RITARDO_PDF_VERO_MS);
    expect(genera).toHaveBeenCalledTimes(2);
  });

  it("se non cambia niente che vada nel PDF, non lo rifà", async () => {
    const genera = vi.fn(async () => blob());
    const { rerender } = render(<AnteprimaPdfVero genera={genera} chiave="a" attivo />);
    await avanza(300);
    rerender(<AnteprimaPdfVero genera={genera} chiave="a" attivo />);
    await avanza(RITARDO_PDF_VERO_MS * 2);
    expect(genera).toHaveBeenCalledTimes(1);
  });

  it("a pannello chiuso non fa niente; aperto, parte", async () => {
    const genera = vi.fn(async () => blob());
    const { rerender } = render(<AnteprimaPdfVero genera={genera} chiave="a" attivo={false} />);
    await avanza(RITARDO_PDF_VERO_MS * 2);
    expect(genera).not.toHaveBeenCalled();
    expect(screen.getByText(/si prepara quando il pannello è aperto/)).toBeInTheDocument();
    rerender(<AnteprimaPdfVero genera={genera} chiave="a" attivo />);
    await avanza(300);
    expect(genera).toHaveBeenCalledTimes(1);
  });

  it("un giro alla volta: una modifica durante il PDF lo fa rifare una volta sola, alla fine", async () => {
    let finisci: () => void = () => {};
    const genera = vi.fn(() => new Promise<Blob>((ok) => { finisci = () => ok(blob()); }));
    render(<AnteprimaPdfVero genera={genera} chiave="a" attivo />);
    await avanza(300);
    expect(genera).toHaveBeenCalledTimes(1);
    // Due «Aggiorna ora» mentre il primo è in corso: si mette in coda un giro solo.
    act(() => { screen.getByRole("button", { name: "Aggiorna il PDF ora" }).click(); });
    act(() => { screen.getByRole("button", { name: "Aggiorna il PDF ora" }).click(); });
    expect(genera).toHaveBeenCalledTimes(1);
    await act(async () => { finisci(); await vi.advanceTimersByTimeAsync(10); });
    expect(genera).toHaveBeenCalledTimes(2);
  });

  it("se il PDF non si fa lo dice, e si riprova con un clic", async () => {
    const genera = vi.fn(async () => { throw new Error("modello mancante"); });
    render(<AnteprimaPdfVero genera={genera} chiave="a" attivo />);
    await avanza(300);
    expect(screen.getByText(/Il PDF non si è generato: modello mancante/)).toBeInTheDocument();
    act(() => { screen.getByRole("button", { name: "Riprova" }).click(); });
    await avanza(10);
    expect(genera).toHaveBeenCalledTimes(2);
  });
});
