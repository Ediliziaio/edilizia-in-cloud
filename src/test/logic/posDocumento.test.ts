import { describe, expect, it } from "vitest";
import { costruisciHtmlPos, elenchiCantiereHtml, vociElenco, type DatiStampaPos } from "../../../supabase/functions/_shared/posHtml";
import { layoutPdfPos } from "../../../supabase/functions/_shared/posPdfLayout";
import { lavorazioneVuota, posVuoto, type PosContenuto } from "../../../supabase/functions/_shared/posModello";
import { caselleInLettere, MARCA_CASELLA_NO, MARCA_CASELLA_SI, testoPerPdfConCaselle } from "../../../supabase/functions/_shared/posTestoPdf";
import { esempioPdfPos } from "../fixtures/posEsempioPdf";

const EMESSO = "2026-10-30T10:00:00Z";
type Nodo = Record<string, any>;
const contenuto = (d: DatiStampaPos, anteprima = false): Nodo[] => layoutPdfPos(costruisciHtmlPos(d), "T-1", d.revisione, EMESSO, anteprima).definizione.content as Nodo[];
const definizione = (d: DatiStampaPos, anteprima = false): Nodo => layoutPdfPos(costruisciHtmlPos(d), "T-1", d.revisione, EMESSO, anteprima).definizione as Nodo;
/** Tutti i nodi della definizione, a ogni profondità. */
const nodi = (x: unknown, fuori: Nodo[] = []): Nodo[] => {
  if (Array.isArray(x)) x.forEach((i) => nodi(i, fuori));
  else if (x && typeof x === "object") { fuori.push(x as Nodo); Object.values(x as Nodo).forEach((v) => nodi(v, fuori)); }
  return fuori;
};
const conLavorazioni = (): PosContenuto => {
  const p = posVuoto();
  const l1 = { ...lavorazioneVuota("l1"), titolo: "Ponteggio", opere_provvisionali: "Ponteggio metallico fisso", macchine: "Autocarro con gru", impianti: "Nessuno", sostanze: "Nessuna" };
  const l2 = { ...lavorazioneVuota("l2"), titolo: "Cappotto", opere_provvisionali: "ponteggio metallico FISSO\n- Trabattello", macchine: "Trapano tassellatore, miscelatore", impianti: "Impianto elettrico di cantiere", sostanze: "Collante cementizio, rasante: scheda di sicurezza allegata" };
  p.lavorazioni = [l1, l2];
  return p;
};
const dati = (p: PosContenuto, extra: Partial<DatiStampaPos> = {}): DatiStampaPos => ({ contenuto: p, stato: "approvato", revisione: 0, revisioni: [], approvatoDa: "Mario Rossi", approvatoIl: "2026-10-30T09:30:00Z", ...extra });

