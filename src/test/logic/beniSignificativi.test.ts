// Beni significativi (art. 7 c. 1 lett. b L. 488/1999, DM 29/12/1999): IVA al
// 10% sui beni solo fino al valore del resto della prestazione, e la fattura
// che lo dice. Stesso conto dei preventivi serramenti (calcolaIvaMista).
import { describe, it, expect } from "vitest";
import { ripartoBeniSignificativi, righeBeniSignificativi } from "@/lib/fatturazione/beniSignificativi";

describe("beni significativi", () => {
  it("caldaia 2.000 € con 800 € di manodopera: 1.600 al 10%, 1.200 al 22%", () => {
    // Limite: i beni stanno al 10% fino a 800 (il resto della prestazione).
    expect(ripartoBeniSignificativi({ valoreBeni: 2000, valoreAltro: 800 })).toEqual({ imponibile10: 1600, imponibile22: 1200 });
  });

  it("beni che non superano il resto: tutto al 10%", () => {
    expect(ripartoBeniSignificativi({ valoreBeni: 1000, valoreAltro: 1500 })).toEqual({ imponibile10: 2500, imponibile22: 0 });
    expect(ripartoBeniSignificativi({ valoreBeni: 1000, valoreAltro: 1000 })).toEqual({ imponibile10: 2000, imponibile22: 0 });
  });

  it("solo beni senza posa: niente 10% sui beni", () => {
    expect(ripartoBeniSignificativi({ valoreBeni: 3000, valoreAltro: 0 })).toEqual({ imponibile10: 0, imponibile22: 3000 });
  });

  it("le righe dicono cosa è stato fornito e per quanto, e il totale torna", () => {
    const righe = righeBeniSignificativi(
      { intervento: "Sostituzione caldaia", beni: "Caldaia a condensazione 25 kW", valoreBeni: 2000, valoreAltro: 800 },
      3,
    );
    expect(righe).toHaveLength(2);
    expect(righe[0]).toMatchObject({ numero_linea: 3, aliquota_iva: "10", prezzo_unitario: 1600, quantita: 1 });
    expect(righe[0].descrizione).toMatch(/Sostituzione caldaia\. Beni significativi forniti: Caldaia a condensazione 25 kW, valore 2\.?000,00 €/);
    expect(righe[0].descrizione).toMatch(/DM 29\/12\/1999/);
    expect(righe[1]).toMatchObject({ numero_linea: 4, aliquota_iva: "22", prezzo_unitario: 1200 });
    expect(righe[0].prezzo_unitario + righe[1].prezzo_unitario).toBe(2800);
  });

  it("sotto il limite una riga sola", () => {
    expect(righeBeniSignificativi({ intervento: "Posa infissi", beni: "Infissi in PVC", valoreBeni: 900, valoreAltro: 1200 }, 1)).toHaveLength(1);
  });
});

// ─── Il conto di Fabio (FPR 73/26, 02/10/2026) ──────────────────────────────
import {
  altrePrestazioniDalleRighe, causaliConValoreBeni, contoDalTotaleConcordato, contoDalValoreBeni, noteConValoreBeni, righeConBeniSignificativi,
} from "@/lib/fatturazione/beniSignificativi";
import { calcolaTotaliDocumento } from "@/lib/fatturazione/calcoli";
import type { RigaDocumento } from "@/types/fatturazione";

const r = (n: number, descrizione: string, prezzo: number, aliquota = "10", q = 1): RigaDocumento => ({
  id: `r${n}`, numero_linea: n, descrizione, quantita: q, unita_misura: "pz", prezzo_unitario: prezzo,
  aliquota_iva: aliquota, imponibile: 0, imposta: 0, totale_riga: 0,
} as RigaDocumento);

// Le altre prestazioni di FPR 73/26: manodopera, zanzariere (13 × 240), smaltimento, materiale di consumo.
const altre73 = [r(1, "manodopera", 6500), r(2, "zanzariere", 240, "10", 13), r(3, "smaltimento", 600), r(4, "materiale di consumo", 900)];

