import { describe, expect, it } from "vitest";
import {
  statoVoce, contaFiltri, dateInFila, dateValide, ordineSpostando, distintaConsigliata, filtraDistinta, pianoInBlocco, righeDistinta, totaliDistinta, type VoceDistinta,
} from "@/lib/orders/distintaLavorazioni";
import type { Sottofase } from "@/lib/orders/sottofasi";

const voce = (id: string, extra: Partial<VoceDistinta> = {}): VoceDistinta => ({
  id, phase_id: "f1", position: 0, descrizione: `Voce ${id}`, unita: "mq", quantita: 10,
  costo_manodopera: 0, costo_materiali: 0, importo: 100, origine_codice: `C-${id}`, subphase_id: null, ...extra,
});
const sottofase = (id: string, extra: Partial<Sottofase> = {}): Sottofase => ({
  id, phase_id: "f1", name: `Sottofase ${id}`, position: 0, peso: 1, fatta: false, fatta_il: null, ...extra,
});
const fasi = [{ id: "f1", name: "Murature" }, { id: "f2", name: "Impianti" }];
const OGGI = "2026-11-04";

describe("righeDistinta", () => {
  it("voce e sottofase collegate fanno una riga sola, con i numeri dell'una e le date dell'altra", () => {
    const righe = righeDistinta(fasi, new Map([["f1", [sottofase("s1", { data_fine: "2026-12-01", fatta: true })]]]), [voce("v1", { subphase_id: "s1", costo_manodopera: 2, costo_materiali: 3 })]);
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({ sottofaseId: "s1", voceId: "v1", fine: "2026-12-01", fatta: true, previsto: 50, venduto: 100 });
  });
  it("tiene anche le voci senza sottofase e le sottofasi senza voce", () => {
    const righe = righeDistinta(fasi, new Map([["f1", [sottofase("s1")]]]), [voce("v1")]);
    expect(righe.map((r) => [r.voceId, r.sottofaseId])).toEqual([[null, "s1"], ["v1", null]]);
  });
  it("una voce senza costi non ha previsto zero: è da definire", () => {
    expect(righeDistinta(fasi, new Map(), [voce("v1")])[0].previsto).toBeNull();
  });
  it("il numero del preventivo, uguale per tutte le voci, non passa per codice", () => {
    const stesso = righeDistinta(fasi, new Map(), [voce("a", { origine_codice: "P-1" }), voce("b", { origine_codice: "P-1" })]);
    expect(stesso.every((r) => r.codice === null)).toBe(true);
    const diversi = righeDistinta(fasi, new Map(), [voce("a"), voce("b")]);
    expect(diversi.map((r) => r.codice)).toEqual(["C-a", "C-b"]);
  });
  it("segue l'ordine delle fasi e la posizione delle voci", () => {
    const righe = righeDistinta(fasi, new Map(), [voce("c", { phase_id: "f2" }), voce("b", { position: 2 }), voce("a", { position: 1 })]);
    expect(righe.map((r) => r.voceId)).toEqual(["a", "b", "c"]);
  });
});

describe("filtri e ricerca", () => {
  const righe = righeDistinta(fasi, new Map([["f1", [
    sottofase("s1", { name: "Fatta", fatta: true, data_fine: "2026-01-01" }),
    sottofase("s2", { name: "Scaduta", data_fine: "2026-01-01" }),
    sottofase("s3", { name: "Futura", data_fine: "2027-01-01" }),
    sottofase("s4", { name: "Senza date" }),
  ]]]), [voce("v1", { descrizione: "Controparete in cartongèsso", origine_codice: "DB5.14" }), voce("v2", { costo_materiali: 1 })]);

  it("conta quello che serve per decidere, senza contare le righe chiuse", () => {
    expect(contaFiltri(righe, OGGI)).toEqual({ tutte: 6, da_fare: 5, senza_date: 3, senza_previsto: 1, in_ritardo: 1 });
  });
  it("cerca parole in qualunque ordine, senza accenti, anche nel codice", () => {
    expect(filtraDistinta(righe, { testo: "cartongesso controparete", oggi: OGGI }).map((r) => r.voceId)).toEqual(["v1"]);
    expect(filtraDistinta(righe, { testo: "db5", oggi: OGGI }).map((r) => r.voceId)).toEqual(["v1"]);
  });
  it("in ritardo solo chi non è fatta e ha la fine passata", () => {
    expect(filtraDistinta(righe, { filtro: "in_ritardo", oggi: OGGI }).map((r) => r.sottofaseId)).toEqual(["s2"]);
  });
  it("filtra per fase", () => {
    expect(filtraDistinta(righe, { faseId: "f2", oggi: OGGI })).toEqual([]);
  });
});

