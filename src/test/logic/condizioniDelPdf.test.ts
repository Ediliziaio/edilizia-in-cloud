/**
 * La regola unica: quali condizioni stampa un PDF (07/11/2026).
 *
 * Florin: «le definisco in Contratti e condizioni e le associo: non le devo modificare da altre parti»;
 * e «non devi perdere i contratti inseriti da Renova e quelli di Dimora Torino». Le due frasi stanno
 * insieme solo se la regola ha un ordine preciso: l'archivio comanda quando l'azienda l'ha usato, e
 * finché non l'ha usato il PDF esce identico a prima.
 */
import { describe, expect, it } from "vitest";
import {
  condizioniDelPdf, htmlDelModello, testoPiano, type ModelloArchivio,
} from "../../../supabase/functions/_shared/condizioniArchivio";
import { leggiTestoRiccoContratto } from "../../../supabase/functions/_shared/testoRiccoContratto";

const modello = (p: Partial<ModelloArchivio> = {}): ModelloArchivio => ({
  id: "m1", nome: "Condizioni 2026", ambito: "preventivo", predefinito: true, attivo: true, versione: 2,
  clausole: [{ titolo: "Pagamenti", testo: "30% alla firma." }, { titolo: "Garanzie", testo: "Due anni." }],
  ...p,
});

describe("L'ordine: chi vince su chi", () => {
  it("1. la copia del documento vince su tutto: è scritta per quel cliente, o congelata quando è partito", () => {
    const r = condizioniDelPdf({ copiaDelDocumento: "<p>Solo per il sig. Rossi.</p>", modelloAssociato: modello(), predefinito: modello(), testoDelModulo: "Vecchio", testoDiSistema: "Sistema" });
    expect(r).toMatchObject({ fonte: "documento", testo: "<p>Solo per il sig. Rossi.</p>" });
  });

  it("2. poi il modello associato a quel modulo, prima del predefinito", () => {
    const bagni = modello({ id: "m2", nome: "Condizioni bagno", predefinito: false, clausole: [{ titolo: "Posa", testo: "Piastrelle a carico del cliente." }] });
    const r = condizioniDelPdf({ modelloAssociato: bagni, predefinito: modello(), testoDelModulo: "Vecchio" });
    expect(r.fonte).toBe("associato");
    expect(r.modello?.id).toBe("m2");
    expect(r.testo).toContain("Piastrelle a carico del cliente.");
  });

  it("3. poi il predefinito dell'archivio, che vince sul testo che il modulo aveva", () => {
    const r = condizioniDelPdf({ predefinito: modello(), testoDelModulo: "Il testo vecchio del modulo", testoDiSistema: "Sistema" });
    expect(r.fonte).toBe("predefinito");
    expect(r.testo).not.toContain("vecchio");
  });

  it("4. senza archivio, il testo del modulo — esattamente com'era", () => {
    const vecchio = "# Condizioni\n## 1. Oggetto\n{{azienda.ragione_sociale}} esegue i lavori.";
    expect(condizioniDelPdf({ testoDelModulo: vecchio, testoDiSistema: "Sistema" })).toEqual({ testo: vecchio, fonte: "modulo", modello: null });
    // Spazi in testa e in coda tolti, come faceva il codice di prima.
    expect(condizioniDelPdf({ testoDelModulo: `  ${vecchio}\n` }).testo).toBe(vecchio);
  });

  it("5. senza niente, il testo di sistema del settore; e senza nemmeno quello, niente", () => {
    expect(condizioniDelPdf({ testoDiSistema: "Sistema" }).fonte).toBe("sistema");
    expect(condizioniDelPdf({})).toEqual({ testo: "", fonte: "nessuna", modello: null });
  });
});

describe("Nessuno perde niente", () => {
  it("un modello archiviato, o vuoto, non conta: si scende al testo del modulo", () => {
    expect(condizioniDelPdf({ predefinito: modello({ attivo: false }), testoDelModulo: "Vecchio" }).fonte).toBe("modulo");
    expect(condizioniDelPdf({ predefinito: modello({ clausole: [{ titolo: " ", testo: "<p> </p>" }] }), testoDelModulo: "Vecchio" }).fonte).toBe("modulo");
  });

  it("il testo del modulo vale con la regola di prima (trim), anche se è solo HTML vuoto: si stampa com'era", () => {
    // Prima: `String(t.condizioni_legali_testo ?? "").trim() || condizioniStandard(...)`. Stesso esito, carattere per carattere.
    expect(condizioniDelPdf({ testoDelModulo: "<p></p>", testoDiSistema: "Sistema" })).toMatchObject({ fonte: "modulo", testo: "<p></p>" });
    expect(condizioniDelPdf({ testoDelModulo: "   ", testoDiSistema: "Sistema" }).fonte).toBe("sistema");
  });

  it("una copia del documento vuota non cancella le condizioni: si torna al modello", () => {
    expect(condizioniDelPdf({ copiaDelDocumento: "<p>&nbsp;</p>", testoDelModulo: "Vecchio" }).fonte).toBe("modulo");
  });
});

