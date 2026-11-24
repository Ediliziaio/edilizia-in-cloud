import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GuidaProgetto } from "@/components/planimetrie/GuidaProgetto";
import { mancanzeProgetto, parametriGuida, passiGuidaProgetto } from "@/lib/planimetrie/guidaProgetto";
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
    expect(passiGuidaProgetto(dwg, "fatto").map((p) => p.id)).toEqual(["tipo", "unita", "lotto", "completezza", "consegne"]);
    const conScelte = { ...dwg, costruzione: { piani: {} }, unitaDichiarate: [{ nome: "Int. 01", suMq: 24 }, { nome: "Int. 02", suMq: 12 }],
      livelli: dwg.livelli.map((l, i) => ({ ...l, ...(i === 1 ? { tetto: { tipo: "piano" } } : {}), fatto: { ...l.fatto, aree: [],
        elementi: i === 0 ? [{ id: "s", tipo: "scala", posizione: { x: 0, y: 0 }, rotazione: 0, larghezza: 100, profondita: 300 }] : [] } })) } as unknown as Planimetria;
    const [solo] = passiGuidaProgetto(conScelte, "fatto");
    expect(solo.id).toBe("consegne");
    expect(solo.domanda).toBe("Il progetto è pronto. Cosa ti preparo?");
  });

  it("dice cosa manca per un progetto completo, piano per piano", () => {
    const conCantina = { ...dwg, livelli: [{ ...dwg.livelli[0], id: "cantina", nome: "Cantina", quota: -300,
      fatto: { ...dwg.livelli[0].fatto, locali: [], aree: [], muri: [{ id: "m", p1: { x: 0, y: 0 }, p2: { x: 500, y: 0 }, spessore: 30, altezza: 270 }] } }, ...dwg.livelli] } as unknown as Planimetria;
    expect(mancanzeProgetto(conCantina, "fatto").map((m) => [m.livelloId, m.tipo])).toEqual([
      ["cantina", "stanze"], ["cantina", "scala"], ["Piano terra", "scala"], ["Piano primo", "copertura"],
    ]);
    const passo = passiGuidaProgetto(conCantina, "fatto").find((p) => p.id === "completezza")!;
    expect(passo.domanda).toBe("Per un progetto completo mancano 4 cose. La prima: Cantina: nessuna stanza chiusa, quindi niente pavimenti, solai e voci nel computo.");
    expect(passo.azioni[0].verso).toEqual({ sezione: "pianta", livello: "cantina" });
    expect(parametriGuida(new URLSearchParams(), passo.azioni[0].verso).params.get("livello")).toBe("cantina");
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
    expect(screen.getByText(/Dopo:/)).toHaveTextContent("le unità · il lotto · cosa manca al progetto · tavole, 3D e costi");
    fireEvent.click(screen.getByRole("button", { name: "Scegli piano per piano" }));
    expect(vai).toHaveBeenCalledWith({ sezione: "dettagli", ancora: "nuova-costruzione" });
  });
});
