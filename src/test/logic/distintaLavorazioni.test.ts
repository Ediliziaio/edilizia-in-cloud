import { describe, expect, it } from "vitest";
import {
  avanzamentoFasi, contaFiltri, dateValide, distintaConsigliata, filtraDistinta, pianoInBlocco, righeDistinta, totaliDistinta, type VoceDistinta,
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
    expect(righe.map((r) => [r.voceId, r.sottofaseId])).toEqual([["v1", null], [null, "s1"]]);
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
  it("l'avanzamento di più fasi pesa sul venduto, o è la media se manca", () => {
    const f = [{ id: "a", name: "A", percentuale: 100 }, { id: "b", name: "B", percentuale: 0 }];
    expect(avanzamentoFasi(f, new Map([["a", { venduto: 300, costoPrevisto: 0, costoConsuntivo: 0 }], ["b", { venduto: 100, costoPrevisto: 0, costoConsuntivo: 0 }]]))).toBe(75);
    expect(avanzamentoFasi(f)).toBe(50);
    expect(avanzamentoFasi([])).toBeNull();
  });
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
