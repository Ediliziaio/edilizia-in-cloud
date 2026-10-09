import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chiedeMisureForma, MisureForma } from "@/components/serramenti/MisureForma";
import type { DefinizioneDisegno } from "@/lib/serramenti/disegnoSerramento";

afterEach(cleanup);
describe("misure delle composizioni personali nel preventivo", () => {
  const definizione: DefinizioneDisegno = { ante: [{ tipo: "battente", lato: "dx" }], sopraluce: { altezzaMm: 300 }, sottoluce: { altezzaMm: 250 } };
  it("chiede anche le altezze delle composizioni non presenti nei preset", () => {
    expect(chiedeMisureForma("personalizzata", definizione)).toBe(true);
    expect(chiedeMisureForma("personalizzata")).toBe(false);
    expect(chiedeMisureForma("finestra_1_anta")).toBe(false);
  });
  it("mostra entrambi i campi e mantiene l'altro valore quando si modifica un'altezza", () => {
    const cambio = vi.fn();
    render(<MisureForma tipologia="personalizzata" definizione={definizione} larghezzaMm={1200} altezzaMm={1800}
      valori={{ sopraluceMm: 300, sottoluceMm: 250 }} onChange={cambio} />);
    const alto = screen.getByLabelText("Altezza del sopraluce (mm)");
    const basso = screen.getByLabelText("Altezza del sottoluce (mm)");
    fireEvent.blur(alto, { target: { value: "350" } });
    expect(cambio).toHaveBeenLastCalledWith({ sopraluceMm: 350, sottoluceMm: 250 });
    fireEvent.blur(basso, { target: { value: "200" } });
    expect(cambio).toHaveBeenLastCalledWith({ sopraluceMm: 300, sottoluceMm: 200 });
  });
});
