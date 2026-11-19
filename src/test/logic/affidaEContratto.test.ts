/**
 * «Affida e manda il contratto» (11/11/2026): il conto della tabella, le righe del contratto coi prezzi
 * scritti, e cosa succede se la ditta ha già un contratto sulla commessa.
 */
import { describe, expect, it } from "vitest";
import { contoTabella, destinoContratto, elencoUnito, prezzoDalVenduto, rigaContrattoACorpo, righeContratto } from "@/lib/subappaltatori/affidaEContratto";

import type { VoceLavoro } from "@/lib/orders/ditteLavori";
import { statoVoce } from "@/lib/subappaltatori/affidamentiCommessa";

const voci: Array<VoceLavoro & { importo: number; costo_materiali: number }> = [
  { id: "v1", phase_id: "f1", position: 1, descrizione: "Demolizione tramezzi", subphase_id: "sf1", unita: "mq", quantita: 120, costo_manodopera: 0, tariffa_id: null, importo: 2160, costo_materiali: 0 },
  { id: "v2", phase_id: "f1", position: 2, descrizione: "Massetto", unita: "mq", quantita: 100, costo_manodopera: 0, tariffa_id: "t", importo: 2500, costo_materiali: 5 },
];
const fasi = [{ id: "f1", name: "Demolizioni", position: 1 }];

