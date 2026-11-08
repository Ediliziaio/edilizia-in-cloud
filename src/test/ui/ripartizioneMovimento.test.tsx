import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { RipartizioneMovimento, type CandidatoRipartizione } from "@/components/tesoreria/RipartizioneMovimento";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
afterEach(cleanup);

const c = (id: string, residuo: number, tipo: CandidatoRipartizione["tipo"] = "documento"): CandidatoRipartizione =>
  ({ key: id, tipo, id, titolo: `F-${id} — Rossi`, residuo });
const apri = (resto: number, candidati: CandidatoRipartizione[]) => {
  const onConferma = vi.fn();
  render(<RipartizioneMovimento resto={resto} candidati={candidati} inCorso={false} etichettaDocumenti="fatture" onConferma={onConferma} />);
  return onConferma;
};
const scegli = (id: string) => fireEvent.click(screen.getByRole("checkbox", { name: `Scegli F-${id} — Rossi` }));
const importo = (id: string) => screen.getByLabelText(`Importo per F-${id} — Rossi`) as HTMLInputElement;
const conferma = () => screen.getByRole("button", { name: "Conferma" });

describe("un movimento su più documenti", () => {
  it("riempie gli importi fino a esaurire il bonifico", () => {
    const onConferma = apri(1000, [c("a", 700), c("b", 700)]);
    scegli("a"); scegli("b");
    expect(importo("a").value).toBe("700,00");
    expect(importo("b").value).toBe("300,00");
    expect(screen.getByText(/movimento coperto/)).toBeInTheDocument();
    fireEvent.click(conferma());
    expect(onConferma).toHaveBeenCalledWith([
      { tipo: "documento", id: "a", importo: 700 },
      { tipo: "documento", id: "b", importo: 300 },
    ], "");
  });

  it("acconto: si cambia l'importo e il resto si abbina dopo", () => {
    const onConferma = apri(1000, [c("a", 5000)]);
    scegli("a");
    fireEvent.change(importo("a"), { target: { value: "400" } });
    expect(screen.getByText(/restano .*600,00.* da abbinare dopo/)).toBeInTheDocument();
    fireEvent.click(conferma());
    expect(onConferma.mock.calls[0][0]).toEqual([{ tipo: "documento", id: "a", importo: 400 }]);
  });

  it("non lascia confermare più del movimento o del residuo", () => {
    apri(100, [c("a", 80), c("b", 80)]);
    scegli("a"); scegli("b");
    fireEvent.change(importo("b"), { target: { value: "50" } });
    expect(screen.getByText(/più del movimento/)).toBeInTheDocument();
    expect(conferma()).toBeDisabled();
    fireEvent.change(importo("b"), { target: { value: "90" } });
    expect(screen.getByText(/al massimo/)).toBeInTheDocument();
    expect(conferma()).toBeDisabled();
  });

  it("propone le fatture che fanno esattamente l'importo", () => {
    const onConferma = apri(300, [c("a", 100), c("b", 200), c("c", 999)]);
    fireEvent.click(screen.getByRole("button", { name: /fanno esattamente/ }));
    fireEvent.click(conferma());
    expect(onConferma.mock.calls[0][0]).toHaveLength(2);
  });

  it("togliendo la spunta sparisce la riga", () => {
    apri(100, [c("a", 80)]);
    scegli("a"); scegli("a");
    expect(screen.queryByLabelText("Importo per F-a — Rossi")).toBeNull();
    expect(conferma()).toBeDisabled();
  });
});
