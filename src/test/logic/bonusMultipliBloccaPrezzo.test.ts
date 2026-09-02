import { describe, it, expect } from "vitest";
import {
  bonusLineFromPreset,
  bonusLineVuota,
  assorbiResiduoSullUltima,
  residuoBonus,
  totaleImponibileBonus,
  lordoRiga,
  ritenutaRiga,
  nettoIncassatoRiga,
  detrazioneRiga,
  sforaTetto,
  totaliBonus,
  validaBonusLines,
  causaleBonificoParlante,
  parseBonusLines,
  serializeBonusLines,
  type BonusLine,
} from "@/lib/orders/bonusFiscali";
import {
  daRestituire,
  totaleTrattenuto,
  movimentiCassa,
  saldoCassa,
  avvisiBloccaPrezzo,
  parseBloccaPrezzo,
  serializeBloccaPrezzo,
  type BloccaPrezzo,
} from "@/lib/orders/bloccaPrezzo";

// Il caso reale: contratto 20.000 € imponibile, IVA 10%, metà Ecobonus infissi
// e metà misure antintrusione → due pratiche, due bonifici parlanti.
const caseKeBei = (): BonusLine[] => [
  bonusLineFromPreset("ecobonus", 0, 10_000),
  bonusLineFromPreset("sicurezza_50", 1, 10_000),
];

describe("bonus edilizi multipli — ripartizione", () => {
  it("il preset precompila label, aliquota e causale", () => {
    const l = bonusLineFromPreset("sicurezza_50", 0, 10_000);
    expect(l.label).toBe("Misure antintrusione / sicurezza");
    expect(l.aliquotaDetrazione).toBe(50);
    expect(l.causale).toContain("art. 16-bis");
  });

  it("la somma delle righe deve tornare col totale commessa", () => {
    const lines = caseKeBei();
    expect(totaleImponibileBonus(lines)).toBe(20_000);
    expect(residuoBonus(20_000, lines)).toBe(0);
    expect(validaBonusLines(20_000, lines, 10).ok).toBe(true);
  });

  it("segnala il residuo mancante e l'eccedenza", () => {
    const parziale = [bonusLineFromPreset("ecobonus", 0, 10_000)];
    const esito = validaBonusLines(20_000, parziale, 10);
    expect(esito.ok).toBe(false);
    expect(residuoBonus(20_000, parziale)).toBe(10_000);
    expect(esito.errori.join(" ")).toContain("Mancano");

    const troppo = [bonusLineFromPreset("ecobonus", 0, 25_000)];
    expect(validaBonusLines(20_000, troppo, 10).errori.join(" ")).toContain("in più");
  });

  it("l'ultima riga assorbe il resto: nessuna deriva su importi non divisibili", () => {
    const lines = [bonusLineVuota(0, 3_333.33), bonusLineVuota(1, 0), bonusLineVuota(2, 0)];
    lines[1].imponibile = 3_333.33;
    const quadrate = assorbiResiduoSullUltima(10_000, lines);
    expect(totaleImponibileBonus(quadrate)).toBe(10_000);
    expect(quadrate[2].imponibile).toBe(3_333.34);
  });

  it("l'assorbimento non produce importi negativi se le prime righe sforano", () => {
    const lines = [bonusLineVuota(0, 15_000), bonusLineVuota(1, 0)];
    const quadrate = assorbiResiduoSullUltima(10_000, lines);
    expect(quadrate[1].imponibile).toBe(0);
  });
});

describe("bonus edilizi multipli — ritenuta e detrazione", () => {
  it("la ritenuta 11% sta sull'imponibile, non sul lordo", () => {
    const [riga] = caseKeBei();
    expect(lordoRiga(riga, 10)).toBe(11_000);
    expect(ritenutaRiga(riga)).toBe(1_100); // 11% di 10.000, NON di 11.000
    expect(nettoIncassatoRiga(riga, 10)).toBe(9_900);
  });

  it("la somma delle ritenute per riga fa la ritenuta totale della commessa", () => {
    const t = totaliBonus(caseKeBei(), 10);
    // Stesso numero della vecchia formula: (totale ivato / 1,10) × 11%.
    expect(t.ritenuta).toBe(round2((22_000 / 1.1) * 0.11));
    expect(t.ritenuta).toBe(2_200);
    expect(t.lordo).toBe(22_000);
    expect(t.netto).toBe(19_800);
  });

  it("la detrazione del cliente si calcola sul lordo IVA inclusa", () => {
    const [riga] = caseKeBei();
    expect(detrazioneRiga(riga, 10)).toBe(5_500); // 50% di 11.000, non di 10.000
  });

  it("la detrazione si ferma al tetto del preset e lo segnala", () => {
    const riga = bonusLineFromPreset("ecobonus", 0, 80_000); // tetto 60.000
    expect(sforaTetto(riga, 10)).toBe(true);
    expect(detrazioneRiga(riga, 10)).toBe(30_000); // 50% di 60.000, non di 88.000
    expect(validaBonusLines(80_000, [riga], 10).avvisi.join(" ")).toContain("tetto");
  });

  it("le agevolazioni senza bonifico parlante non subiscono ritenuta", () => {
    const mobili = bonusLineFromPreset("bonus_mobili", 0, 4_000);
    expect(ritenutaRiga(mobili)).toBe(0);
    expect(causaleBonificoParlante(mobili)).toContain("non richiede bonifico parlante");
  });

  it("avvisa se la stessa agevolazione è spezzata su due righe", () => {
    const lines = [bonusLineFromPreset("ecobonus", 0, 5_000), bonusLineFromPreset("ecobonus", 1, 5_000)];
    expect(validaBonusLines(10_000, lines, 10).avvisi.join(" ")).toContain("già usata");
  });
});

