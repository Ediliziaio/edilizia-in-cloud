import { describe, expect, it } from "vitest";
import {
  applicaValutazione, derivaDaValutazione, lavorazioneVuota, normalizzaLavorazione, normalizzaPos, posVuoto, righeDiTesto,
  valutazioneAttiva, valutazioneDaElenchi, vociMancanti, type Lavorazione, type PosContenuto, type ValutazioneLavorazione,
} from "../../../supabase/functions/_shared/posModello";
import { costruisciHtmlPos } from "../../../supabase/functions/_shared/posHtml";
import { layoutPdfPos } from "../../../supabase/functions/_shared/posPdfLayout";
import { esempioPdfPos } from "../fixtures/posEsempioPdf";

const valutazione = (): ValutazioneLavorazione => ({
  righe: [
    { rischio: "Caduta dall'alto", misure: "Parapetti normali\nImbracatura ancorata", dpi: "Imbracatura EN 361\nElmetto EN 397", residuo: "basso" },
    { rischio: "Polveri", misure: "Aspirazione alla fonte", dpi: "Facciale FFP2 EN 149\nElmetto EN 397", residuo: "medio" },
  ],
  misure_comuni: "Formazione specifica prima dell'inizio",
  dpi_comuni: "Guanti EN 388",
});
const lavorazione = (extra: Partial<Lavorazione> = {}): Lavorazione => {
  const l: Lavorazione = { ...lavorazioneVuota("l1"), titolo: "Cappotto", descrizione: "Posa pannelli", sostanze: "Nessuna", opere_provvisionali: "Ponteggio", macchine: "Trapano", impianti: "Nessuno", turni: "Diurno", ...extra };
  return l;
};
const conLavorazione = (l: Lavorazione): PosContenuto => { const p = posVuoto(); p.versione_controlli = 2; p.lavorazioni = [l]; return p; };
const manca = (p: PosContenuto) => vociMancanti(p).map((m) => m.testo).filter((t) => t.includes("Cappotto"));
const approvato = (p: PosContenuto) => ({ contenuto: p, stato: "approvato", revisione: 0, revisioni: [] as never[], approvatoDa: "Mario Rossi" });

