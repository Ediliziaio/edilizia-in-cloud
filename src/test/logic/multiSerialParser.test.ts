import { describe, it, expect } from "vitest";
import { tryParseMultiSerial, deriveLottoFromSerials } from "@/lib/barcode/multiSerialParser";

// Contenuto REALE del QR "SERIALS" di un bancale fotovoltaico (Hyundai V13H, 36
// pannelli): seriali separati da spazio, tutti 12 char, prefisso comune V13H1000.
// Regression guard: scansionando questo QR devono uscire TUTTI e 36 i pannelli.
const HYUNDAI_PALLET_QR =
  "V13H10002035 V13H10002023 V13H10001689 V13H10000819 V13H10001907 V13H10000989 " +
  "V13H10000253 V13H10002101 V13H10002059 V13H10002049 V13H10002006 V13H10001919 " +
  "V13H10001993 V13H10001936 V13H10001685 V13H10001548 V13H10001846 V13H10001833 " +
  "V13H10001887 V13H10001551 V13H10001770 V13H10001280 V13H10001804 V13H10001802 " +
  "V13H10001826 V13H10001828 V13H10001248 V13H10001439 V13H10001510 V13H10001194 " +
  "V13H10001750 V13H10001774 V13H10001292 V13H10001656 V13H10001651 V13H10001621";

describe("multiSerialParser — QR bancale fotovoltaico (Hyundai V13H, spazi)", () => {
  it("estrae tutti e 36 i seriali dal QR", () => {
    const r = tryParseMultiSerial(HYUNDAI_PALLET_QR);
    expect(r).not.toBeNull();
    expect(r!.format).toBe("space");
    expect(r!.serials).toHaveLength(36);
    expect(r!.serials[0]).toBe("V13H10002035");
    expect(r!.serials[35]).toBe("V13H10001621");
  });

  it("deriva il codice lotto dal prefisso comune dei seriali", () => {
    const r = tryParseMultiSerial(HYUNDAI_PALLET_QR)!;
    expect(deriveLottoFromSerials(r.serials)).toBe("V13H1000");
  });

  it("CSV e a-capo restano supportati (multi-formato)", () => {
    expect(tryParseMultiSerial("SN-0001,SN-0002,SN-0003")?.serials).toHaveLength(3);
    expect(tryParseMultiSerial("SN-0001\nSN-0002\nSN-0003")?.serials).toHaveLength(3);
  });

  it("deriveLottoFromSerials → null se non c'è un prefisso comune significativo", () => {
    expect(deriveLottoFromSerials(["ABCD1234", "ZZZZ9999"])).toBeNull();
    expect(deriveLottoFromSerials(["SOLOUNO"])).toBeNull();
  });
});
