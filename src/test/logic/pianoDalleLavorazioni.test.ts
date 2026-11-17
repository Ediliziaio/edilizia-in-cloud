import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { leggiComputoPrimus, type PdfPaginaPosizionata } from "@/lib/computo/primusPdf";
import { bozzaDaComputoStrutturato } from "@/lib/computo/importaComputo";
import { calcolaVoce } from "@/lib/computo/editorNativo";
import { eNonLavoro } from "@/lib/computo/importaVoci";
import { giorniDelPiano } from "@/lib/orders/pianoDalCronoprogramma";
import { FASE_AVVIO, FASE_CHIUSURA, pianoDalleStime, stimaFasi } from "@/lib/orders/pianoDalleLavorazioni";
import { resaDiPartenza } from "../../../shared/piano-cantiere/resePartenza";
import type { VoceCantiere } from "../../../shared/piano-cantiere/calcolo";

const FASI: Record<string, string> = {
  "ONERI DELLA SICUREZZA": "Oneri della sicurezza",
  "ECO · ISOLAMENTO TERMICO SU STRUTTURE OPACHE": "Isolamento termico a cappotto",
  "ECO · SOSTITUZIONE INFISSI E SCHERMATURE": "Sostituzione infissi e serramenti",
  "ECO · ISTALLAZIONE IMPIANTO FOTOVOLTAICO": "Impianto fotovoltaico",
  "ECO · ISTALLAZIONE IMPIANTO DI ACCUMULO": "Impianto di accumulo",
  "ECO · ISTALLAZIONE COLONNINA DI RICARICA ELETRICCA": "Colonnina di ricarica elettrica",
  "ECO · IMPIANTO TERMICO": "Impianto termico",
};

function dati() {
  const p: PdfPaginaPosizionata[] = [];
  for (const riga of readFileSync(resolve(__dirname, "../fixtures/computoPrimusGenzano.tsv"), "utf8").split("\n")) {
    if (!riga || riga.startsWith("# ")) continue;
    if (riga.startsWith("### ")) { p.push({ page: Number(riga.slice(4)), items: [] }); continue; }
    const [x, right, y, ...t] = riga.split("\t");
    p.at(-1)!.items.push({ x: Number(x), right: Number(right), y: Number(y), text: t.join("\t") });
  }
  const b = bozzaDaComputoStrutturato(leggiComputoPrimus(p));
  const voci = b.voci.filter((v) => !eNonLavoro(v) && !v.detrazione).map((v) => ({
    fase: FASI[v.capitolo] ?? v.capitolo, descrizione: v.descrizione, unita: v.unita, quantita: calcolaVoce(v).quantita,
  }));
  const fasi = Object.values(FASI).map((nome, position) => ({ nome, position }));
  return { fasi, voci };
}

describe("rese di partenza", () => {
  it("riconosce le lavorazioni con la loro unità", () => {
    expect(resaDiPartenza("Isolamento termico a cappotto di pareti esterne con pannelli EPS", "mq")?.nome).toMatch(/Cappotto/);
    expect(resaDiPartenza("Isolamento termico in estradosso di sottotetti non praticabili", "mq")?.nome).toMatch(/coperture e sottotetti/);
    expect(resaDiPartenza("Serramento realizzato con profili estrusi di alluminio", "mq")?.nome).toMatch(/serramenti/);
    expect(resaDiPartenza("Fornitura e posa in opera di moduli fotovoltaici", "cad")?.nome).toMatch(/Moduli/);
    expect(resaDiPartenza("Sola fornitura di pannelli", "mq")).toBeNull();
    expect(resaDiPartenza("Cappotto", "a corpo")).toBeNull();
  });
});

describe("piano della commessa diretta dal computo", () => {
  const { fasi, voci } = dati();
  const stime = stimaFasi(fasi, voci);
  const piano = pianoDalleStime(stime);
  const di = (n: string) => stime.find((s) => s.nome === n)!;

  it("ogni fase di lavoro ha una durata", () => {
    for (const s of stime.filter((x) => !x.tuttoIlCantiere)) expect(s.giorni).toBeGreaterThan(0);
  });

  it("cappotto e facciate: 3-5 mesi di lavoro, come l'analisi a mano (16-22 settimane)", () => {
    expect(di("Isolamento termico a cappotto").giorni).toBeGreaterThanOrEqual(60);
    expect(di("Isolamento termico a cappotto").giorni).toBeLessThanOrEqual(115);
  });

  it("serramenti prima del cappotto, fotovoltaico verso la fine; la sicurezza copre tutto", () => {
    const inizio = (n: string) => piano.find((f) => f.nome === n)!.giornoInizio;
    expect(inizio("Sostituzione infissi e serramenti")).toBeLessThan(inizio("Isolamento termico a cappotto"));
    expect(inizio("Impianto fotovoltaico")).toBeGreaterThan(inizio("Isolamento termico a cappotto"));
    const sicurezza = piano.find((f) => f.nome === "Oneri della sicurezza")!;
    expect(sicurezza.giornoInizio).toBe(1);
    expect(sicurezza.giorni).toBe(giorniDelPiano(piano));
  });

  it("rilievi e ordini in apertura, serramenti dopo la produzione, collaudi in fondo", () => {
    expect(piano[0]).toMatchObject({ nome: FASE_AVVIO, giornoInizio: 1 });
    expect(piano.find((f) => f.nome === "Sostituzione infissi e serramenti")!.giornoInizio).toBeGreaterThanOrEqual(51);
    const ultima = piano.at(-1)!;
    expect(ultima.nome).toBe(FASE_CHIUSURA);
    expect(ultima.giornoInizio + ultima.giorni - 1).toBe(giorniDelPiano(piano));
  });

  it("il cantiere intero: fra 8 e 16 mesi lavorativi (l'analisi a mano dice 11-13)", () => {
    const giorni = giorniDelPiano(piano);
    expect(giorni).toBeGreaterThanOrEqual(170);
    expect(giorni).toBeLessThanOrEqual(350);
  });
});

describe("la resa dell'azienda per una lavorazione intera", () => {
  it("vince sulla resa di partenza per tutte le voci di quella lavorazione", async () => {
    const { oreDellaVoce, IPOTESI_PREDEFINITE } = await import("../../../shared/piano-cantiere/calcolo");
    const { chiavePartenza } = await import("../../../shared/piano-cantiere/resePartenza");
    const voce: VoceCantiere = { fase: null, capitolo: null, descrizione: "Isolamento termico a cappotto con pannelli EPS", unita: "mq", quantita: 100,
      importo: null, costo_manodopera: null, costo_materiali: null, ore_previste: null, incidenza: null, origine: "computo" };
    const prima = oreDellaVoce(voce, IPOTESI_PREDEFINITE)!;
    expect(prima.fonte).toBe("partenza");
    expect(prima.ore).toBeCloseTo(55, 6);
    const conResa = { ...IPOTESI_PREDEFINITE, rese: [{ chiave: chiavePartenza("Cappotto (pannelli, collante, tasselli)", "mq"), ore_per_unita: 0.4 }] };
    const dopo = oreDellaVoce(voce, conResa)!;
    expect(dopo.fonte).toBe("azienda");
    expect(dopo.ore).toBeCloseTo(40, 6);
  });
});