describe("bonus edilizi multipli — causali e persistenza", () => {
  it("la causale porta norma, CF del cliente e P.IVA dell'impresa", () => {
    const [, sicurezza] = caseKeBei();
    const causale = causaleBonificoParlante(sicurezza, {
      cfBeneficiario: "RSSMRA80A01H501U",
      pivaImpresa: "01234567890",
      numeroFattura: "12/2026",
      dataFattura: "2026-09-02",
    });
    expect(causale).toContain("art. 16-bis c.1 lett. f)");
    expect(causale).toContain("RSSMRA80A01H501U");
    expect(causale).toContain("01234567890");
    expect(causale).toContain("12/2026");
  });

  it("serialize → parse è un giro chiuso (posizioni rinumerate)", () => {
    const serializzate = serializeBonusLines(caseKeBei());
    expect(serializzate.map((r) => r.position)).toEqual([0, 1]);
    const riparse = parseBonusLines(serializzate);
    expect(riparse.map((l) => l.imponibile)).toEqual([10_000, 10_000]);
    expect(riparse.map((l) => l.presetId)).toEqual(["ecobonus", "sicurezza_50"]);
  });

  it("parse regge jsonb sporco: null, ordine invertito, numeri come stringa", () => {
    const righe = parseBonusLines([
      null,
      { position: 1, preset_id: "sicurezza_50", label: "Sicurezza", imponibile: "10000.5" },
      { position: 0, preset_id: "ecobonus", label: "Ecobonus", imponibile: 9_999.5 },
    ]);
    expect(righe.map((r) => r.presetId)).toEqual(["ecobonus", "sicurezza_50"]);
    expect(totaleImponibileBonus(righe)).toBe(20_000);
  });
});

// ── Blocca prezzo ───────────────────────────────────────────────────────────

const incassato = (over: Partial<BloccaPrezzo> = {}): BloccaPrezzo => ({
  companyId: "c1",
  importo: 2_000,
  dataIncasso: "2026-03-01",
  metodo: "bonifico_ordinario",
  stato: "incassato",
  orderId: "o1",
  ...over,
});

describe("blocca prezzo", () => {
  it("conta quanto va ancora restituito", () => {
    const rows = [incassato(), incassato({ importo: 500, stato: "restituito", dataEsito: "2026-04-01" })];
    expect(daRestituire(rows)).toBe(2_000);
    expect(totaleTrattenuto(rows)).toBe(0);
  });

  it("in cassa: entrata all'incasso, uscita alla restituzione, netto zero", () => {
    const rows = [incassato({ stato: "restituito", dataEsito: "2026-04-01" })];
    const mov = movimentiCassa(rows);
    expect(mov.map((m) => m.verso)).toEqual(["entrata", "uscita"]);
    expect(saldoCassa(rows)).toBe(0);
  });

  it("il trattenuto resta in cassa (nessuna uscita)", () => {
    const rows = [incassato({ stato: "trattenuto", dataEsito: "2026-04-01" })];
    expect(movimentiCassa(rows).map((m) => m.verso)).toEqual(["entrata"]);
    expect(saldoCassa(rows)).toBe(2_000);
  });

  it("avvisa di restituire prima dei bonifici parlanti", () => {
    const avvisi = avvisiBloccaPrezzo([incassato()], { hasBuildingBonus: true });
    expect(avvisi[0].livello).toBe("attenzione");
    expect(avvisi[0].testo).toContain("prima che il cliente faccia i bonifici parlanti");
  });

  it("è GRAVE se il saldo è già pagato e il blocca prezzo è ancora aperto", () => {
    const avvisi = avvisiBloccaPrezzo([incassato()], { hasBuildingBonus: true, saldoPagato: true });
    expect(avvisi[0].livello).toBe("grave");
    expect(avvisi[0].testo).toContain("più del dovuto");
  });

  it("il trattenuto va escluso dalla causale del bonifico parlante", () => {
    const avvisi = avvisiBloccaPrezzo([incassato({ stato: "trattenuto", dataEsito: "2026-04-01" })], {
      hasBuildingBonus: true,
    });
    expect(avvisi.some((a) => a.testo.includes("non ha detrazione"))).toBe(true);
  });

  it("nessun avviso se tutto è stato restituito", () => {
    const rows = [incassato({ stato: "restituito", dataEsito: "2026-04-01" })];
    expect(avvisiBloccaPrezzo(rows, { hasBuildingBonus: true })).toEqual([]);
  });

  it("serialize mette una data esito quando lo stato la pretende (vincolo DB)", () => {
    const row = serializeBloccaPrezzo(
      { ...incassato(), stato: "restituito", dataEsito: null },
      new Date(2026, 8, 2),
    );
    expect(row.data_esito).toBe("2026-09-02");
    expect(serializeBloccaPrezzo(incassato()).data_esito).toBeNull();
  });

  it("parse normalizza stati e metodi sconosciuti invece di fidarsi del DB", () => {
    const [row] = parseBloccaPrezzo([
      { id: "x", company_id: "c1", importo: "1500,50", stato: "boh", metodo: "bitcoin" },
    ]);
    expect(row.stato).toBe("incassato");
    expect(row.metodo).toBe("altro");
    expect(row.importo).toBe(1_500.5);
  });
});

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
