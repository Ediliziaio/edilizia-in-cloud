/** Ogni variante dice a che giorno sono i suoi prezzi, e quando il listino li ha superati (24/11/2026). */
import { describe, expect, it } from "vitest";
import { bozzaComputoSchema, bozzaVuota } from "@/lib/computo/editorNativo";
import { dataItaliana, dataPrezziVariante, oggiIso, prezziDaAggiornare, testoDataPrezzi } from "@/lib/planimetrie/dataPrezzi";
import { conPrezziProposti, FONTE_INDICATIVA, FONTI_VUOTE, type FontiPrezzi } from "@/lib/planimetrie/prezziProposti";
import { studioVariante } from "@/lib/planimetrie/studioImmobiliare";
import { validaPlanimetria, type Planimetria, type PrezzoVocePlanimetria } from "../../../shared/planimetrie/modello";
import { piantaCollaudoConVariante } from "../fixtures/piantaCollaudo";

const conPrezzi = (prezzi: Record<string, PrezzoVocePlanimetria>): Planimetria => {
  const doc = piantaCollaudoConVariante();
  doc.livelli[0].proposte[0].prezziLavorazioni = prezzi;
  return doc;
};
const listino = (prezzo: number): FontiPrezzi => ({ ...FONTI_VUOTE, listino: [{ codice: "DEM.01", descrizione: "Demolizione di tramezzi interni", unita: "mq", prezzo }] });

describe("data dei prezzi della variante", () => {
  it("i prezzi proposti sono di oggi; quelli salvati tengono il loro giorno, il più vecchio vince", () => {
    const doc = conPrezzi({
      t1: { importo: 30, unita: "m²", fonte: "Listino aziendale", tariffa: "DEM.01", data: "2026-10-02" },
      n1: { importo: 50, unita: "m²", fonte: "Prezzo inserito", tariffa: "", data: "2026-11-01" },
    });
    const righe = conPrezziProposti(studioVariante(doc, "A").righe);
    const d = dataPrezziVariante(doc, "A", righe, "2026-11-24");
    expect(d).toEqual({ al: "2026-10-02", senzaData: 0, prezzi: righe.length });
    expect(testoDataPrezzi(d)).toBe("Prezzi al 02/10/2026");
    expect(dataPrezziVariante(piantaCollaudoConVariante(), "A", righe.filter(r => r.id !== "t1" && r.id !== "n1"), "2026-11-24").al).toBe("2026-11-24");
  });

  it("una variante salvata prima del 24/11 lo dice invece di inventare una data", () => {
    const doc = conPrezzi({ t1: { importo: 30, unita: "m²", fonte: "Listino aziendale", tariffa: "DEM.01" } });
    const d = dataPrezziVariante(doc, "A", conPrezziProposti(studioVariante(doc, "A").righe), "2026-11-24");
    expect(d.senzaData).toBe(1);
    expect(testoDataPrezzi(d)).toBe("Prezzi al 24/11/2026 · 1 senza data");
    expect(testoDataPrezzi({ al: null, senzaData: 2, prezzi: 2 })).toBe("Data dei prezzi non registrata");
  });

  it("se il listino è cambiato dopo, il prezzo preso dal listino è da aggiornare; quello scritto a mano no", () => {
    const doc = conPrezzi({
      t1: { importo: 30, unita: "m²", fonte: "Listino aziendale", tariffa: "DEM.01", data: "2026-10-02" },
      n1: { importo: 50, unita: "m²", fonte: "Prezzo inserito", tariffa: "", data: "2026-10-02" },
    });
    const righe = conPrezziProposti(studioVariante(doc, "A").righe, listino(32.2));
    expect(prezziDaAggiornare(righe, listino(32.2))).toEqual([
      { id: "t1", descrizione: "Demolizione tramezzo", prima: 30, oggi: 32.2, fonte: "Listino aziendale" },
    ]);
    expect(prezziDaAggiornare(righe, listino(30))).toEqual([]);
  });

  it("un prezzo indicativo diventa da aggiornare quando il listino ha la voce", () => {
    const doc = conPrezzi({ t1: { importo: 28, unita: "m²", fonte: FONTE_INDICATIVA, tariffa: "", data: "2026-10-02" } });
    const righe = conPrezziProposti(studioVariante(doc, "A").righe, listino(32.2));
    expect(prezziDaAggiornare(righe, listino(32.2)).map(d => d.id)).toEqual(["t1"]);
  });

  it("la data si salva nel documento e nel computo generato, e si valida", () => {
    const buona = conPrezzi({ t1: { importo: 30, unita: "m²", fonte: "Listino aziendale", tariffa: "", data: "2026-11-24" } });
    expect(validaPlanimetria(buona).ok).toBe(true);
    const cattiva = conPrezzi({ t1: { importo: 30, unita: "m²", fonte: "Listino aziendale", tariffa: "", data: "24/11/2026" } });
    expect(validaPlanimetria(cattiva).ok).toBe(false);
    const fontePlanimetria = { planimetriaId: "00000000-0000-4000-8000-000000000001", versione: 3, varianteId: "A", prezziAl: "2026-11-24" };
    expect(bozzaComputoSchema.parse({ ...bozzaVuota(), fontePlanimetria }).fontePlanimetria?.prezziAl).toBe("2026-11-24");
    expect(oggiIso(new Date(2026, 10, 24, 23, 30))).toBe("2026-11-24");
    expect(dataItaliana("2026-11-24")).toBe("24/11/2026");
  });
});