describe("tabella per rischio: modello", () => {
  it("la tabella scrive i tre campi classici, senza doppioni e con le misure comuni", () => {
    const l = lavorazione();
    applicaValutazione(l, valutazione());
    expect(l.rischi).toBe("Caduta dall'alto\nPolveri");
    expect(l.misure.split("\n")).toEqual(["Parapetti normali", "Imbracatura ancorata", "Aspirazione alla fonte", "Formazione specifica prima dell'inizio"]);
    // «Elmetto EN 397» sta in due righe e compare una volta sola
    expect(l.dpi.split("\n")).toEqual(["Imbracatura EN 361", "Elmetto EN 397", "Facciale FFP2 EN 149", "Guanti EN 388"]);
    expect(derivaDaValutazione(valutazione()).dpi).toBe(l.dpi);
  });

  it("vale finché i campi classici dicono le stesse cose; se un'app vecchia li cambia, vincono loro", () => {
    const l = lavorazione();
    applicaValutazione(l, valutazione());
    expect(valutazioneAttiva(l)).not.toBeNull();
    // stesso contenuto in altro ordine, con maiuscole diverse e puntini: non cambia nulla
    expect(valutazioneAttiva({ ...l, rischi: "- polveri\n• CADUTA DALL'ALTO" })).not.toBeNull();
    // una misura aggiunta a mano nei campi classici: la tabella non è più la verità
    expect(valutazioneAttiva({ ...l, misure: `${l.misure}\nSegnaletica di cantiere` })).toBeNull();
    expect(valutazioneAttiva({ ...l, rischi: "Rumore" })).toBeNull();
    expect(valutazioneAttiva({ ...l, dpi: "" })).toBeNull();
    // senza righe non c'è tabella
    expect(valutazioneAttiva({ ...l, valutazione: { righe: [], misure_comuni: "", dpi_comuni: "" } })).toBeNull();
    expect(valutazioneAttiva(lavorazione())).toBeNull();
  });

  it("da tre elenchi a una tabella senza perdere nulla: un rischio per riga, misure e DPI restano comuni", () => {
    const l = lavorazione({ rischi: "Caduta dall'alto\nPolveri\nRumore", misure: "Parapetti\nAspirazione", dpi: "Elmetto EN 397\nFFP2 EN 149" });
    const v = valutazioneDaElenchi(l);
    expect(v.righe.map((r) => r.rischio)).toEqual(["Caduta dall'alto", "Polveri", "Rumore"]);
    expect(v.righe.every((r) => !r.misure && !r.dpi && r.residuo === "")).toBe(true);
    expect(righeDiTesto(v.misure_comuni)).toEqual(["Parapetti", "Aspirazione"]);
    const prima = { rischi: l.rischi, misure: l.misure, dpi: l.dpi };
    applicaValutazione(l, v);
    expect({ rischi: l.rischi, misure: l.misure, dpi: l.dpi }).toEqual(prima);
    expect(valutazioneAttiva(l)).not.toBeNull();
    // una lavorazione senza rischi scritti parte con una riga vuota da compilare
    expect(valutazioneDaElenchi(lavorazione()).righe).toHaveLength(1);
  });

  it("la lettura sicura la conserva, ripulisce il livello e non inventa tabelle", () => {
    const l = lavorazione();
    applicaValutazione(l, valutazione());
    const riletta = normalizzaLavorazione(JSON.parse(JSON.stringify(l)), "x");
    expect(riletta.valutazione).toEqual(l.valutazione);
    const sporca = normalizzaLavorazione({ ...l, valutazione: { righe: [{ rischio: "R", misure: "M", dpi: 5, residuo: "enorme" }, "boh", null], misure_comuni: 3 } }, "x");
    expect(sporca.valutazione!.righe[0]).toEqual({ rischio: "R", misure: "M", dpi: "5", residuo: "" });
    expect(sporca.valutazione!.righe).toHaveLength(3);
    expect(normalizzaLavorazione({ titolo: "Senza" }, "x").valutazione).toBeUndefined();
    // dentro un POS intero
    const p = conLavorazione(l);
    expect(normalizzaPos(JSON.parse(JSON.stringify(p))).lavorazioni[0].valutazione).toEqual(l.valutazione);
  });
});

describe("tabella per rischio: controlli di approvazione", () => {
  it("un rischio senza misure ferma l'approvazione, a meno che ci siano misure comuni a tutta la lavorazione", () => {
    const l = lavorazione();
    applicaValutazione(l, { righe: [{ rischio: "Caduta dall'alto", misure: "", dpi: "Imbracatura", residuo: "" }, { rischio: "Polveri", misure: "Aspirazione", dpi: "", residuo: "" }], misure_comuni: "", dpi_comuni: "" });
    expect(manca(conLavorazione(l))).toEqual(["Lavorazione «Cappotto»: rischio «Caduta dall'alto» senza misure (scrivile, o mettile fra quelle comuni)"]);
    applicaValutazione(l, { ...l.valutazione!, misure_comuni: "Sorveglianza del preposto" });
    expect(manca(conLavorazione(l))).toEqual([]);
  });

  it("misure o DPI senza il rischio a cui si riferiscono fermano l'approvazione; una riga vuota no (ma mancano i rischi)", () => {
    const l = lavorazione();
    applicaValutazione(l, { righe: [{ rischio: "", misure: "Parapetti", dpi: "", residuo: "" }, { rischio: "Polveri", misure: "Aspirazione", dpi: "FFP2", residuo: "" }], misure_comuni: "", dpi_comuni: "" });
    expect(manca(conLavorazione(l))).toEqual(["Lavorazione «Cappotto»: la riga 1 ha misure o DPI ma non dice il rischio"]);
    const vuota = lavorazione();
    applicaValutazione(vuota, { righe: [{ rischio: "", misure: "", dpi: "", residuo: "" }], misure_comuni: "", dpi_comuni: "" });
    expect(manca(conLavorazione(vuota)).join(" ")).toMatch(/rischi, misure preventive e protettive, DPI/);
  });

  it("con la tabella i controlli classici passano dai campi derivati; senza tabella nulla cambia", () => {
    const l = lavorazione();
    applicaValutazione(l, valutazione());
    expect(manca(conLavorazione(l))).toEqual([]);
    expect(manca(conLavorazione(lavorazione({ rischi: "Caduta", misure: "Parapetti", dpi: "Elmetto" })))).toEqual([]);
    expect(manca(conLavorazione(lavorazione())).join(" ")).toMatch(/rischi/);
  });

  it("se i campi classici divergono, i controlli guardano quelli: nessuna misura può sparire senza che nessuno lo veda", () => {
    const l = lavorazione();
    applicaValutazione(l, valutazione());
    const cambiata = { ...l, misure: "" }; // un'app vecchia ha svuotato le misure
    expect(valutazioneAttiva(cambiata)).toBeNull();
    expect(manca(conLavorazione(cambiata)).join(" ")).toMatch(/misure preventive e protettive/);
  });
});

