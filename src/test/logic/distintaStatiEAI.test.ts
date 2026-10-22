import { describe, expect, it } from "vitest";
import { acquistabile, azioniFase, puoModificareMateriali, type PermessiMateriali } from "@/lib/distinta/statiFase";
import { leggiJson, pulisciScomposizioni, pulisciSimboli } from "../../../supabase/functions/_shared/distintaAI";

const nessuno: PermessiMateriali = { canEditOrders: false, canValidateBom: false, canManagePurchasing: false };
const ufficio = { ...nessuno, canEditOrders: true };
const tecnico = { ...nessuno, canValidateBom: true };
const acquisti = { ...nessuno, canManagePurchasing: true };
const righe = { totale: 10, senzaQuantita: 0, inAcquisto: 0 };

describe("stato dei materiali di una fase: i pulsanti giusti a chi può", () => {
  it("bozza (o fase che non usa la validazione): chi prepara invia al tecnico; vuota no", () => {
    expect(azioniFase("bozza", ufficio, righe)).toEqual(["invia_validazione"]);
    expect(azioniFase(null, ufficio, righe)).toEqual(["invia_validazione"]);
    expect(azioniFase("bozza", ufficio, { ...righe, totale: 0 })).toEqual([]);
    expect(azioniFase("bozza", acquisti, righe)).toEqual([]);
  });

  it("dal tecnico: solo lui valida o rimanda; con quantità mancanti non valida", () => {
    expect(azioniFase("da_validare", ufficio, righe)).toEqual([]);
    expect(azioniFase("da_validare", tecnico, righe)).toEqual(["valida", "rimanda"]);
    expect(azioniFase("da_validare", tecnico, { ...righe, senzaQuantita: 2 })).toEqual(["rimanda"]);
  });

  it("validati: il tecnico li riapre solo se niente è già in offerta o in un ordine", () => {
    expect(azioniFase("validata", tecnico, righe)).toEqual(["rimanda"]);
    expect(azioniFase("validata", tecnico, { ...righe, inAcquisto: 1 })).toEqual([]);
    expect(azioniFase("validata", acquisti, righe)).toEqual([]);
  });

  it("chi modifica i materiali e quando si possono comprare", () => {
    expect(puoModificareMateriali(null, ufficio)).toBe(true);
    expect(puoModificareMateriali("da_validare", ufficio)).toBe(false);
    expect(puoModificareMateriali("da_validare", tecnico)).toBe(true);
    expect(puoModificareMateriali("validata", tecnico)).toBe(false);
    expect([acquistabile(null), acquistabile("bozza"), acquistabile("da_validare"), acquistabile("validata")]).toEqual([true, false, false, true]);
  });
});

describe("risposte dell'AI ripulite", () => {
  it("scomposizioni: solo voci richieste, componenti con quantità sensate, sfrido nei limiti", () => {
    const r = pulisciScomposizioni(leggiJson("```json\n" + JSON.stringify({
      scomposizioni: [
        { voce_id: "v1", nome: "Punto presa", parole_chiave: ["punto presa", ""], componenti: [
          { descrizione: "Scatola 503", unita_misura: "pz", quantita_per_unita: 1, sfrido_percentuale: 0 },
          { descrizione: "Cavo FS17 1x2,5", unita_misura: "m", quantita_per_unita: "18,5", sfrido_percentuale: 300 },
          { descrizione: "", quantita_per_unita: 1 },
          { descrizione: "Niente", quantita_per_unita: 0 },
        ] },
        { voce_id: "estranea", nome: "x", componenti: [{ descrizione: "y", quantita_per_unita: 1 }] },
        { voce_id: "v1", nome: "doppione", componenti: [] },
      ],
    }) + "\n```"), ["v1"]);
    expect(r).toHaveLength(1);
    expect(r[0].parole_chiave).toEqual(["punto presa"]);
    expect(r[0].componenti.map((c) => [c.descrizione, c.quantita_per_unita, c.sfrido_percentuale])).toEqual([
      ["Scatola 503", 1, 0],
      ["Cavo FS17 1x2,5", 18.5, 50],
    ]);
  });

  it("simboli: solo quelli della legenda, quantità intere, confidenza tra 0 e 1, doppioni sommati", () => {
    const r = pulisciSimboli({
      simboli: [
        { simbolo: "punto luce a soffitto", quantita: 3, confidenza: 0.9 },
        { simbolo: "PUNTO LUCE A SOFFITTO", quantita: 2, confidenza: 0.4 },
        { simbolo: "Sedia", quantita: 4, confidenza: 1 },
        { simbolo: "RILEVATORE OTTICO DI FUMO", quantita: -1 },
        { simbolo: "PRESE ELETTRICHE 10/16A", quantita: 2, confidenza: 7 },
      ],
    }, ["PUNTO LUCE A SOFFITTO", "RILEVATORE OTTICO DI FUMO", "PRESE ELETTRICHE 10/16A"]);
    expect(r).toEqual([
      { simbolo: "PUNTO LUCE A SOFFITTO", quantita: 5, confidenza: 0.4, note: null },
      { simbolo: "PRESE ELETTRICHE 10/16A", quantita: 2, confidenza: 1, note: null },
    ]);
    expect(leggiJson("non json")).toBeNull();
  });
});
