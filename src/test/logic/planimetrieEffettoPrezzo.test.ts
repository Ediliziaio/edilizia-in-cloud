import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { effettoSulPrezzo, type RigaCollegata } from "@/lib/planimetrie/effettoPrezzo";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita.ts";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";

const doc: Planimetria = JSON.parse(readFileSync(join(process.cwd(), "shared/planimetrie/esempi/trilocale.json"), "utf8"));
const mappa = calcolaQuantita(doc);
const chiavePavimento = Object.keys(mappa).find((k) => k.startsWith("fatto:locale:") && k.endsWith(".pavimento_mq"))!;
const mq = mappa[chiavePavimento].valore;

const riga = (over: Partial<Omit<RigaCollegata, "computo">> & { prezzo?: number | null; detrazione?: boolean; computo?: string }): RigaCollegata => ({
  id: over.id ?? "r1", descrizione: "Pavimento", quantita: over.quantita ?? mq, chiavi: over.chiavi ?? [chiavePavimento],
  voce: { id: "v1", descrizione: "Pavimento in gres", unita: "mq", prezzo: over.prezzo === undefined ? 50 : over.prezzo, detrazione: !!over.detrazione },
  computo: { id: over.computo ?? "c1", titolo: "Computo Rossi", stato: "bozza", orderId: "o1" },
});

describe("effetto sul prezzo delle modifiche alla pianta", () => {
  it("se la pianta non cambia, niente da dire", () => {
    expect(effettoSulPrezzo([riga({})], mappa)).toEqual([]);
  });
  it("10 mq in più a 50 €/mq = +500 €", () => {
    const e = effettoSulPrezzo([riga({ quantita: mq - 10 })], mappa);
    expect(e).toHaveLength(1);
    expect(e[0].righe[0].differenza).toBeCloseTo(10, 2);
    expect(e[0].totale).toBeCloseTo(500, 2);
  });
  it("le detrazioni vanno col segno meno; le voci senza prezzo si contano a parte", () => {
    const e = effettoSulPrezzo([
      riga({ id: "a", quantita: -(mq - 2), detrazione: true }),
      riga({ id: "b", quantita: mq - 1, prezzo: null }),
    ], mappa);
    expect(e[0].totale).toBeCloseTo(-100, 2);
    expect(e[0].senzaPrezzo).toBe(1);
  });
  it("una stanza tolta dalla pianta si segnala", () => {
    const e = effettoSulPrezzo([riga({ chiavi: ["fatto:locale:non-esiste.pavimento_mq"] })], mappa);
    expect(e[0].righe[0].mancanti).toHaveLength(1);
    expect(e[0].totale).toBeCloseTo(-Math.round(mq * 100) / 100 * 50, 1);
  });
  it("più computi: prima quello che cambia di più", () => {
    const e = effettoSulPrezzo([riga({ id: "x", quantita: mq - 1, computo: "piccolo" }), riga({ id: "y", quantita: mq - 20, computo: "grande" })], mappa);
    expect(e.map((x) => x.computo.id)).toEqual(["grande", "piccolo"]);
  });
});
