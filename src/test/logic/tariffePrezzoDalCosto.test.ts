import { describe, expect, it } from "vitest";
import {
  costoPieno,
  formatRicarico,
  margineDaRicarico,
  marginePrezzo,
  prezzoAttesoDalCosto,
  prezzoDaRiallineare,
  prezzoDaRicarico,
  ricaricoDaMargine,
  ricaricoDaPrezzo,
} from "@/lib/tariffe/prezzoDalCosto";

describe("prezzo dal costo", () => {
  it("ricarico e margine sono due numeri diversi", () => {
    // il caso di Best Infissi: +20% sul costo è un margine del 16,7%
    expect(margineDaRicarico(20)).toBeCloseTo(16.6667, 3);
    // l'obiettivo del 25% di margine chiede un ricarico del 33,3%
    expect(ricaricoDaMargine(25)).toBeCloseTo(33.3333, 3);
    // andata e ritorno tornano
    expect(margineDaRicarico(ricaricoDaMargine(40)!)).toBeCloseTo(40, 6);
  });

  it("le spese generali entrano nel costo pieno", () => {
    expect(costoPieno(100, 8)).toBe(108);
    expect(costoPieno(100, null)).toBe(100);
    expect(costoPieno(100, -5)).toBe(100);
    expect(costoPieno(null, 8)).toBeNull();
  });

  it("il prezzo è costo pieno × (1 + ricarico)", () => {
    expect(prezzoDaRicarico(108, 30)).toBe(140.4);
    expect(prezzoDaRicarico(0, 30)).toBe(0);
    expect(prezzoDaRicarico(100, -1)).toBeNull();
    expect(prezzoDaRicarico(null, 30)).toBeNull();
    // al centesimo da 1 € in su; sotto, quattro decimali (voci da millesimi al pezzo)
    expect(prezzoDaRicarico(12.3456, 33.3333)).toBe(16.46);
    expect(prezzoDaRicarico(0.0044, 25)).toBe(0.0055);
    // oltre il massimo del database non c'è prezzo
    expect(prezzoDaRicarico(100, 10000)).toBeNull();
  });

  it("un margine del 100% non ha ricarico", () => {
    expect(ricaricoDaMargine(100)).toBeNull();
    expect(ricaricoDaMargine(-3)).toBeNull();
  });

  it("dal prezzo libero si risale a ricarico e margine", () => {
    expect(ricaricoDaPrezzo(130, 100)).toBeCloseTo(30, 6);
    expect(marginePrezzo(130, 100)).toBeCloseTo(23.0769, 3);
    expect(ricaricoDaPrezzo(130, 0)).toBeNull();
    expect(marginePrezzo(0, 100)).toBeNull();
  });

  it("solo le voci «dal costo» si ricalcolano, e solo se il prezzo non torna", () => {
    const voce = { prezzo_modo: "dal_costo", ricarico_pct: 30, prezzo_vendita: 130 };
    expect(prezzoAttesoDalCosto(voce, 100, 0)).toBe(130);
    expect(prezzoDaRiallineare(voce, 100, 0)).toBe(false);
    // il costo è salito a 110: il prezzo dovrebbe essere 143
    expect(prezzoAttesoDalCosto(voce, 110, 0)).toBe(143);
    expect(prezzoDaRiallineare(voce, 110, 0)).toBe(true);
    // una voce libera non si tocca mai
    expect(prezzoDaRiallineare({ ...voce, prezzo_modo: "libero" }, 110, 0)).toBe(false);
    // senza costo, o con un costo a zero, non si inventa un prezzo
    expect(prezzoAttesoDalCosto(voce, null, 0)).toBeNull();
    expect(prezzoAttesoDalCosto(voce, 0, 0)).toBeNull();
    expect(prezzoDaRiallineare(voce, 0, 0)).toBe(false);
  });

  it("una voce salvata dal costo non risulta «da aggiornare» appena salvata", () => {
    // i casi trovati nella rilettura: margine 40% su 1000 €, ricarico dell'obiettivo con spese generali
    for (const [costo, sg, r] of [[1000, 0, 66.666666], [1234.56, 8, 33.333333], [700, 8, 32.2738]] as const) {
      const prezzo = prezzoDaRicarico(costoPieno(costo, sg), r)!;
      const salvata = { prezzo_modo: "dal_costo", ricarico_pct: Math.round(r * 1e4) / 1e4, prezzo_vendita: prezzo };
      expect(prezzoDaRiallineare(salvata, costo, sg), `${costo}/${sg}/${r}`).toBe(false);
    }
  });

  it("il ricarico si legge con il segno", () => {
    expect(formatRicarico(30)).toBe("+30%");
    expect(formatRicarico(33.33333)).toBe("+33,33%");
    expect(formatRicarico(-12.5)).toBe("−12,5%");
    expect(formatRicarico(null)).toBe("—");
  });
});