describe("Quello che esce dall'archivio, il PDF lo sa leggere", () => {
  it("le clausole diventano titoli e paragrafi, nell'ordine", () => {
    const righe = leggiTestoRiccoContratto(htmlDelModello(modello()));
    expect(righe.map((r) => [r.tipo, r.testo])).toEqual([
      ["h2", "Pagamenti"], ["p", "30% alla firma."], ["h2", "Garanzie"], ["p", "Due anni."],
    ]);
  });

  it("il Markdown dei contratti importati diventa HTML: titoli e grassetti restano titoli e grassetti", () => {
    const importato = modello({ clausole: [{ titolo: "Condizioni generali", testo: "# Condizioni contrattuali\n## 1. Oggetto\nL'impresa esegue **i lavori**." }] });
    const righe = leggiTestoRiccoContratto(htmlDelModello(importato));
    expect(righe[0]).toMatchObject({ tipo: "h1", testo: "Condizioni contrattuali" });
    expect(righe.some((r) => r.parti?.some((p) => p.testo.includes("i lavori") && p.stile.grassetto))).toBe(true);
    // Il titolo doppio del 07/11 non c'è più.
    expect(righe.map((r) => r.testo)).not.toContain("Condizioni generali");
  });

  it("gli stili dell'editor arrivano al PDF: grassetto, corsivo, dimensione, carattere, colore, allineamento", () => {
    const dallEditor = '<p style="text-align: justify"><strong>Pagamento</strong> <em>entro</em> <span style="font-size: 14pt; font-family: Georgia, serif; color: #aa0000">30 giorni</span>.</p>';
    const [riga] = leggiTestoRiccoContratto(htmlDelModello(modello({ clausole: [{ titolo: "Pagamenti", testo: dallEditor }] }))).slice(1);
    expect(riga.allineamento).toBe("justify");
    const stile = (testo: string) => riga.parti?.find((p) => p.testo.includes(testo))?.stile;
    expect(stile("Pagamento")?.grassetto).toBe(true);
    expect(stile("entro")?.corsivo).toBe(true);
    expect(stile("30 giorni")).toMatchObject({ dimensione: 14, famiglia: "times", colore: "#aa0000" });
  });

  it("un contratto in Markdown passa così com'è: il PDF legge le stesse righe di prima", () => {
    // Il caso del 07/11 provato sui contratti veri: una clausola sola in Markdown deve stampare il testo di prima.
    const md = "# Condizioni generali\n## Art. 1 — Oggetto\nL'impresa esegue **i lavori**.\n## Clausole da approvare specificamente (art. 1341 c.c.)\n- Art. 3 — Penali\n- Art. 9 — Foro";
    const dallArchivio = leggiTestoRiccoContratto(htmlDelModello(modello({ clausole: [{ titolo: "Condizioni generali", testo: md }] })));
    expect(dallArchivio).toEqual(leggiTestoRiccoContratto(md));
  });

  it("gli elenchi restano elenchi anche mescolati all'HTML: la seconda firma non sparisce", () => {
    // Con `contrattoInHtml` le voci diventavano paragrafi «• …», e l'elenco delle clausole da approvare spariva.
    const misto = modello({ clausole: [
      { titolo: "Contratto", testo: "<h2>Contratto</h2><p>Testo scritto con l'editor.</p>" },
      { titolo: "Approvazioni", testo: "## Clausole da approvare specificamente (art. 1341 c.c.)\n- Penali\n- Foro" },
    ] });
    const righe = leggiTestoRiccoContratto(htmlDelModello(misto));
    expect(righe.filter((r) => r.tipo === "li").map((r) => r.testo)).toEqual(["Penali", "Foro"]);
  });

  it("le clausole segnate «da approvare a parte» non si ripetono se il contratto ha già il suo elenco", () => {
    const conElenco = modello({ clausole: [
      { titolo: "Condizioni", testo: "# Condizioni\n## Clausole da approvare specificamente\n- Foro", vessatoria: true },
    ] });
    expect(htmlDelModello(conElenco).match(/approvare specificamente/g)).toHaveLength(1);
  });

  it("i titoli con caratteri speciali non rompono l'HTML", () => {
    const righe = leggiTestoRiccoContratto(htmlDelModello(modello({ clausole: [{ titolo: "Prezzi <IVA> & oneri", testo: "Testo." }] })));
    expect(righe[0].testo).toBe("Prezzi <IVA> & oneri");
  });
});

describe("Il testo semplice, per chi non stampa un PDF", () => {
  it("toglie i tag, rimette gli a capo e i caratteri", () => {
    expect(testoPiano("<p>Prima &amp; seconda</p><p>Terza&nbsp;riga</p>")).toBe("Prima & seconda\nTerza riga");
  });
});
