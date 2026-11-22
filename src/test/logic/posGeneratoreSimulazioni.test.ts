import { proponiEsitiRumore } from "../../../supabase/functions/_shared/posEsitiRumore";
import { describe, expect, it } from "vitest";
import { normalizzaPos, posVuoto, vociMancanti } from "../../../supabase/functions/_shared/posModello";
import { proponiEmergenzeDalPsc, testoIndicazioniEmergenza } from "../../../supabase/functions/_shared/posEmergenzePsc";
import { suggerisciRiscontriDpiPos, type AddettoConConsegne } from "../../../supabase/functions/_shared/posEvidenzeOperative";
import type { RiferimentoPsc } from "../../../supabase/functions/_shared/posPsc";
import { applicaFontiProposteAiPos, capitoliComputoPos, preparaContestoAiPos } from "../../../supabase/functions/_shared/posAiContesto";

const riferimento: RiferimentoPsc = { id: "PSC-prova", revisione: "02", sha256: "d".repeat(64), company_id: "demo", order_id: "cantiere",
  archivio: "sicurezza_documenti", file_path: "demo/psc.pdf", file_name: "psc.pdf", titolo: "PSC prova", data_documento: "" };

describe("Simulazioni del generatore POS", () => {
  it("ristrutturazione abitata: distingue vie di esodo, raccolta e presidi", () => {
    const testo = [
      "L'uscita di emergenza del cantiere passa dalla porta ovest.",
      "Il punto di raccolta è nel piazzale davanti al cancello est",
      "Il direttore dei lavori cura il programma settimanale.",
      "Cassetta di primo soccorso",
      "Si trova accanto alla portineria del piano terreno.",
      "Gli estintori sono collocati accanto all'uscita della zona lavori.",
      "Planimetria di evacuazione: allegato E-4, revisione 02.",
    ].join("\n");
    const p = proponiEmergenzeDalPsc({ riferimento, pagine: [{ pagina: 9, testo }] });
    expect(p.map(r => r.campo)).toEqual(["raccolta", "esodo", "primo_soccorso", "antincendio", "planimetria"]);
    expect(p.find(r => r.campo === "primo_soccorso")).toMatchObject({ pagina: 9, estratto: "Cassetta di primo soccorso Si trova accanto alla portineria del piano terreno." });
    expect(p.find(r => r.campo === "raccolta")?.estratto).toBe("Il punto di raccolta è nel piazzale davanti al cancello est");
    for (const r of p) expect(testo.replace(/\s+/g, " ")).toContain(r.estratto);
  });

  it("distingue un rinvio alla planimetria dall’ubicazione del punto di raccolta", () => {
    const proposte = proponiEmergenzeDalPsc({ riferimento, pagine: [{ pagina: 139, metodo: "ocr", testo: [
      "11.6 PUNTO DI RACCOLTA",
      "Bisogna prevedere l’individuazione del punto di raccolta nel cantiere.",
      "Il punto di raccolta è indicato all’interno del",
      "Layout di cantiere allegato al PSC.",
    ].join("\n") }] });
    expect(proposte).toEqual([expect.objectContaining({
      campo: "planimetria", pagina: 139, revisione: "02", metodo: "ocr",
      estratto: "Il punto di raccolta è indicato all’interno del Layout di cantiere allegato al PSC.",
    })]);
  });

  it("cantiere stradale con fasi: conserva due accessi distinti e ignora il segnaposto", () => {
    const r = proponiEmergenzeDalPsc({ riferimento, pagine: [
      { pagina: 31, testo: "Fase A. I mezzi di soccorso accedono dal cancello sud presso il km 6." },
      { pagina: 52, metodo: "ocr", testo: "Fase B. L'accesso per i soccorsi è tramite il varco nord del lotto." },
      { pagina: 67, testo: "L'ambulanza usa il varco da definire in sede di coordinamento.\nPunto di raccolta da concordare con il gestore." },
    ]});
    expect(r.map(({ campo, pagina, metodo }) => [campo, pagina, metodo])).toEqual([
      ["accesso_soccorsi", 31, "testo"], ["accesso_soccorsi", 52, "ocr"],
    ]);
    const p = posVuoto();
    p.procedure_psc = { psc_presente: true, documento: riferimento, richieste: false, voci: [] };
    p.emergenze.fonti_psc = { accesso_soccorsi: r };
    p.emergenze.piano = { accesso_soccorsi: testoIndicazioniEmergenza(r) };
    const salvato = normalizzaPos(p);
    expect(salvato.emergenze.fonti_psc?.accesso_soccorsi).toEqual(r.map(({ campo: _, ...f }) => f));
    expect(r.map(f => f.fase)).toEqual(["Fase A", "Fase B"]);
    expect(vociMancanti(salvato).some(v => v.testo.includes("indicazioni di emergenza rispetto"))).toBe(false);
    salvato.procedure_psc.documento = { ...riferimento, revisione: "03" };
    expect(vociMancanti(salvato).some(v => v.testo.includes("indicazioni di emergenza rispetto"))).toBe(true);
  });

  it("serramenti in subappalto: una revisione diversa del PSC riapre il riesame", () => {
    const [p] = proponiEmergenzeDalPsc({ riferimento,
      pagine: [{ pagina: 12, metodo: "ocr", testo: "Il punto di raccolta è presso la portineria dell'ingresso principale." }] });
    const d = posVuoto();
    d.impresa.ruolo = "esecutrice_subappalto";
    d.procedure_psc = { psc_presente: true, documento: riferimento, richieste: false, voci: [] };
    d.emergenze.piano = { raccolta: p.estratto };
    const salvato = normalizzaPos({ ...d, emergenze: { ...d.emergenze, fonti_psc: { raccolta: p } } });
    expect(salvato.emergenze.fonti_psc?.raccolta).toMatchObject([{ pagina: 12, metodo: "ocr", sha256: riferimento.sha256 }]);
    expect(vociMancanti(salvato).some(v => /indicazioni di emergenza rispetto/.test(v.testo))).toBe(false);
    salvato.procedure_psc.documento = { ...riferimento, revisione: "03" };
    expect(vociMancanti(salvato).some(v => /indicazioni di emergenza rispetto/.test(v.testo))).toBe(true);
    salvato.procedure_psc.psc_presente = false;
    expect(vociMancanti(salvato).some(v => /indicazioni di emergenza rispetto/.test(v.testo))).toBe(true);
  });

  it("lavori impiantistici: propone consegne univoche e segnala dispositivi ambigui, scaduti e requisiti tecnici", () => {
    const base: Omit<AddettoConConsegne["consegne"][number], "id"> = {
      tipo: "casco", consegnato_il: "2026-02-04", scade_il: null, restituito_il: null, stato: "in_use", versione: 2,
    };
    const addetti: AddettoConConsegne[] = [
      { id: "op-1", nome: "Anita", cognome: "Rossi", attivo: true, assegnazioni: [{ fase_id: "elettrico" }], consegne: [{ ...base, id: "a" }] },
      { id: "op-2", nome: "Carlo", cognome: "Verdi", attivo: true, assegnazioni: [{ fase_id: "elettrico" }], consegne: [{ ...base, id: "b" }, { ...base, id: "c" }] },
      { id: "op-3", nome: "Cora", cognome: "Neri", attivo: true, assegnazioni: [{ fase_id: "elettrico" }], consegne: [{ ...base, id: "d", scade_il: "2026-05-01" }] },
      { id: "op-4", nome: "Renzo", cognome: "Viola", attivo: true, assegnazioni: [{ fase_id: "tetti" }], consegne: [{ ...base, id: "e" }] },
    ];
    const p = suggerisciRiscontriDpiPos(["Casco", "Guanti isolanti classe 0"], addetti, [], "2026-11-20", "elettrico");
    expect(p.proposte.map(r => r.addetto_id)).toEqual(["op-1"]);
    expect(p.daScegliere).toEqual(["Carlo Verdi · Casco"]);
    expect(p.mancanti).toEqual(["Cora Neri · Casco"]);
    expect(p.manuali).toEqual(["Guanti isolanti classe 0"]);
    expect(suggerisciRiscontriDpiPos(["Casco"], addetti, p.proposte, "2026-11-20", "elettrico").proposte).toEqual([]);
  });
  it("rapporto di rumore: legge il valore con unità e mansione e lascia fuori celle isolate o più esiti ambigui", () => {
    expect(proponiEsitiRumore([
      { pagina: 4, testo: "Mansione: Posatore\nLavorazione: Installazione serramenti\nLEX,8h: 79,4 dB(A)" },
      { pagina: 6, testo: "78,1  83,4  90,1\nMansione: Addetto alla sega\nLEX,8h: 84,1 dB(A)\nLEX,w: 83,7 dB(A)" },
      { pagina: 7, testo: "Mansione: Muratore\nLEX,8h: 79,4\nSorgente: martello" },
    ])).toEqual([{ pagina: 4, mansione: "Posatore", lavorazione: "Installazione serramenti",
      esposizione: "LEX,8h: 79,4 dB(A)", estratto: "Mansione: Posatore\nLavorazione: Installazione serramenti\nLEX,8h: 79,4 dB(A)" }]);
  });

  it("manutenzione stradale: 360 voci, quattro fasi, tre ditte e fonti ristrette al capitolo scelto", () => {
    const fasi = ["Scarifica", "Barriere", "Segnaletica", "Ripristino"].map((name, i) => ({ id: `fase-${i}`, name }));
    const computo = { id: "computo-stradale", titolo: "Computo per ordine di intervento", stato: "contrattuale",
      voci: fasi.flatMap(f => Array.from({ length: 90 }, (_, i) => ({
        id: `${f.id}-${i}`, capitolo: f.name, codice: `${f.id}/${i}`, titolo: `${f.name}, tratto ${i + 1}`, unita: "m", quantita: 70,
      }))) };
    expect(capitoliComputoPos(computo, fasi).map(c => [c.nome, c.voci, c.fase?.id])).toEqual(
      fasi.map(f => [f.name, 90, f.id]),
    );
    const fonti = preparaContestoAiPos({ fasi: [fasi[1]], ambito: "", descrizione: "", computo, psc: null,
      limitaAlPerimetro: true, capitoli: ["Barriere"] });
    expect(fonti.computo?.voci).toHaveLength(90);
    const [scheda, ...extra] = applicaFontiProposteAiPos([
      { titolo: "Posa barriere", fase_id: "fase-1", riferimenti_computo: ["C1", "C500"],
        svolgimento: "subappalto", svolgimento_con: "Barriere Demo" },
      { titolo: "Voce estranea", fase_id: "fase-1", riferimenti_computo: ["C500"] },
      { titolo: "Altra fase", fase_id: "fase-0", riferimenti_computo: ["C1"] },
    ], "demo", fonti, { perimetroEsplicito: true, inSubappalto: false,
      subappaltatori: ["Asfalti Demo", "Barriere Demo", "Segnaletica Demo"], richiediVociComputo: true });
    expect(extra).toEqual([]);
    expect(scheda).toMatchObject({ fase_id: "fase-1", svolgimento: "subappalto", svolgimento_con: "Barriere Demo", verificata: false });
    expect(scheda.fonti_scheda?.computo?.voci.map(v => v.id)).toEqual(["fase-1-0"]);
  });

});
