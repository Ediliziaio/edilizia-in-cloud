import { describe, expect, it } from "vitest";
import { chiFaCosa } from "@/lib/campo/chiFaCosa";
import { REGOLE_COME_OGGI, type ChiCompila, type OreDalle, type RegoleCampo } from "@/lib/campo/regoleCampo";

const r = (parte: Partial<RegoleCampo>): RegoleCampo => ({ ...REGOLE_COME_OGGI, ...parte });
const righe = (regole: RegoleCampo, ruolo: string) => chiFaCosa(regole).find((b) => b.ruolo === ruolo)!.righe.join(" | ");

describe("chi fa cosa, dalle regole dell'azienda", () => {
  it("sempre quattro blocchi nello stesso ordine, con i link dove si fanno le cose", () => {
    const blocchi = chiFaCosa(REGOLE_COME_OGGI);
    expect(blocchi.map((b) => b.ruolo)).toEqual(["operaio", "capo", "ufficio", "giornale"]);
    expect(blocchi.find((b) => b.ruolo === "giornale")!.link!.to).toBe("/azienda/giornale-lavori");
    expect(blocchi.find((b) => b.ruolo === "capo")!.link!.to).toBe("/azienda/ordini");
  });

  it("«ognuno»: l'operaio scrive il suo rapportino, il capo può aggiungere la squadra", () => {
    const regole = r({ chiCompila: "ognuno" });
    expect(righe(regole, "operaio")).toContain("Scrive il suo rapportino: ore, lavori fatti, foto e materiali.");
    expect(righe(regole, "operaio")).not.toContain("senza responsabile");
    expect(righe(regole, "capo")).toContain("può aggiungere la squadra");
  });

  it("«capo»: l'operaio timbra e basta dove c'è un responsabile; il capo scrive il cantiere e la squadra", () => {
    const regole = r({ chiCompila: "capo" });
    expect(righe(regole, "operaio")).toContain("Timbra entrata e uscita");
    expect(righe(regole, "operaio")).toContain("Nei cantieri senza responsabile scrive il suo rapportino completo.");
    expect(righe(regole, "capo")).toContain("Scrive il rapportino del cantiere");
    expect(righe(regole, "capo")).toContain("scrive a mano le ore di ognuno");
  });

  it("«ore_proprie»: ognuno manda le sue ore, anche il capo; le timbrature non diventano proposta di squadra", () => {
    const regole = r({ chiCompila: "ore_proprie", oreDalle: "timbrature", avvisoScostamentoMinuti: 30 });
    expect(righe(regole, "operaio")).toContain("Manda solo le sue ore della giornata.");
    expect(righe(regole, "operaio")).not.toContain("proposta per il rapportino di squadra");
    expect(righe(regole, "capo")).toContain("Conferma solo le sue ore");
    expect(righe(regole, "capo")).not.toContain("vede un avviso");
  });

  it("le ore dalle timbrature: la proposta parte da quelle timbrate, con l'avviso se acceso", () => {
    const regole = r({ chiCompila: "capo", oreDalle: "timbrature", avvisoScostamentoMinuti: 45 });
    expect(righe(regole, "operaio")).toContain("Le ore che timbra diventano la proposta");
    expect(righe(regole, "capo")).toContain("partono da quelle timbrate");
    expect(righe(regole, "capo")).toContain("di più di 45 min, vede un avviso.");
    expect(righe(r({ chiCompila: "capo", oreDalle: "timbrature" }), "capo")).not.toContain("avviso");
  });

  it("ogni combinazione di chiCompila e oreDalle dà testo non vuoto e senza doppioni", () => {
    const chi: ChiCompila[] = ["ognuno", "capo", "ore_proprie"];
    const ore: OreDalle[] = ["capo", "timbrature"];
    for (const c of chi) for (const o of ore) {
      for (const b of chiFaCosa(r({ chiCompila: c, oreDalle: o }))) {
        expect(b.righe.length).toBeGreaterThan(0);
        expect(new Set(b.righe).size).toBe(b.righe.length);
      }
    }
  });

  it("l'ufficio: approva chi modifica le commesse, non i propri, e i giorni indietro vengono dalla regola", () => {
    expect(righe(r({}), "ufficio")).toContain("chi può modificare le commesse");
    expect(righe(r({}), "ufficio")).toContain("non approva i propri rapportini");
    expect(righe(r({}), "ufficio")).toContain("le ore entrano nella manodopera");
    expect(righe(r({ giorniIndietro: 0 }), "ufficio")).toContain("solo il giorno stesso");
    expect(righe(r({ giorniIndietro: 1 }), "ufficio")).toContain("più vecchie di ieri");
    expect(righe(r({ giorniIndietro: 5 }), "ufficio")).toContain("più vecchie di 5 giorni");
  });

  it("il giornale: permessi propri, e i rapportini non lo sostituiscono", () => {
    expect(righe(REGOLE_COME_OGGI, "giornale")).toContain("«Giornale Lavori»");
    expect(righe(REGOLE_COME_OGGI, "giornale")).toContain("non lo sostituiscono");
  });
});