describe("copertina e indirizzo", () => {
  it("la provincia sta attaccata alla località: «Como (CO)», non «Como, (CO)»", () => {
    const p = posVuoto();
    p.opera.cantiere = { via: "Via Mazzini 14", localita: "Como", provincia: "CO" };
    const html = costruisciHtmlPos(dati(p));
    expect(html).toContain("Via Mazzini 14, Como (CO)");
    expect(html).not.toContain("Como, (CO)");
    p.opera.cantiere = { via: "Via Roma 1", localita: "", provincia: "MI" };
    expect(costruisciHtmlPos(dati(p))).toContain("Via Roma 1, (MI)");
  });

  it("un POS approvato dice in copertina da chi e quando; una bozza no (ha già il suo riquadro rosso)", () => {
    const p = posVuoto();
    p.opera.committente.nominativo = "Fabio Riva";
    p.opera.data_inizio = "2026-11-02"; p.opera.data_fine = "2026-12-18";
    const approvato = costruisciHtmlPos(dati(p, { emessoIl: EMESSO }));
    expect(approvato).toContain('class="stato-doc"');
    expect(approvato).toMatch(/approvata nell'app il 30\/10\/2026 da Mario Rossi · PDF emesso il 30\/10\/2026/);
    expect(approvato).toContain("Fabio Riva");
    expect(approvato).toContain("02/11/2026 — 18/12/2026");
    const bozza = costruisciHtmlPos(dati(p, { stato: "bozza" }));
    expect(bozza).not.toContain('class="stato-doc"');
    expect(bozza).toContain("BOZZA");
  });

  it("l'impresa e il cantiere viaggiano nel modello: l'intestazione di ogni pagina non ha bisogno d'altro", () => {
    const p = posVuoto();
    p.impresa.ragione_sociale = "Edil Rossi S.r.l.";
    p.opera.cantiere = { via: "Via Mazzini 14", localita: "Como", provincia: "CO" };
    const def = definizione(dati(p));
    expect(def.info.author).toBe("Edil Rossi S.r.l.");
    expect(def.header(1)).toBeNull();
    const intestazione = def.header(2);
    expect(JSON.stringify(intestazione)).toContain("Edil Rossi S.r.l.");
    expect(JSON.stringify(intestazione)).toContain("Via Mazzini 14, Como (CO)");
    expect(def.footer(2, 11).text).toContain("emesso il 30/10/2026");
    // Nell'anteprima non c'è data di emissione.
    expect(definizione(dati(p, { stato: "bozza" }), true).footer(2, 11).text).not.toContain("emesso il");
  });

  it("il QR di verifica compare solo se c'è l'indirizzo e solo se è un https pulito", () => {
    const p = posVuoto();
    const url = "https://app.esempio.it/verifica-pos/3f9a1c2e-0b7d-4e6a-9c1d-5b2e8a7f4d10";
    expect(nodi(contenuto(dati(p))).some((n) => "qr" in n)).toBe(false);
    expect(nodi(contenuto(dati(p, { urlVerifica: url }))).find((n) => "qr" in n)?.qr).toBe(url);
    for (const cattivo of ["http://app.esempio.it/verifica-pos/x", "https://app.esempio.it/x?a=b", "javascript:alert(1)", "https://app.esempio.it/<script>"]) {
      expect(() => contenuto(dati(p, { urlVerifica: cattivo }))).toThrow(/Indirizzo di verifica/);
    }
  });
});

describe("sezioni, tabelle e caselle", () => {
  it("le sezioni sono numerate, il riferimento di legge sta a parte e l'indice non lo ripete", () => {
    const c = contenuto(dati(esempioPdfPos().contenuto));
    const titoli = nodi(c).filter((n) => n.tocItem).map((n) => n.text as string);
    expect(titoli).toHaveLength(11);
    expect(titoli[0]).toBe("1. Identificazione e descrizione dell'opera");
    expect(titoli[10]).toBe("11. Firme");
    expect(titoli.some((t) => t.includes("3.2.1"))).toBe(false);
    const rif = nodi(c).filter((n) => typeof n.text === "string" && n.text.startsWith("Allegato XV, "));
    expect(rif.length).toBeGreaterThanOrEqual(9);
    // «lettera b)» non perde la sua parentesi
    expect(rif.some((n) => n.text === "Allegato XV, 3.2.1 lettera a) punto 6 e lettera b)")).toBe(true);
  });

  it("le righe delle tabelle non si spezzano fra due pagine e le colonne di numeri sono strette", () => {
    const tabelle = nodi(contenuto(dati(esempioPdfPos().contenuto))).filter((n) => n.table && Array.isArray(n.table.body) && n.table.widths?.length > 1); // i riquadri a una cella (stato, avvisi) non sono tabelle dati
    expect(tabelle.length).toBeGreaterThan(10);
    expect(tabelle.every((t) => t.table.dontBreakRows === true)).toBe(true);
    const lavoratori = tabelle.find((t) => JSON.stringify(t.table.body[0]).includes("Numero"))!;
    expect(lavoratori.table.widths[1]).toBeGreaterThanOrEqual(46);
    expect(lavoratori.table.widths[1]).toBeLessThan(70);
    const formazione = tabelle.find((t) => JSON.stringify(t.table.body[0]).includes("Rischi di cantiere"))!;
    expect(formazione.table.widths[0]).toBeLessThan(40);
  });

  it("la formazione è una matrice: una riga per lavoratore, una casella per colonna", () => {
    const p = posVuoto();
    p.formazione = [
      { nominativo: "Luca Bianchi", qualifica: "Capocantiere", base: true, rischi_specifici: true, rischi_cantiere: false, dpi_terza_categoria: true, altro: "Preposto", attestati: "Preposto 8 ore, scade 12/03/2030", verificata: true },
      { nominativo: "Marco Operaio", qualifica: "Operaio", base: true, rischi_specifici: false, rischi_cantiere: false, dpi_terza_categoria: false, altro: "", attestati: "", verificata: true },
    ];
    const html = costruisciHtmlPos(dati(p));
    const matrice = html.slice(html.indexOf('<table class="matrice">'), html.indexOf("</table>", html.indexOf('<table class="matrice">')));
    expect(matrice.match(/<tr>/g)).toHaveLength(3); // intestazione + 2 lavoratori
    expect(matrice.match(/&#9746;/g)).toHaveLength(4); // spuntate
    expect(matrice.match(/&#9744;/g)).toHaveLength(4); // vuote
    expect(matrice).toContain("Altro: Preposto<br>Attestati: Preposto 8 ore, scade 12/03/2030");
    expect(html).toContain("Rischi specifici: rischi specifici e di mansione");
  });

  it("le caselle sono due segni privati per il layout e «[x]»/«[ ]» per il controllo dei glifi; un utente non può fingerle", () => {
    expect(testoPerPdfConCaselle("☒ sì ☐ no ☑ ok")).toBe(`${MARCA_CASELLA_SI} sì ${MARCA_CASELLA_NO} no ${MARCA_CASELLA_SI} ok`);
    expect(caselleInLettere(testoPerPdfConCaselle("☒ sì ☐ no"))).toBe("[x] sì [ ] no");
    // Un segno privato scritto da un utente sparisce: non diventa una casella.
    expect(testoPerPdfConCaselle(`falso ${MARCA_CASELLA_SI} spunta`)).toBe("falso  spunta");
    const p = posVuoto();
    p.rls.nominativo = `Mario ${MARCA_CASELLA_SI}`;
    const caselle = nodi(contenuto(dati(p))).filter((n) => n.font === "PosCaselle");
    const attese = (costruisciHtmlPos(dati(p)).match(/&#9746;|&#9744;/g) || []).length;
    expect(caselle).toHaveLength(attese);
    expect(caselle.every((n) => n.text === "☒" || n.text === "☐")).toBe(true);
  });

  it("i dati non compilati escono «—», le celle lasciate libere per le firme restano bianche", () => {
    const c = contenuto(dati(posVuoto()));
    const celle = nodi(c).filter((n) => typeof n.text === "string");
    expect(celle.some((n) => n.text === "—" && n.color === "#8a97a6")).toBe(true);
    const firme = nodi(c).find((n) => n.unbreakable === true && n.table)!;
    expect(firme.table.heights).toBeTypeOf("function");
  });
});

describe("elenchi di cantiere (Allegato XV 3.2.1 d ed e)", () => {
  it("le voci dei campi liberi: una per riga, ; o , — senza puntini, «nessuna» né doppioni", () => {
    expect(vociElenco("Trapano tassellatore, miscelatore")).toEqual(["Trapano tassellatore", "Miscelatore"]);
    expect(vociElenco("- Ponteggio\n• Trabattello; Gru a torre")).toEqual(["Ponteggio", "Trabattello", "Gru a torre"]);
    expect(vociElenco("Nessuna")).toEqual([]);
    expect(vociElenco("Non presenti")).toEqual([]);
    expect(vociElenco("   ")).toEqual([]);
  });

  it("mette insieme le lavorazioni, senza doppioni e con i numeri delle lavorazioni", () => {
    const html = elenchiCantiereHtml(conLavorazioni());
    expect(html).toContain("Elenco dei ponteggi, delle opere provvisionali, delle macchine e degli impianti utilizzati in cantiere");
    expect(html).toContain("3.2.1 lettera d)");
    // «Ponteggio metallico fisso» è in entrambe (anche scritto diverso) → una riga sola, «n. 1, 2»
    expect(html.match(/Ponteggio metallico fisso/gi)).toHaveLength(1);
    expect(html).toContain("n. 1, 2");
    expect(html).toContain("<td>Trabattello</td><td>n. 2</td>");
    expect(html).toContain("<td>Miscelatore</td><td>n. 2</td>");
    // «Nessuno» non è un impianto
    expect(html).not.toMatch(/<td>Nessuno<\/td>/);
    expect(html).toContain("<td>Impianto elettrico di cantiere</td><td>n. 2</td>");
  });

  it("le sostanze perdono la nota «scheda di sicurezza allegata» scritta in coda e hanno la loro colonna", () => {
    const html = elenchiCantiereHtml(conLavorazioni());
    expect(html).toContain("Elenco delle sostanze e dei preparati pericolosi utilizzati in cantiere");
    expect(html).toContain("<td>Collante cementizio</td>");
    expect(html).toContain("<td>Rasante</td>");
    expect(html).not.toContain("Rasante: scheda");
    expect(html).toContain("Da allegare"); // nessuna scheda tra gli allegati
    const p = conLavorazioni();
    p.allegati = [{ tipo: "scheda_sicurezza", nome: "SDS collante.pdf", file_path: "x/y.pdf" }];
    expect(elenchiCantiereHtml(p)).toContain("Vedi l&#39;elenco degli allegati");
  });

  it("senza sostanze o senza lavorazioni lo dice, non lascia tabelle vuote", () => {
    const p = posVuoto();
    expect(elenchiCantiereHtml(p)).toContain("Da indicare nelle schede delle lavorazioni.");
    p.lavorazioni = [{ ...lavorazioneVuota("l1"), titolo: "X", sostanze: "Nessuna", opere_provvisionali: "Nessuna", macchine: "Nessuna", impianti: "Nessuno" }];
    const html = elenchiCantiereHtml(p);
    expect(html).toContain("Nessuna opera provvisionale, macchina o impianto dichiarato nelle lavorazioni.");
    expect(html).toContain("Nessuna sostanza o preparato pericoloso dichiarato nelle lavorazioni.");
  });

  it("le attrezzature della scheda tecnica entrano nell'elenco delle macchine con il riferimento d'inventario", () => {
    const p = conLavorazioni();
    p.versione_tecnica = 1;
    p.lavorazioni[0].tecnica = { riesaminata: false, attrezzature: [{ nome: "Gru a torre", anagrafica: undefined }] } as never;
    expect(elenchiCantiereHtml(p)).toContain("<td>Gru a torre</td><td>n. 1</td>");
  });
});
