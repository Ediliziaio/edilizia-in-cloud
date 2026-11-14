import { describe, expect, it } from "vitest";
import { totaleConfermato, totaleDaConfermare } from "@/components/mezzi/MezzoFattureSection";
import { dividiPerAzione, type RicevutaInBlocco } from "@/lib/fatturazione/azioniInBlocco";

describe("mezzo: il totale dice anche quanto è da confermare", () => {
  const righe = [
    { importo: 100, confermata: true },
    { importo: 250.5, confermata: false },
    { importo: null, confermata: false },
    { importo: -20, confermata: true },
  ];
  it("confermato e da confermare stanno separati", () => {
    expect(totaleConfermato(righe)).toBe(80);
    expect(totaleDaConfermare(righe)).toEqual({ quante: 2, importo: 250.5 });
  });
});

describe("conferma mezzi in blocco dalle fatture ricevute", () => {
  const base: RicevutaInBlocco = { id: "1", numero: "1", totale: 100, stato: "letta", tipo: "TD01", pagataIl: null, pagataSulCosto: false,
    verificata: false, stornata: false, storico: false, notaSenzaOrdine: false, conOrdine: false, scadenze: [] };
  it("fuori solo le rifiutate e quelle che si sa senza proposte", () => {
    const s = dividiPerAzione("mezzi", [
      base,
      { ...base, id: "2", stato: "rifiutata" },
      { ...base, id: "3", mezziDaConfermare: 0 },
      { ...base, id: "4", mezziDaConfermare: 2 },
    ]);
    expect(s.idonee.map((r) => r.id)).toEqual(["1", "4"]);
    expect(s.escluse).toEqual([{ motivo: "rifiutata", quante: 1 }, { motivo: "nessun mezzo da confermare", quante: 1 }]);
  });
});