describe("conto dal prezzo concordato", () => {
  it("le altre prestazioni si leggono dalle righe (a zero e beni significativi esclusi)", () => {
    const righe = [...altre73, r(5, "info", 0), { ...r(6, "bene", 5000), categoria: "bene_significativo" } as RigaDocumento, r(7, "consulenza", 100, "22")];
    expect(altrePrestazioniDalleRighe(righe)).toEqual({ al10: 11120, al22: 100 });
  });

  it("FPR 73/26: 27.500 € con 11.120 € di altre prestazioni → beni 13.608,52, di cui 11.120 al 10% e 2.488,52 al 22%", () => {
    const c = contoDalTotaleConcordato(27500, { al10: 11120, al22: 0 })!;
    expect(c.valoreBeni).toBe(13608.52);
    expect(c.quota10).toBe(11120);
    expect(c.quota22).toBe(2488.52);
  });

  it("le righe tornano al centesimo sul totale concordato (11.119,99 al 10% e 2.488,53 al 22%, come a mano)", () => {
    const c = contoDalTotaleConcordato(27500, { al10: 11120, al22: 0 })!;
    const out = righeConBeniSignificativi({ beni: "16 infissi + 1 portoncino", conto: c, righeEsistenti: altre73, primoNumero: 5, totaleConcordato: 27500, conRigaCorrispettivo: true });
    expect(out.totale).toBe(27500);
    expect(out.centesimiSpostati).toBe(1);
    const aliquote = out.righe.map((x) => [x.descrizione, x.aliquota_iva, x.prezzo_unitario]);
    expect(aliquote).toEqual([
      ["corrispettivo imponibile pattuito 25000 euro", "10", 0],
      ["valore bene significativo (dm 29/12/1999) 13608.52", "10", 0],
      ["16 infissi + 1 portoncino bene significativo", "10", 11119.99],
      ["16 infissi + 1 portoncino — quota residua beni significativi", "22", 2488.53],
    ]);
    const t = calcolaTotaliDocumento([...altre73, ...out.righe]);
    expect(t.imponibile_totale).toBe(24728.52);
    expect(t.iva_totale).toBe(2771.48);
    expect(t.riepilogo_iva.map((x) => [x.aliquota, x.imponibile, x.imposta])).toEqual([["10", 22239.99, 2224], ["22", 2488.53, 547.48]]);
  });

  it("beni dentro il limite: tutto al 10%, una riga sola, totale esatto", () => {
    const altre = [r(1, "posa", 5000)];
    const c = contoDalTotaleConcordato(8800, { al10: 5000, al22: 0 })!; // 8800/1,1 = 8000 → beni 3000 ≤ 5000
    expect(c).toEqual({ valoreBeni: 3000, quota10: 3000, quota22: 0 });
    const out = righeConBeniSignificativi({ beni: "3 infissi", conto: c, righeEsistenti: altre, primoNumero: 2, totaleConcordato: 8800 });
    expect(out.righe.filter((x) => x.prezzo_unitario > 0)).toHaveLength(1);
    expect(out.totale).toBe(8800);
  });

  it("totale troppo basso per le altre prestazioni: nessun conto", () => {
    expect(contoDalTotaleConcordato(5000, { al10: 6000, al22: 0 })).toBeNull();
  });

  it("dal valore dei beni (già noto): limite = altre prestazioni", () => {
    expect(contoDalValoreBeni(2000, { al10: 800, al22: 0 })).toEqual({ valoreBeni: 2000, quota10: 800, quota22: 1200 });
    expect(contoDalValoreBeni(1000, { al10: 1500, al22: 0 })).toEqual({ valoreBeni: 1000, quota10: 1000, quota22: 0 });
  });

  it("per molti prezzi concordati il totale torna sempre al centesimo", () => {
    for (let g = 3000; g <= 60000; g += 733.37) {
      const G = Math.round(g * 100) / 100;
      const c = contoDalTotaleConcordato(G, { al10: 2500.5, al22: 0 });
      if (!c) continue;
      const out = righeConBeniSignificativi({ beni: "infissi", conto: c, righeEsistenti: [r(1, "posa", 2500.5)], primoNumero: 2, totaleConcordato: G });
      expect(Math.abs(out.totale - G), `G=${G}`).toBeLessThanOrEqual(0.02);
    }
  });
});

describe("frase del valore dei beni", () => {
  it("si aggiunge alle note una volta sola e si aggiorna se cambia", () => {
    const a = noteConValoreBeni("Fornitura e posa infissi", 13608.52);
    expect(a).toContain("il valore complessivo dei beni significativi è pari a € 13608.52");
    const b = noteConValoreBeni(a, 9000);
    expect(b.match(/valore complessivo dei beni significativi/g)).toHaveLength(1);
    expect(b).toContain("€ 9000");
    expect(b).toContain("Fornitura e posa infissi");
  });
});

describe("causale con il valore dei beni (arriva nell'XML)", () => {
  it("una volta sola, e si aggiorna se cambia il valore", () => {
    const a = causaliConValoreBeni(["Detrazione 50%"], 13608.52);
    expect(a).toEqual(["Detrazione 50%", "Ai fini dell'art. 7 comma 1 lett. b) L. 488/1999 e DM 29/12/1999 il valore complessivo dei beni significativi è pari a € 13608.52"]);
    const b = causaliConValoreBeni(a, 9000);
    expect(b).toHaveLength(2);
    expect(b[1]).toContain("€ 9000");
    expect(causaliConValoreBeni(undefined, 100)).toHaveLength(1);
  });
});
