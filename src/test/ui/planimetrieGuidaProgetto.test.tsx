import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GuidaProgetto } from "@/components/planimetrie/GuidaProgetto";
import { parametriGuida, passiGuidaProgetto } from "@/lib/planimetrie/guidaProgetto";
import type { Planimetria } from "../../../shared/planimetrie/modello";

const stanza = (id: string, nome: string, destinazione: string, x: number, unita: string) => ({
  id, nome, destinazione, altezza: 300, origine: "stimata", unita,
  contorno: [{ x, y: 0 }, { x: x + 400, y: 0 }, { x: x + 400, y: 300 }, { x, y: 300 }],
});
const piano = (id: string, quota: number, locali: unknown[], aree: unknown[] = []) => ({
  id, nome: id, quota, proposte: [], fatto: { muri: [], aperture: [], elementi: [], quote: [], testi: [], locali, aree },
});
const lotto = { id: "l", tipo: "lotto", nome: "Lotto (da verificare)", contorno: [{ x: -1000, y: -1000 }, { x: 3000, y: -1000 }, { x: 3000, y: 3000 }] };
const dwg = {
  schema: 1, unita: "cm",
  livelli: [
    piano("Piano terra", 0, [stanza("a", "soggiorno", "soggiorno", 0, "Int. 01"), stanza("b", "bagno", "bagno", 400, "Int. 01")], [lotto]),
    piano("Piano primo", 349, [stanza("c", "soggiorno", "soggiorno", 0, "Int. 02")]),
  ],
  unitaDichiarate: [{ nome: "Int. 01", suMq: 24 }, { nome: "Int. 02", suMq: 40 }],
} as unknown as Planimetria;

describe("guida di Silvio dopo il DWG", () => {
  it("chiede prima il tipo di lavori, poi le unità che non tornano, poi il lotto, poi propone le consegne", () => {
    expect(passiGuidaProgetto(dwg, "fatto").map((p) => p.id)).toEqual(["tipo", "unita", "lotto", "consegne"]);
    const conScelte = { ...dwg, costruzione: { piani: {} }, unitaDichiarate: [{ nome: "Int. 01", suMq: 24 }, { nome: "Int. 02", suMq: 12 }],
      livelli: dwg.livelli.map((l) => ({ ...l, fatto: { ...l.fatto, aree: [] } })) } as unknown as Planimetria;
    const [solo] = passiGuidaProgetto(conScelte, "fatto");
    expect(solo.id).toBe("consegne");
    expect(solo.domanda).toBe("Il progetto è pronto. Cosa ti preparo?");
  });

  it("la domanda sulle unità dice quanto manca", () => {
    const unita = passiGuidaProgetto(dwg, "fatto").find((p) => p.id === "unita")!;
    expect(unita.domanda).toBe("L'int. 02 misura 12 m² contro i 40 m² della legenda: manca qualche stanza.");
  });

  it("ogni azione porta al punto giusto della scheda", () => {
    const da = new URLSearchParams("ambito=progetto%3AA&silvio=1&sezione=pianta");
    expect(parametriGuida(da, { sezione: "studio" }).params.toString()).toBe("ambito=progetto%3AA&studio=1");
    expect(parametriGuida(da, { sezione: "esporta" }).params.get("esporta")).toBe("pdf");
    expect(parametriGuida(da, { sezione: "pianta", vista: "3d" }).params.get("vista")).toBe("3d");
    expect(parametriGuida(da, { sezione: "dettagli", ancora: "nuova-costruzione" })).toMatchObject({ ancora: "nuova-costruzione" });
  });

  it("nella chat mostra la domanda di adesso e cosa viene dopo", () => {
    const vai = vi.fn();
    render(<GuidaProgetto documento={dwg} ambito="fatto" onVai={vai} />);
    expect(screen.getByText(/Ho letto 2 piani/)).toBeInTheDocument();
    expect(screen.getByText(/Dopo:/)).toHaveTextContent("le unità · il lotto · tavole, 3D e costi");
    fireEvent.click(screen.getByRole("button", { name: "Scegli piano per piano" }));
    expect(vai).toHaveBeenCalledWith({ sezione: "dettagli", ancora: "nuova-costruzione" });
  });
});
