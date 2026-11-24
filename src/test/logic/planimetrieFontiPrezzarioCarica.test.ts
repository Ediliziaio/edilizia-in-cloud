/**
 * `caricaFontiPrezzi` con un database finto che risponde come quello vero per Demo Azienda 2
 * (sede operativa LO → Lombardia, listino con 14 voci): le voci abbinate arrivano per codice,
 * con l'unità ripulita, e la fonte si chiama «Lombardia 2026».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import riscontro from "../fixtures/prezzarioVociAbbinate.json";

const chiamate: { tabella: string; filtri: [string, string, unknown][] }[] = [];
let azienda: Record<string, string | null> = {};

function risposta(tabella: string, filtri: [string, string, unknown][]) {
  const f = (nome: string) => filtri.find((x) => x[1] === nome)?.[2];
  if (tabella === "companies") return { data: azienda, error: null };
  if (tabella === "prezzario_fonte") {
    return { data: f("regione") === "Lombardia" && f("anno") === 2026 && f("stato") === "pubblicato" ? { id: "fonte-lom" } : null, error: null };
  }
  if (tabella === "prezzario_voce") {
    const codici = f("codice") as string[];
    return { data: f("fonte_id") === "fonte-lom" ? riscontro.voci.filter((v) => v.regione === "Lombardia" && codici.includes(v.codice)) : [], error: null };
  }
  if (tabella === "rst_listino_voci") return { data: [{ codice: "DEMO-RST-011", descrizione: "Tinteggiatura di pareti e soffitti con idropittura lavabile", unita_misura: "mq", prezzo_unitario: 9.6 }], error: null };
  return { data: null, error: { message: "tabella inattesa" } };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(tabella: string) {
      const filtri: [string, string, unknown][] = [];
      chiamate.push({ tabella, filtri });
      const q = {
        select: () => q, limit: () => q,
        eq: (c: string, v: unknown) => (filtri.push(["eq", c, v]), q),
        gt: (c: string, v: unknown) => (filtri.push(["gt", c, v]), q),
        in: (c: string, v: unknown) => (filtri.push(["in", c, v]), q),
        maybeSingle: () => Promise.resolve(risposta(tabella, filtri)),
        then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(risposta(tabella, filtri)).then(ok, ko),
      };
      return q;
    },
  },
}));

const { caricaFontiPrezzi } = await import("@/lib/planimetrie/fontiPrezzi");
const { proponiPrezzo } = await import("@/lib/planimetrie/prezziProposti");

describe("caricaFontiPrezzi: prezzario della regione dell'azienda", () => {
  beforeEach(() => { chiamate.length = 0; });

  it("Demo Azienda 2 (LO): listino + voci lombarde abbinate per codice", async () => {
    azienda = { region: null, operational_province: "LO", legal_province: "MI" };
    const fonti = await caricaFontiPrezzi("d2", ["intonaco"]);
    expect(fonti.prezzarioNome).toBe("Lombardia 2026");
    expect(Object.keys(fonti.prezzario).sort()).toEqual(["battiscopa", "chiusura_vano", "demolizione_tramezzo", "intonaco", "nuova_muratura",
      "nuovo_tramezzo", "pavimento", "porta", "rivestimento", "tinteggiatura"]);
    expect(fonti.prezzario.intonaco).toEqual({ codice: "LOM261.OC.EEA.Pa16.C0900.Za001.0510.-", unita: "m²", prezzo: 31.46,
      descrizione: expect.stringContaining("intonacatura, completo; finitura: civile fine") });
    // Una lavorazione che il listino non copre prende il prezzario; una che copre, il listino.
    expect(proponiPrezzo({ id: "m1-intonaco", descrizione: "Intonaco", unita: "m²" }, fonti))
      .toMatchObject({ importo: 31.46, fonte: "Prezzario Lombardia 2026 · LOM261.OC.EEA.Pa16.C0900.Za001.0510.-, da confermare" });
    expect(proponiPrezzo({ id: "m1-tinteggiatura", descrizione: "Tinteggiatura", unita: "m²" }, fonti))
      .toMatchObject({ importo: 9.6, fonte: "Listino aziendale" });
    // Si chiedono solo i codici abbinati, mai una ricerca per parole.
    const voci = chiamate.find((c) => c.tabella === "prezzario_voce")!;
    expect(voci.filtri.map((x) => x[0]).sort()).toEqual(["eq", "in"]);
  });

  it("regione senza abbinamenti o sconosciuta: nessuna voce di prezzario, nessuna lettura", async () => {
    azienda = { region: null, operational_province: "CB", legal_province: null };
    expect(await caricaFontiPrezzi("x", ["intonaco"])).toMatchObject({ prezzario: {}, prezzarioNome: null });
    azienda = { region: null, operational_province: null, legal_province: null };
    expect(await caricaFontiPrezzi("x", ["intonaco"])).toMatchObject({ prezzario: {}, prezzarioNome: null });
    expect(chiamate.some((c) => c.tabella === "prezzario_voce")).toBe(false);
  });
});
