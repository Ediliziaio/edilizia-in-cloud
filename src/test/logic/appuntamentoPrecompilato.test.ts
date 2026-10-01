import { describe, expect, it } from "vitest";
import {
  linkWhatsApp, scorciatoieData, sovrapposizioni, testoConferma, titoloSuggerito,
} from "@/lib/opportunita/appuntamentoPrecompilato";

describe("appuntamento precompilato", () => {
  it("suggerisce il titolo", () => {
    expect(titoloSuggerito("Sopralluogo Preventivo", "Anna Rossi")).toBe("Sopralluogo Preventivo · Anna Rossi");
    expect(titoloSuggerito("", "Anna")).toBe("Appuntamento con Anna");
    expect(titoloSuggerito(null, null)).toBe("Appuntamento");
  });

  it("dà le scorciatoie di data", () => {
    const s = scorciatoieData(new Date(2026, 9, 1, 15, 30));
    expect(s.map((x) => x.chiave)).toEqual(["oggi", "domani", "dopodomani", "settimana"]);
    expect(s[1].data.getDate()).toBe(2);
    expect(s[3].data.getDate()).toBe(8);
  });

  it("trova le sovrapposizioni e non conta il bordo", () => {
    const altri = [
      { id: "a", inizio: "09:00:00", fine: "10:00:00" },
      { id: "b", inizio: "10:00", fine: "11:00" },
      { id: "c", inizio: "11:30", fine: null },
    ];
    expect(sovrapposizioni("10:00", "11:00", altri).map((x) => x.id)).toEqual(["b"]);
    expect(sovrapposizioni("11:00", "12:00", altri).map((x) => x.id)).toEqual(["c"]);
    expect(sovrapposizioni("12:30", "13:00", altri)).toEqual([]);
    expect(sovrapposizioni("", "", altri)).toEqual([]);
  });

  it("scrive la conferma e il link WhatsApp", () => {
    const t = testoConferma({ nome: "Anna Rossi", data: new Date(2026, 9, 2), ora: "10:00", luogo: "Via Roma 1, Lodi", tipo: "Sopralluogo" });
    expect(t).toContain("Buongiorno Anna,");
    expect(t).toContain("alle 10:00, in Via Roma 1, Lodi");
    expect(linkWhatsApp("+393479047790", "ciao")).toBe("https://wa.me/393479047790?text=ciao");
    expect(linkWhatsApp("3479047790", "ciao")).toBe("https://wa.me/393479047790?text=ciao");
    expect(linkWhatsApp("12", "ciao")).toBeNull();
  });
});
