import { describe, expect, it } from "vitest";
import { riepilogoVersamenti, type ScadenzaVersamento } from "@/hooks/controlloGestione/useVersamentiFiscali";

const s = (scadenza: string, atteso: number, banca: number, stato: ScadenzaVersamento["stato"], f24 = 0): ScadenzaVersamento =>
  ({ scadenza, voci: [], atteso, pagato_banca: banca, pagato_f24: f24, stato });

describe("riepilogo dei versamenti F24", () => {
  it("conta le scadenze passate e quanto manca, senza quelle da venire", () => {
    const r = riepilogoVersamenti([
      s("2026-01-16", 1000, 1000, "pagato"),
      s("2026-02-16", 1000, 400, "parziale"),
      s("2026-03-16", 500, 0, "non_trovato"),
      s("2026-04-16", 300, 0, "non_trovato", 300),
      s("2026-12-16", 900, 0, "da_venire"),
    ]);
    expect(r).toEqual({ scadute: 4, pagate: 1, nonTrovate: 2, parziali: 1, mancante: 1100 });
  });
});
