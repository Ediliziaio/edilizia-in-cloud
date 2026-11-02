/**
 * Gli ultimi difetti della revisione dell'1/11 che toccavano il popup: «Tieni questo» sceglie
 * il documento giusto anche senza id (L1) e il popup dice quali ordini entrano da soli (L12).
 */
import { describe, expect, it } from "vitest";
import { applica, pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";
import type { Modifica, PianoCommessa, Valore } from "../../../shared/silvio-commessa/piano.ts";
import type { Autonomia } from "../../../shared/silvio-commessa/autonomia.ts";
import { daConfermare, domandaDiSilvio, NOMI_STATI, testoConferma, type RigaArea } from "@/components/silvio-commessa/presentazione";
import { scritturaDalPiano } from "@/lib/silvio-commessa/scrittura";

const AZIENDA = "d2000000-0000-4000-a000-000000000002";
const SUP = "50000000-0000-4000-a000-000000000001";

function conDueDocumenti(): PianoCommessa {
  const p = pianoVuoto(AZIENDA);
  const candidato = (valore: number, etichetta: string): Valore => ({
    valore, fiducia: 0.9, stato: "attenzione", nota: null, fonte: { tipo: "documento", etichetta },
  });
  p.conflitti = [{
    area: "economia", chiave: "economia.total_amount",
    candidati: [candidato(100000, "capitolato.pdf"), candidato(95000, "offerta.pdf")],
  }];
  return p;
}

describe("L1: «Tieni questo» tra due documenti dello stesso tipo", () => {
  it("la domanda di Silvio porta l'etichetta, e tiene proprio il documento scelto", () => {
    const p = conDueDocumenti();
    const domanda = domandaDiSilvio(p, scritturaDalPiano(p))!;
    const offerta = domanda.risposte.find((r) => r.etichetta.includes("offerta.pdf")) as unknown as { modifica: Modifica };
    expect(offerta.modifica).toMatchObject({ tipo: "scegli_fonte", idFonte: null, etichettaFonte: "offerta.pdf" });
    const dopo = applica(p, offerta.modifica);
    expect(dopo.piano.aree.economia?.["economia.total_amount"]?.valore).toBe(95000);
  });
});

describe("L12: gli ordini «da sola» e quelli da confermare", () => {
  const autonomia: Autonomia = { ordini: { livello: "da_sola", soglia_eur: 500 } };
  const ordine = (fornitore: string, prezzo: number | null) => ({
    supplier_id: SUP, fornitore, fase: "Posa",     righe: [{ descrizione: "Materiale", quantita: 10, prezzo }],
  });
  const riga = (valore: unknown): RigaArea => ({
    variabile: { chiave: "materiali.acquisti", etichetta: "Acquisti", area: "materiali", livello: "propone" },
    stato: "proposta",
    valore: { valore, fiducia: 0.6, stato: "proposta", nota: null, fonte: { tipo: "calcolo", etichetta: "Silvio" } },
  } as unknown as RigaArea);

  it("uno coi prezzi e uno senza: dice che uno entra da solo, come fa la scrittura", () => {
    const r = riga([ordine("Coi prezzi", 8), ordine("Senza prezzi", null)]);
    expect(daConfermare(r, autonomia)).toBe(true);
    expect(testoConferma(r, autonomia)).toBe(
      "1 ordine coi prezzi e sotto la soglia entra da solo. 1 ordine senza prezzi o sopra la soglia entra solo se confermi: «Va bene» conferma tutto.",
    );
  });

  it("nessuno coi prezzi: entrano solo se confermi", () => {
    expect(testoConferma(riga([ordine("A", null), ordine("B", null)]), autonomia)).toBe(
      "2 ordini senza prezzi o sopra la soglia: entrano solo se confermi.",
    );
  });

  it("con «chiede» resta il testo di sempre", () => {
    expect(testoConferma(riga([ordine("A", 8)]), { ordini: { livello: "chiede", soglia_eur: null } }))
      .toBe("Proposta di Silvio: entra nella commessa se la confermi.");
  });
});

it("⚠ non dice più «fonti in disaccordo» quando il motivo è un altro", () => {
  expect(NOMI_STATI.attenzione).toBe("da sistemare");
});