describe("tabella per rischio: documento", () => {
  const html = (l: Lavorazione) => costruisciHtmlPos(approvato(conLavorazione(l)));

  it("il PDF stampa una tabella rischio → misure → DPI → residuo al posto dei tre elenchi", () => {
    const l = lavorazione();
    applicaValutazione(l, valutazione());
    const h = html(l);
    expect(h).toContain("<h4>Rischi, misure e DPI — Cappotto</h4>");
    expect(h).toContain('<table class="rischi">');
    expect(h).toContain("<th>Misure preventive e protettive</th>");
    expect(h).toContain('<td class="centro">Basso</td>');
    expect(h).toContain('<td class="centro">Medio</td>');
    expect(h).toContain("Comuni a tutta la lavorazione");
    expect(h).toContain("Il rischio residuo è la valutazione di chi redige il POS");
    expect(h).not.toContain('<td class="et" colspan="2">Rischi</td>');
    expect(h).not.toContain('<td class="et" colspan="2">DPI</td>');
    // l'elenco unico dei DPI del cantiere nasce dai campi derivati
    expect(h).toContain("<li>Guanti EN 388</li>");
  });

  it("se la tabella non è più coerente con i campi classici, il PDF stampa i campi classici", () => {
    const l = lavorazione();
    applicaValutazione(l, valutazione());
    l.misure = `${l.misure}\nSegnaletica aggiunta da un'app vecchia`;
    const h = html(l);
    expect(h).not.toContain('<table class="rischi">');
    expect(h).toContain('<td class="et" colspan="2">Misure preventive e protettive</td>');
    expect(h).toContain("Segnaletica aggiunta da un&#39;app vecchia");
  });

  it("senza tabella il documento è quello di prima, e senza residuo non c'è la nota", () => {
    const h = html(lavorazione({ rischi: "Caduta", misure: "Parapetti", dpi: "Elmetto" }));
    expect(h).toContain('<td class="et" colspan="2">Rischi</td>');
    expect(h).not.toContain('<table class="rischi">');
    const l = lavorazione();
    applicaValutazione(l, { righe: [{ rischio: "Caduta", misure: "Parapetti", dpi: "Elmetto", residuo: "" }], misure_comuni: "", dpi_comuni: "" });
    expect(html(l)).not.toContain("Il rischio residuo è la valutazione");
    expect(html(l)).not.toContain("Comuni a tutta la lavorazione</td>");
  });

  it("il layout PDF tiene le colonne e centra il residuo, e un campo senza dati esce «—»", () => {
    const l = lavorazione();
    applicaValutazione(l, { righe: [{ rischio: "Caduta", misure: "Parapetti", dpi: "", residuo: "alto" }], misure_comuni: "", dpi_comuni: "" });
    const dati = esempioPdfPos();
    dati.contenuto.lavorazioni = [l];
    const def = layoutPdfPos(costruisciHtmlPos(dati), "T", 0, "2026-10-30T10:00:00Z").definizione.content as Array<Record<string, any>>;
    const tabella = def.find((b) => b.table && JSON.stringify(b.table.body[0]).includes("Rischio residuo"))!;
    expect(tabella.table.widths).toHaveLength(4);
    expect(tabella.table.body[1][3]).toMatchObject({ text: "Alto", alignment: "center" });
    expect(tabella.table.body[1][2]).toMatchObject({ text: "—" });
  });
});
