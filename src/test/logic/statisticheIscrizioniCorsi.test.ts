import { describe, expect, it } from "vitest";
import { statisticheIscrizioni } from "@/lib/formazione/statisticheIscrizioni";

describe("riepiloghi dalle iscrizioni effettive", () => {
  it("senza iscrizioni mostra zero anche per corsi con vecchi contatori dimostrativi", () => {
    const courses = [{ id: "sicurezza", enrolled: 38, completion: 76 }, { id: "procedure", enrolled: 12, completion: 58 }];
    const result = statisticheIscrizioni(courses.map(c => c.id), []);
    expect(result.get("sicurezza")).toEqual({ enrolled: 0, completion: 0 });
    expect(result.get("procedure")).toEqual({ enrolled: 0, completion: 0 });
    expect(courses[0]).toEqual({ id: "sicurezza", enrolled: 38, completion: 76 });
  });
  it("distingue persone e corsi, aggrega avanzamenti e ignora corsi esterni alla vista", () => {
    const result = statisticheIscrizioni(["a", "b", "vuoto"], [
      { courseId: "a", progressPercent: 100 },
      { courseId: "a", progressPercent: 50 },
      { courseId: "a", progressPercent: 0 },
      { courseId: "b", progressPercent: 33 },
      { courseId: "esterno", progressPercent: 100 },
    ]);
    expect([...result]).toEqual([
      ["a", { enrolled: 3, completion: 50 }],
      ["b", { enrolled: 1, completion: 33 }],
      ["vuoto", { enrolled: 0, completion: 0 }],
    ]);
  });
});