describe("affida e manda il contratto", () => {
  it("il conto: costo, venduto della parte affidata, materiali nostri se solo posa, margine", () => {
    const c = contoTabella([{ voceId: "v1", quantita: 60, prezzo: 9 }, { voceId: "v2", quantita: 100, prezzo: 12 }], voci, () => 1000, "posa");
    expect(c).toMatchObject({ costo: 1740, venduto: 3580, materiali: 500, margine: 1340, errori: [] });
    expect(contoTabella([{ voceId: "v2", quantita: 100, prezzo: 12 }], voci, () => 1000, "fornitura_e_posa").materiali).toBe(0);
  });

  it("le righe da sistemare: quantità mancante o oltre il libero, prezzo mancante o non al centesimo", () => {
    const { errori } = contoTabella([
      { voceId: "v1", quantita: 0, prezzo: 9 },
      { voceId: "v2", quantita: 101, prezzo: null },
    ], voci, (id) => (id === "v2" ? 100 : 120), "posa");
    expect(errori).toEqual([
      { voceId: "v1", motivo: "Quantità mancante" },
      { voceId: "v2", motivo: "Oltre la quantità libera" },
      { voceId: "v2", motivo: "Prezzo mancante" },
    ]);
    expect(contoTabella([{ voceId: "v1", quantita: 1, prezzo: 9.125 }], voci, () => 120, "posa").errori[0].motivo).toBe("Prezzo al centesimo");
  });

  it("le righe del contratto: solo le voci scelte, coi prezzi della tabella e gli id delle quote", () => {
    const quote = [
      { id: "a1", voce_id: "v1", subappaltatore_id: "d", quantita: 60, prezzo_unitario: 8, origine_prezzo: "listino_ditta" as const, comprende: "posa" as const, stato: "bozza" as const },
      { id: "a2", voce_id: "v2", subappaltatore_id: "d", quantita: 100, prezzo_unitario: null, origine_prezzo: "manuale" as const, comprende: "posa" as const, stato: "bozza" as const },
      { id: "a3", voce_id: "v2", subappaltatore_id: "altra", quantita: 5, prezzo_unitario: 1, origine_prezzo: "manuale" as const, comprende: "posa" as const, stato: "bozza" as const },
    ];
    const r = righeContratto(fasi, voci, quote, "d", [{ voceId: "v1", quantita: 60, prezzo: 9 }],
      [{ id: "sf1", phase_id: "f1", name: "Tramezzi interni" }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ voce_id: "v1", affidamento_id: "a1", quantita: 60, prezzo: 9, importo: 540, comprende: "posa", fase: "Demolizioni", sottofase: "Tramezzi interni" });
  });

  it("80 m² a prezzo concordato più un lavoro a corpo producono 2.040 € e lasciano disponibili 40 m²", () => {
    const fase = { id: "pav", name: "Pavimenti" };
    const voce = { ...voci[0], phase_id: fase.id, descrizione: "Posa pavimento", unita: "m²" };
    const quota = { id: "q", voce_id: voce.id, subappaltatore_id: "d", quantita: 80, prezzo_unitario: 16,
      origine_prezzo: "listino_ditta" as const, comprende: "posa" as const, stato: "bozza" as const };
    const misurate = righeContratto([fase], [voce], [quota], "d", [{ voceId: voce.id, quantita: 80, prezzo: 18 }]);
    const { elenco, importo } = elencoUnito(misurate, [rigaContrattoACorpo(fase, " Preparazione del fondo ", 600)]);
    expect(importo).toBe(2040);
    expect(elenco[0]).toMatchObject({ quantita: 80, prezzo: 18, importo: 1440, affidamento_id: quota.id });
    expect(elenco[1]).toEqual({ fase_id: "pav", fase: "Pavimenti", descrizione: "Preparazione del fondo",
      unita: "a corpo", quantita: 1, prezzo: 600, importo: 600 });
    expect(statoVoce(voce, [{ ...quota, prezzo_unitario: 18 }]).residua).toBe(40);
  });

  it("il contratto della ditta: nuovo, in coda a quello in bozza, o fermo se firmato o in firma", () => {
    expect(destinoContratto(null, false)).toEqual({ tipo: "nuovo" });
    expect(destinoContratto({ id: "c", firmato_il: null, stato: "bozza", elenco_lavori: [] }, false)).toEqual({ tipo: "aggiungi", id: "c" });
    expect(destinoContratto({ id: "c", firmato_il: null, stato: "bozza", elenco_lavori: [] }, true)).toMatchObject({ tipo: "blocca" });
    expect(destinoContratto({ id: "c", firmato_il: "2026-11-11", stato: "attivo", elenco_lavori: [] }, false).tipo).toBe("blocca");
    const u = elencoUnito([{ fase: "A", descrizione: "x", unita: "mq", quantita: 2, prezzo: 5, importo: 10 }], [{ fase: "B", descrizione: "y", unita: "mq", quantita: 1, prezzo: 7, importo: 7 }]);
    expect(u.importo).toBe(17);
    expect(u.elenco).toHaveLength(2);
  });

  it("il testo della riga si può cambiare per il contratto; la voce della commessa resta com'è", () => {
    const quote = [{ id: "a1", voce_id: "v1", subappaltatore_id: "d", quantita: 60, prezzo_unitario: 8, origine_prezzo: "listino_ditta" as const, comprende: "posa" as const, stato: "bozza" as const }];
    const [r] = righeContratto(fasi, voci, quote, "d", [{ voceId: "v1", quantita: 60, prezzo: 9, descrizione: "  Demolizione tramezzi in forati sp. 8 cm  " }]);
    expect(r.descrizione).toBe("Demolizione tramezzi in forati sp. 8 cm");
    expect(righeContratto(fasi, voci, quote, "d", [{ voceId: "v1", quantita: 60, prezzo: 9, descrizione: "  " }])[0].descrizione).toBe("Demolizione tramezzi");
  });

  it("prezzo dal venduto meno una percentuale, al centesimo; niente se manca il venduto", () => {
    expect(prezzoDalVenduto(voci[0], 30)).toBe(12.6); // 2160 / 120 = 18 €/mq − 30%
    expect(prezzoDalVenduto({ id: "x", quantita: 0, importo: 100 }, 10)).toBeNull();
    expect(prezzoDalVenduto({ id: "x", quantita: 3, importo: null }, 10)).toBeNull();
    expect(prezzoDalVenduto(voci[0], 100)).toBeNull();
  });
});
