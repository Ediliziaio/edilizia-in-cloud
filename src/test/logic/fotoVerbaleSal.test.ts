import { describe, expect, it } from "vitest";
import { allegatiDaTesto, fotoNelPeriodo } from "@/lib/orders/fotoVerbaleSal";

const f = (id: string, taken_at: string) => ({ id, taken_at });

describe("Le foto del verbale SAL", () => {
  it("separa quelle del periodo: dopo il SAL precedente, fino a questo compreso", () => {
    const { periodo, altre } = fotoNelPeriodo([f("prima", "2026-09-30T10:00:00Z"), f("stesso", "2026-10-01T10:00:00Z"), f("dentro", "2026-10-02T10:00:00Z"), f("fine", "2026-10-14T10:00:00Z"), f("dopo", "2026-10-15T10:00:00Z")], "2026-10-01", "2026-10-14");
    expect(periodo.map((x) => x.id)).toEqual(["dentro", "fine"]);
    expect(altre.map((x) => x.id)).toEqual(["prima", "stesso", "dopo"]);
  });
  it("il giorno è quello italiano, anche a cavallo della mezzanotte", () => {
    expect(fotoNelPeriodo([f("notte", "2026-10-14T22:30:00Z")], null, "2026-10-14").altre.map((x) => x.id)).toEqual(["notte"]);
  });
  it("al primo SAL conta tutto fino alla sua data", () => {
    expect(fotoNelPeriodo([f("a", "2026-01-01T10:00:00Z")], null, "2026-10-14").periodo).toHaveLength(1);
  });
  it("gli allegati si scrivono uno per riga", () => {
    expect(allegatiDaTesto(" Libretto misure \n\nComputo\r\n")).toEqual(["Libretto misure", "Computo"]);
  });
});
