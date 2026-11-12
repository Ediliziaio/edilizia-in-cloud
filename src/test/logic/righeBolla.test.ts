import { describe, expect, it } from "vitest";
import {
  aggiungiRiga, correggiRiga, numeroDaCampo, problemiBolla, rigaBollaVuota, togliRiga,
} from "@/lib/ddt/righeBolla";
import { bollaDaFile, compilaAMano, problemiBloccanti } from "@/lib/ddt/importBolle";
import { filtraProposte } from "@/components/ddt/CampoConProposte";
import { proposteAutisti, proposteMezzi } from "@/hooks/useProposteTrasporto";

const riga = (patch = {}) => ({ ...rigaBollaVuota(1), descrizione: "Malta", quantita: 2, unita_misura: "pz", ...patch });

describe("righe della bolla scritte a mano (12/11/2026)", () => {
  it("una correzione toglie l'abbinamento all'ordine e ricalcola l'importo", () => {
    const [r] = correggiRiga([riga({ purchase_order_item_id: "poi", abbinamento: "auto", origine: "ai", importo: 99 })], 0, { prezzo_unitario: 3.5 });
    expect(r).toMatchObject({ purchase_order_item_id: null, abbinamento: null, origine: "manuale", importo: 7 });
  });
  it("aggiungi e togli rinumerano le posizioni", () => {
    const tre = aggiungiRiga(aggiungiRiga([riga()]));
    expect(tre.map((r) => r.posizione)).toEqual([1, 2, 3]);
    expect(togliRiga(tre, 0).map((r) => r.posizione)).toEqual([1, 2]);
  });
  it("il campo numerico: vuoto è non so, la virgola vale il punto", () => {
    expect(numeroDaCampo("")).toBeNull();
    expect(numeroDaCampo("2,5")).toBe(2.5);
    expect(numeroDaCampo("abc")).toBeNull();
  });
  it("una riga senza descrizione blocca, come farebbe il database", () => {
    expect(problemiBolla({ numero: "1", data: "2026-11-12", destinazione: "magazzino", orderId: null, righe: [rigaBollaVuota(1)] }))
      .toEqual(["manca la descrizione in una riga"]);
  });
  it("compila a mano: la bolla non letta diventa letta, senza perdere il file, e i controlli valgono", () => {
    const f = new File(["x"], "b.jpg", { type: "image/jpeg" });
    const b = { ...bollaDaFile(f, "id", { destinazione: "magazzino" }), stato: "non_letta" as const, errore: "timeout" };
    const m = compilaAMano(b);
    expect(m).toMatchObject({ stato: "letta", errore: null, compilaAMano: true, file: f });
    expect(problemiBloccanti(m)).toEqual(["manca il numero", "manca la data"]);
  });
});

describe("proposte di targa e autista", () => {
  it("solo i mezzi con targa, in maiuscolo, col nome del mezzo", () => {
    expect(proposteMezzi([{ nome: "Daily", targa: "ab123cd" }, { nome: "Gru", targa: null }]))
      .toEqual([{ valore: "AB123CD", etichetta: "AB123CD", dettaglio: "Daily" }]);
    expect(proposteAutisti([{ nome: "Mario", cognome: "Rossi" }, { nome: null, cognome: null }])).toEqual([{ valore: "Mario Rossi", etichetta: "Mario Rossi" }]);
  });
  it("si cerca anche per nome del mezzo, ignorando spazi e trattini", () => {
    const p = proposteMezzi([{ nome: "Daily", targa: "AB-123 CD" }, { nome: "Ducato", targa: "ZZ999ZZ" }]);
    expect(filtraProposte(p, "ab123").map((x) => x.dettaglio)).toEqual(["Daily"]);
    expect(filtraProposte(p, "duc").map((x) => x.dettaglio)).toEqual(["Ducato"]);
  });
});
