/**
 * La fattura fatta su una rata non chiede al cliente più di quanto la rata dice
 * (04/11/2026).
 *
 * Con l'IVA non tutti i totali esistono: l'imposta si calcola sull'imponibile in centesimi
 * interi, e al 22% circa un lordo su cinque non è raggiungibile — per 100,01 € si può fare
 * solo 100,00 o 100,02. Misurato su 300.000 importi: nessuno dei casi storti ha una
 * soluzione esatta, quindi non si tratta di calcolare meglio. Quello che si può garantire
 * è il verso: mai sopra. Prima lo scorporo poteva andare di un centesimo oltre, e la
 * differenza passava in silenzio perché l'avviso di scostamento tollera un euro.
 */
import { describe, expect, it } from "vitest";
import { imponibileDalLordo } from "@/components/orders/CreaFatturaDialog";
import { impostaSuImponibile } from "@/lib/fatturazione/calcoli";

const totale = (lordo: number, al: number) => {
  const imponibile = imponibileDalLordo(lordo, al);
  return Math.round((imponibile + impostaSuImponibile(imponibile, al)) * 100) / 100;
};

describe("l'importo della fattura non supera mai la rata", () => {
  it.each([
    [100.01, 22, 100.0], [100.07, 22, 100.06], [100.12, 22, 100.11],
    [100.04, 10, 100.03], [100.23, 4, 100.22],
  ])("%s € con IVA %s%% fa %s €", (lordo, al, atteso) => {
    expect(totale(lordo, al)).toBe(atteso);
  });

  it("su ogni importo da 100 a 3.000 euro non si va mai sopra, e si resta entro un centesimo", () => {
    for (const al of [22, 10, 4, 5, 0]) {
      let sopra = 0;
      let lontani = 0;
      for (let c = 10_000; c <= 300_000; c++) {
        const lordo = c / 100;
        const diff = Math.round((totale(lordo, al) - lordo) * 100) / 100;
        if (diff > 0) sopra += 1;
        if (Math.abs(diff) > 0.01) lontani += 1;
      }
      expect({ aliquota: al, sopra, lontani }).toEqual({ aliquota: al, sopra: 0, lontani: 0 });
    }
  });

  it("quando il totale è raggiungibile è esatto", () => {
    expect(totale(1220, 22)).toBe(1220);
    expect(totale(100, 22)).toBe(100);
    expect(imponibileDalLordo(1234.56, 0)).toBe(1234.56);
  });
});