describe("ordine e nomi", () => {
  it("le righe seguono l'ordine delle sottofasi, così Su e Giù si vedono", () => {
    const righe = righeDistinta(fasi, new Map([["f1", [sottofase("s1", { position: 1, name: "Voce a" }), sottofase("s2", { position: 0, name: "Voce b" })]]]), [voce("a", { position: 0, subphase_id: "s1" }), voce("b", { position: 1, subphase_id: "s2" })]);
    expect(righe.map((r) => r.sottofaseId)).toEqual(["s2", "s1"]);
  });
  it("una sottofase rinominata mostra il suo nome, una nata dalla voce il testo intero", () => {
    const voci = [voce("a", { descrizione: "Testo lungo della voce", subphase_id: "s1" })];
    expect(righeDistinta(fasi, new Map([["f1", [sottofase("s1", { name: "Testo lungo" })]]]), voci)[0].descrizione).toBe("Testo lungo della voce");
    expect(righeDistinta(fasi, new Map([["f1", [sottofase("s1", { name: "Nome mio" })]]]), voci)[0].descrizione).toBe("Nome mio");
  });
  it("sposta di un posto, e si ferma ai bordi", () => {
    expect(ordineSpostando(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(ordineSpostando(["a", "b"], "a", -1)).toBeNull();
    expect(ordineSpostando(["a", "b"], "b", 1)).toBeNull();
  });
});

describe("stato della voce", () => {
  it("dice fatta, i giorni lavorati o da fare", () => {
    expect(statoVoce({ fatta: true, iniziata: true, giorniLavorati: 3, giorni: 5 }).testo).toBe("Fatta");
    expect(statoVoce({ fatta: false, iniziata: true, giorniLavorati: 3, giorni: 5 })).toEqual({ testo: "3/5 gg", tono: "corso" });
    expect(statoVoce({ fatta: false, iniziata: false, giorniLavorati: 0, giorni: null })).toEqual({ testo: "Da fare", tono: "fare" });
  });
});

describe("righe in fila", () => {
  const feriali = (g: string) => ![0, 6].includes(new Date(`${g}T12:00:00Z`).getUTCDay());
  const riga = (id: string, giorni: number | null, fatta = false) => ({ sottofaseId: id, descrizione: id, giorni, fatta });
  it("una dopo l'altra, saltando sabato e domenica", () => {
    // Venerdì 4 dicembre 2026: 2 giorni arrivano a lunedì 7.
    expect(dateInFila([riga("a", 2), riga("b", 1)], "2026-12-04", null, feriali).passi).toEqual([
      { id: "a", data_inizio: "2026-12-04", data_fine: "2026-12-07", giorni: 2 },
      { id: "b", data_inizio: "2026-12-08", data_fine: "2026-12-08", giorni: 1 },
    ]);
  });
  it("i giorni scritti valgono per tutte; le fatte restano fuori; quelle senza giorni si dicono", () => {
    expect(dateInFila([riga("a", null), riga("f", 5, true)], "2026-12-01", 3, feriali).passi.map((p) => p.id)).toEqual(["a"]);
    expect(dateInFila([riga("a", null)], "2026-12-01", null, feriali).senzaGiorni).toEqual(["a"]);
  });
});

describe("date in blocco", () => {
  const riga = (id: string, inizio: string | null, fine: string | null) => ({ sottofaseId: id, descrizione: `Riga ${id}`, inizio, fine, giorni: null as number | null });
  it("le date scritte sostituiscono, le altre restano", () => {
    expect(pianoInBlocco([riga("a", "2026-01-01", null)], null, "2026-02-01").passi).toEqual([{ id: "a", data_inizio: "2026-01-01", data_fine: "2026-02-01", giorni: null }]);
  });
  it("controlla anche la data già salvata sulla riga, prima di inviare", () => {
    const { incoerenti } = pianoInBlocco([riga("a", "2026-12-10", null), riga("b", null, null)], null, "2026-12-01");
    expect(incoerenti).toEqual(["Riga a"]);
  });
  it("salta le righe senza sottofase", () => {
    expect(pianoInBlocco([{ ...riga("a", null, null), sottofaseId: null }], "2026-01-01", null).passi).toEqual([]);
  });
});

describe("totali e soglie", () => {
  it("somma venduto e previsto e dice se il previsto è parziale", () => {
    const t = totaliDistinta(righeDistinta(fasi, new Map(), [voce("a", { costo_materiali: 1.5 }), voce("b")]));
    expect(t).toMatchObject({ righe: 2, venduto: 200, previsto: 15, senzaPrevisto: 1 });
  });
  it("i cantieri piccoli restano sulle schede", () => {
    expect(distintaConsigliata(30)).toBe(false);
    expect(distintaConsigliata(31)).toBe(true);
  });
  it("la fine non viene prima dell'inizio", () => {
    expect(dateValide("2026-02-01", "2026-01-01")).toBe(false);
    expect(dateValide("2026-01-01", "2026-01-01")).toBe(true);
    expect(dateValide(null, "2026-01-01")).toBe(true);
  });
});
