import { describe, expect, it, vi } from "vitest";
import { cercaCartografiaUrbanistica, cercaParticelleLombardia } from "@/lib/planimetrie/cartografiaUrbanistica";
import { comuneNelRegistro, corrispondeNomeComune, fontiNelRegistro, PRG_ROMA, REGIONI_URBANISTICA, suggerisciComuniUrbanistica } from "@/lib/planimetrie/fontiUrbanistiche";
import { quadroIntervento } from "@/lib/planimetrie/verificaIntervento";
import { piantaDueUnita } from "../fixtures/studioFrazionamento";
import { nuovoFascicoloUrbanistico, urbanisticaValida } from "../../../shared/planimetrie/urbanistica";

const giorno = "2026-11-20";
const json = (data: unknown) => Promise.resolve(new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }));
const puntoRoma = { lat: 41.8933, lng: 12.4833, confermata: true };

describe("Verifica preliminare urbanistica", () => {
  it("cerca in tutta Italia per nome o codice e collega il sito dell’ente come fonte da verificare", () => {
    expect(REGIONI_URBANISTICA).toHaveLength(20);
    const [napoli] = suggerisciComuniUrbanistica("napoli");
    expect(napoli).toMatchObject({ codiceIstat: "063049", regione: "Campania", codiceCatastale: "F839" });
    expect(suggerisciComuniUrbanistica("f839")[0]).toBe(napoli);
    expect(suggerisciComuniUrbanistica("Napoli NA")[0]).toBe(napoli);
    expect(suggerisciComuniUrbanistica("Kuens")[0]).toMatchObject({ comune: "Caines/Kuens", codiceIstat: "021014", sito: "https://www.comune.caines.bz.it" });
    expect(comuneNelRegistro("118006")).toMatchObject({ comune: "Cagliari", regione: "Sardegna", codiceCatastale: "B354" });
    expect(corrispondeNomeComune(napoli, "Casalnuovo di Napoli")).toBe(false);
    const fonti = fontiNelRegistro(napoli.regione, napoli.codiceIstat, giorno);
    expect(fonti[0]).toMatchObject({ url: "https://www.comune.napoli.it", stato: "da_verificare", tipo: "archivio" });
    expect(fonti.some(f => f.id === "rndt")).toBe(true);
    expect(fontiNelRegistro("Abruzzo", "067026", giorno)[0]).toMatchObject({ id: "indicepa", stato: "da_verificare" });
  });

  it("consulta la tavola del PRG e la Carta per la Qualità distinguendo le fonti indisponibili", async () => {
    const rispondi = vi.fn((url: string) => {
      const q = new URL(url).searchParams;
      if (q.get("request") === "GetFeatureInfo") return json({ features: [{ properties: {
        COMPONENTE: "Sistema insediativo · Città storica", NORME_TECNICHE_DI_ATTUAZIONE: "<a href='https://example.invalid/'>Art.24</a>",
      } }] });
      if (q.get("typeName")?.endsWith("Speciale")) return json({ features: [{ properties: { DENOMINAZIONE: "Edificio di prova" } }] });
      if (q.get("typeName")?.endsWith("Archeologico")) return Promise.reject(new Error("Indisponibile"));
      return json({ features: [] });
    });
    const cartografia = await cercaCartografiaUrbanistica(puntoRoma, "058091", "Lazio", "Roma", rispondi as typeof fetch);
    expect(cartografia.esito).toBe("parziale");
    expect(cartografia.ambiti).toEqual(expect.arrayContaining([
      expect.objectContaining({ categoria: "zona", descrizione: expect.stringContaining("Art.24"), scheda: PRG_ROMA }),
      expect.objectContaining({ categoria: "tutela", descrizione: expect.stringContaining("Edificio di prova") }),
    ]));
    expect(cartografia.strati?.some(s => s.esito === "indisponibile")).toBe(true);
    expect(fontiNelRegistro("Lazio", "058091", giorno).some(f => f.url === PRG_ROMA)).toBe(true);
  });

  it("sceglie un punto interno alla particella regionale, con identificativi esatti", async () => {
    const rispondi = vi.fn((url: string) => new URL(url).searchParams.has("returnExtentOnly")
      ? json({ extent: { xmin: 9, ymin: 45, xmax: 9.002, ymax: 45.002 } })
      : json({ features: [
      { properties: { FOGLIO: 389, NUMERO: "129", SEZIONE: "_", CODICE_BELFIORE: "F205" },
        geometry: { type: "Polygon", coordinates: [[[9,45],[9.002,45],[9.002,45.0005],[9.0005,45.0005],[9.0005,45.002],[9,45.002],[9,45]]] } },
      { properties: { FOGLIO: 389, NUMERO: "130", SEZIONE: "_", CODICE_BELFIORE: "F205" } },
    ] }));
    const punti = await cercaParticelleLombardia("015146", { foglio: "0389", particella: "129" }, rispondi as typeof fetch);
    expect(punti).toHaveLength(1);
    expect(punti[0]).toMatchObject({ foglio: "389", numero: "129", sezione: "" });
    expect(punti[0].lng).toBeLessThan(9.0005);
    expect(punti[0].lat).toBeGreaterThan(45);
    expect(new URL(rispondi.mock.calls[1][0]).searchParams.get("geometry")).toBe("9,45,9.002,45.002");
  });

  it("espone superficie delle unità e adempimenti aperti, senza usare un riscontro cartografico come prova di conformità", () => {
    const dati = { ...nuovoFascicoloUrbanistico(), regione: "Lazio", comune: "Roma", codiceIstat: "058091",
      originePosizione: "catasto" as const, foglio: "10", particella: "12", posizione: puntoRoma,
      intervento: { tipo: "cambio_uso" as const, usoAttuale: "Garage", usoPrevisto: "Abitazione", piano: "terra" as const, opere: "con_opere" as const },
    };
    expect(urbanisticaValida(dati)).toBe(true);
    const pianta = piantaDueUnita();
    const cambio = quadroIntervento(pianta, "B", dati, [], giorno);
    expect(cambio.verifiche).toEqual(expect.arrayContaining([
      expect.objectContaining({ titolo: "Identificazione dell’immobile", stato: "Da verificare" }),
      expect.objectContaining({ titolo: "Cambio d’uso proposto", stato: "Da verificare", dettaglio: expect.stringContaining("Garage → Abitazione") }),
      expect.objectContaining({ titolo: "Disciplina del piano", stato: "Da verificare" }),
    ]));
    const divisione = quadroIntervento(pianta, "B", { ...dati, intervento: { tipo: "frazionamento", unitaPreviste: 2 } }, [], giorno);
    expect(divisione.unita.map(u => u.mqNetti)).toEqual([125.4, 173.4]);
    expect(divisione.verifiche).toEqual(expect.arrayContaining([
      expect.objectContaining({ titolo: "Stato legittimo e uso autorizzato", stato: "Da verificare" }),
      expect.objectContaining({ titolo: "Vincoli paesaggistici e beni tutelati", stato: "Da verificare" }),
    ]));
  });
});
