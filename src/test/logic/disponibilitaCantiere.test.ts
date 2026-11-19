import { expect, it } from "vitest";
import { caricoPerGiorno, riepilogoDisponibilita } from "@/lib/orders/disponibilitaCantiere";
import { ripartisciMicroOre, validaRipartizione, type PianoPrevisto } from "@/lib/orders/previsionaleSalvato";

it("conta la fase e le sue voci una volta sola; riporta le ore residue e gli impegni senza quantità", () => {
  const dal = "2026-11-23", al = "2026-11-24";
  const fase: PianoPrevisto = {
    ambito: { tipo: "fase", id: "f", faseId: "f" },
    persone: ["p"], squadre: [], operai: [{ id: "p", nome: "Mario", tariffa: 25 }],
    dal, al, giorni: [dal, al], oreGiorno: 6, microOreGiorno: 6_000_000, sabato: false,
  };
  const voce: PianoPrevisto = { ...fase, ambito: { tipo: "sottofase", id: "s", faseId: "f" }, giorni: [dal], oreGiorno: 4, microOreGiorno: 4_000_000 };
  const altri = caricoPerGiorno([fase, voce], new Set(["p"]), dal, al);
  expect(altri.map((i) => i.ore)).toEqual([6, 6]);
  const impegni = altri.map((i) => ({ ...i, commessa: "b", codice: "ORD-B" }));
  const esito = riepilogoDisponibilita({
    oreGiornaliere: { p: 8 }, assegnazioniVerificate: true,
    impegni: [...impegni, { persona: "p", giorno: al, ore: null, commessa: "C", codice: "ORD-C" }],
  }, ["p"], [dal, al], 8)[0];
  expect(esito.date[0]).toMatchObject({ giorno: dal, residuo: 2, eccedenza: 6, daVerificare: false });
  expect(esito.date[1]).toMatchObject({ giorno: al, residuo: 2, eccedenza: 6, daVerificare: true });
});

it("conserva il totale anche nel riparto frazionario e rifiuta quote fuori dal monte ore", () => {
  expect(ripartisciMicroOre(8, 3)).toEqual([2_666_667, 2_666_667, 2_666_666]);
  expect(validaRipartizione([6_000_000, 2_000_000], 8, 2)).toBe(true);
  expect(validaRipartizione([6_000_000, 4_000_000], 8, 2)).toBe(false);
  expect(validaRipartizione([8_000_000, 0], 8, 2)).toBe(false);
});
