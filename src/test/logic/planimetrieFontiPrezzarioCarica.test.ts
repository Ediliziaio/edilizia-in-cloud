/**
 * `caricaFontiPrezzi` con un database finto che risponde come quello vero per Demo Azienda 2
 * (sede operativa LO → Lombardia, listino con 14 voci): le voci abbinate arrivano per codice,
 * con l'unità ripulita, e la fonte si chiama «Lombardia 2026».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import riscontro from "../fixtures/prezzarioVociAbbinate.json";

const chiamate: { tabella: string; filtri: [string, string, unknown][] }[] = [];
let azienda: Record<string, string | null> = {};
/** Codici che il database finto non restituisce (una voce tolta dalla fonte). */
let mancano: string[] = [];

function risposta(tabella: string, filtri: [string, string, unknown][]): { data: unknown; error: { message: string } | null } {
  const f = (nome: string) => filtri.find((x) => x[1] === nome)?.[2];
  if (tabella === "companies") return { data: azienda, error: null };
  if (tabella === "prezzario_fonte") {
    if (f("stato") !== "pubblicato") return { data: [], error: null };
    if (f("regione") === "Lombardia" && f("anno") === 2026) return { data: [{ id: "fonte-lom", nome: "Prezzario Regione Lombardia 2026" }], error: null };
    if (f("regione") === "Toscana" && f("anno") === 2026) {
      return { data: ["Firenze", "Massa Carrara", "Prato"].map((p) => ({ id: `fonte-tos-${p}`, nome: `Prezzario Toscana 2026 – ${p}` })), error: null };
    }
    if (f("regione") === "Lazio" && f("anno") === 2023) return { data: [{ id: "fonte-laz", nome: "Tariffa Regione Lazio 2023" }], error: null };
    if (f("regione") === "Trentino — P.A. Bolzano") return { data: [{ id: "fonte-bz", nome: "Prezzario Trentino — P.A. Bolzano 2026" }], error: null };
    return { data: [], error: null };
  }
  if (tabella === "prezzario_voce") {
    const codici = f("codice") as string[], fonte = f("fonte_id") as string;
    const regione = fonte === "fonte-lom" ? "Lombardia" : fonte === "fonte-laz" ? "Lazio" : fonte === "fonte-bz" ? "Trentino — P.A. Bolzano" : fonte?.startsWith("fonte-tos-") ? "Toscana" : "";
    const provincia = fonte?.startsWith("fonte-tos-") ? fonte.slice("fonte-tos-".length) : undefined;
    return { data: (riscontro.voci as { regione: string; codice: string; provincia?: string }[])
      .filter((v) => v.regione === regione && codici.includes(v.codice) && !mancano.includes(v.codice) && v.provincia === provincia), error: null };
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
  beforeEach(() => { chiamate.length = 0; mancano = []; });

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

  it("Toscana: la fonte della provincia dell'azienda, non una qualunque", async () => {
    azienda = { region: null, operational_province: "MS", legal_province: null };
    const fonti = await caricaFontiPrezzi("t", ["intonaco"]);
    expect(fonti.prezzarioNome).toBe("Toscana 2026 (Massa Carrara)");
    expect(chiamate.find((c) => c.tabella === "prezzario_voce")!.filtri).toContainEqual(["eq", "fonte_id", "fonte-tos-Massa Carrara"]);
    expect(Object.keys(fonti.prezzario).length).toBe(6);
    // Grosseto non è fra le fonti del database finto: niente prezzario, non quello di Firenze.
    azienda = { region: null, operational_province: "GR", legal_province: null };
    expect(await caricaFontiPrezzi("t", ["intonaco"])).toMatchObject({ prezzario: {}, prezzarioNome: null });
  });

  it("Trentino-Alto Adige: la Provincia autonoma della sede", async () => {
    azienda = { region: null, operational_province: "BZ", legal_province: null };
    const fonti = await caricaFontiPrezzi("b", ["intonaco"]);
    expect(fonti.prezzarioNome).toBe("P.A. Bolzano 2026");
    expect(Object.keys(fonti.prezzario).sort()).toEqual(["battiscopa", "chiusura_vano", "demolizione_tramezzo", "nuovo_tramezzo", "pavimento", "tinteggiatura"]);
  });

  it("Lazio (Roma): le voci della sopraelevazione, il cappotto con la voce del centimetro in più", async () => {
    azienda = { region: null, operational_province: "RM", legal_province: null };
    const fonti = await caricaFontiPrezzi("cal", ["cappotto"]);
    expect(fonti.prezzarioNome).toBe("Lazio 2023");
    expect(fonti.prezzario.cappotto).toMatchObject({ codice: "A 11.02.1.b.1", prezzo: 97.46, perCm: { codice: "A 11.02.1.b.2", prezzo: 4.87, daCm: 4 } });
    expect(fonti.prezzario.ponteggio).toMatchObject({ codice: "S 1.01.3.3.a", prezzo: 18.32 });
    expect(fonti.prezzario.scavo).toMatchObject({ codice: "A 2.01.1.b", unita: "mc", prezzo: 9.1 });
    expect(proponiPrezzo({ id: "nc:p2:scavo", descrizione: "Scavo", unita: "m³" }, fonti)).toMatchObject({ importo: 9.1 });
    // La voce del centimetro in più si chiede insieme alle altre, per codice.
    expect(chiamate.find((c) => c.tabella === "prezzario_voce")!.filtri.find((x) => x[0] === "in")![2]).toContain("A 11.02.1.b.2");
    // Se manca, il cappotto non si propone dal prezzario (il prezzo dipende dallo spessore); il resto sì.
    mancano = ["A 11.02.1.b.2"];
    const senza = await caricaFontiPrezzi("cal", ["cappotto"]);
    expect(senza.prezzario.cappotto).toBeUndefined();
    expect(senza.prezzario.ponteggio).toBeDefined();
  });

  it("regione sconosciuta: nessuna voce di prezzario, nessuna lettura", async () => {
    azienda = { region: null, operational_province: null, legal_province: null };
    expect(await caricaFontiPrezzi("x", ["intonaco"])).toMatchObject({ prezzario: {}, prezzarioNome: null });
    expect(chiamate.some((c) => c.tabella === "prezzario_voce")).toBe(false);
  });
});
