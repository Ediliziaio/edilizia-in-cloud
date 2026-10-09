/**
 * Il PDF del rapportino a blocchi: fascia con i colori dell'azienda, contatori, una scheda per ogni fase
 * (avanzamento, materiali e foto di quella fase), poi squadra, tempi, segnalazioni, foto e firme.
 *
 * pdf-lib arriva da esm.sh nelle edge function: qui lo stesso pacchetto da node_modules. Il documento si
 * disegna davvero; per leggerlo si ascoltano le chiamate a drawText, nell'ordine in cui il documento le fa
 * (dall'alto in basso, pagina dopo pagina; il piè di pagina viene alla fine).
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => await import("pdf-lib"));

import { PDFDocument, PDFPage, type PDFPageDrawTextOptions } from "pdf-lib";
import sharp from "sharp";

// Caricato per percorso in una variabile: il modulo importa pdf-lib da un indirizzo esm.sh che il controllo
// dei tipi dell'app non sa risolvere, e non deve seguirlo.
const PERCORSO = "../../../supabase/functions/genera-pdf-rapportino/render";
const { renderRapportino } = await import(/* @vite-ignore */ PERCORSO);

const drawTextVero = PDFPage.prototype.drawText;

interface Scritto { testo: string; pagina: number; colore: { red: number; green: number; blue: number } | undefined }

let FOTO: Uint8Array;
let FIRMA: Uint8Array;
beforeAll(async () => {
  FOTO = new Uint8Array(await sharp({ create: { width: 64, height: 48, channels: 3, background: "#c9b79c" } }).jpeg().toBuffer());
  FIRMA = new Uint8Array(await sharp({ create: { width: 60, height: 20, channels: 3, background: "#1d3557" } }).png().toBuffer());
});
afterEach(() => vi.restoreAllMocks());

const ID = "9f1c2a40-7b1e-4c1f-9a66-0c2f3d4e5a60";
const SIGLA = "9F1C2A40";

const azienda = { name: "Renova Solution S.r.l.", legal_address: "Via dei Cantieri 12", legal_city: "20099 Sesto San Giovanni (MI)", email: "info@renova.example", phone: "02 1234567", vat_number: "01234567890" };
const fasi = [
  { id: "ph-1", name: "Demolizioni e allestimento" },
  { id: "ph-2", name: "Posa serramenti piano primo" },
  { id: "ph-3", name: "Finiture e sigillature" },
];
const base = {
  id: ID, data_lavoro: "2026-10-05", lavoro_completato: false, stato: "inviato", role_type: "employee",
  autore: { first_name: "Marco", last_name: "Operaio" },
  ordine: { order_code: "ORD-2026-041", description: "Sostituzione serramenti villa Bianchi", client_name: "Famiglia Bianchi", work_address: "Via Mazzini 14, Como" },
  ore_lavorate: 8, ore_straordinario: 0, descrizione_lavori: "Smontati i vecchi infissi del piano primo e posati tre serramenti su cinque.",
  fasi_lavorate: [] as unknown[], materiali_usati: [] as unknown[], presenze: null as unknown, foto_urls: [] as string[], note: "",
};

/** Un rapportino di una giornata piena: tre fasi, materiali e foto legati alla fase, qualcosa di generale. */
const giornataPiena = () => ({
  ...base,
  presenze: [{ nome: "Marco Operaio", employee_id: "e1", ore: 8 }, { nome: "Luigi Esterni", subappaltatore_id: "s1", ore: 6 }, { nome: "Idraulica Salerno", subappaltatore_id: "s2", ore: 4 }],
  ore_lavorate: 0,
  fasi_lavorate: [
    { phase_id: "ph-1", percentuale: 100, nome: "Demolizioni e allestimento", foto: ["foto:0", "foto:1"] },
    { phase_id: "ph-2", percentuale: 60, nome: "Posa serramenti piano primo", foto: ["foto:2", "foto:3"], ore: 3.5 },
    { phase_id: "ph-3", percentuale: 20, nome: "Finiture e sigillature" },
  ],
  materiali_usati: [
    { nome: "Schiuma poliuretanica 750 ml", quantita: 6, unita: "pz", da_furgone: true, fase_id: "ph-2" },
    { nome: "Controtelaio in abete 120x140", quantita: 3, unita: "pz", order_item_id: "oi1", fase_id: "ph-2" },
    { nome: "Nastro sigillante perimetrale", quantita: 24, unita: "m", order_item_id: "oi2", fase_id: "ph-3" },
    { nome: "Sacchi macerie", quantita: 12, unita: "pz", fase_id: "ph-1" },
    { nome: "Viti inox 5x80", quantita: 150, unita: "pz" },
  ],
  foto_urls: ["foto:0", "foto:1", "foto:2", "foto:3", "foto:4"],
  note: "Il cliente chiede di anticipare la posa del portoncino a giovedì.",
});

async function disegna(report: Record<string, unknown>, opzioni: { punches?: unknown[]; branding?: Record<string, unknown>; phases?: unknown[]; mancano?: string[] } = {}) {
  const scritti: Scritto[] = [];
  vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, testo: string, o?: PDFPageDrawTextOptions): void {
    scritti.push({ testo, pagina: this.doc.getPages().indexOf(this), colore: o?.color as unknown as Scritto["colore"] });
    drawTextVero.call(this, testo, o);
  });
  const caricamenti: { ref: string; kind: string }[] = [];
  const risultato = await renderRapportino({
    report, company: azienda, branding: { primaryColor: "#1E5AA8", platformName: "Edilizia in Cloud", ...opzioni.branding },
    phases: opzioni.phases ?? fasi, punches: opzioni.punches ?? [], warnings: [], revision: "R1", generatedAt: "2026-10-05T17:00:00Z",
  }, async (ref: string, kind: string) => {
    caricamenti.push({ ref, kind });
    if (opzioni.mancano?.includes(ref)) return null;
    return kind === "photo" ? FOTO : FIRMA;
  });
  // Il corpo del documento: tutto ciò che viene prima del piè di pagina.
  const finePagine = scritti.findIndex(s => s.testo.startsWith(`Rif. ${SIGLA} | Edizione`));
  const corpo = finePagine === -1 ? scritti : scritti.slice(0, finePagine);
  return { scritti, corpo, risultato, caricamenti, testi: corpo.map(s => s.testo) };
}
const posizione = (testi: string[], t: string) => testi.indexOf(t);
const valoreDopo = (testi: string[], etichetta: string) => testi[testi.indexOf(etichetta) + 1];

describe("rapportino a blocchi: una scheda per fase", () => {
  it("materiali di ogni fase stanno sotto la fase giusta, e quelli generali in coda", async () => {
    const { testi } = await disegna(giornataPiena());
    const f1 = posizione(testi, "Demolizioni e allestimento");
    const f2 = posizione(testi, "Posa serramenti piano primo");
    const f3 = posizione(testi, "Finiture e sigillature");
    const altri = posizione(testi, "ALTRI MATERIALI");
    expect(f1).toBeGreaterThan(-1);
    expect(f1 < f2 && f2 < f3 && f3 < altri).toBe(true);

    const tra = (nome: string, da: number, a: number) => { const i = posizione(testi, nome); return i > da && i < a; };
    expect(tra("Sacchi macerie", f1, f2)).toBe(true);
    expect(tra("Schiuma poliuretanica 750 ml", f2, f3)).toBe(true);
    expect(tra("Controtelaio in abete 120x140", f2, f3)).toBe(true);
    expect(tra("Nastro sigillante perimetrale", f3, altri)).toBe(true);
    expect(posizione(testi, "Viti inox 5x80")).toBeGreaterThan(altri);
  });

  it("ogni scheda dice a che punto è la fase", async () => {
    const { testi } = await disegna(giornataPiena());
    expect(testi).toContain("100%");
    expect(testi).toContain("COMPLETATA");
    expect(testi).toContain("60%");
    expect(testi).toContain("20%");
    expect(testi.filter(t => t === "IN CORSO")).toHaveLength(2);
  });

  it("le ore dichiarate su una fase si leggono nella sua scheda", async () => {
    const { testi } = await disegna(giornataPiena());
    expect(testi).toContain("3 h 30 dichiarate su questa lavorazione");
  });

  it("le foto di una fase sono nella sua scheda, con il conto", async () => {
    const { testi } = await disegna(giornataPiena());
    expect(testi).toContain("FOTO DELLA LAVORAZIONE (2)");
    expect(testi.filter(t => t === "FOTO DELLA LAVORAZIONE (2)")).toHaveLength(2);
    expect(testi).toContain("ALTRE FOTO DEL CANTIERE"); // foto:4 non è di nessuna fase
  });

  it("i contatori contano tutto il rapportino", async () => {
    const { testi } = await disegna(giornataPiena());
    expect(valoreDopo(testi, "ORE SQUADRA")).toBe("18 h");
    expect(valoreDopo(testi, "LAVORAZIONI")).toBe("3");
    expect(valoreDopo(testi, "MATERIALI")).toBe("5");
    expect(valoreDopo(testi, "FOTO")).toBe("5");
  });

  it("con una fase sola il titolo è «Lavorazione», con più fasi «Lavorazioni»", async () => {
    const una = await disegna({ ...base, fasi_lavorate: [{ phase_id: "ph-2", percentuale: 40, nome: "Posa" }] });
    expect(una.testi).toContain("LAVORAZIONE");
    const piu = await disegna(giornataPiena());
    expect(piu.testi.filter(t => t === "LAVORAZIONI")).toHaveLength(2); // il contatore e il titolo
    expect(piu.testi).not.toContain("LAVORAZIONE");
  });

  it("una fase senza avanzamento dichiarato è «lavorata», senza barra né percentuale", async () => {
    const { testi } = await disegna({ ...base, fasi_lavorate: [{ phase_id: "ph-1", nome: "Demolizioni" }] });
    expect(testi).toContain("LAVORATA");
    expect(testi.some(t => /^\d+%$/.test(t))).toBe(false);
  });

  it("le foto si scaricano nell'ordine delle schede, poi le altre; le firme e il logo non si confondono con le foto", async () => {
    const { caricamenti } = await disegna({
      ...base,
      fasi_lavorate: [{ phase_id: "ph-1", foto: ["foto:3"] }, { phase_id: "ph-2", foto: ["foto:1", "foto:0"] }],
      foto_urls: ["foto:0", "foto:1", "foto:2", "foto:3"],
      firma_operaio_url: "firma:op",
    }, { branding: { logoUrl: "logo:azienda" } });
    expect(caricamenti.filter(c => c.kind === "photo").map(c => c.ref)).toEqual(["foto:3", "foto:1", "foto:0", "foto:2"]);
    expect(caricamenti.filter(c => c.kind !== "photo").map(c => `${c.kind}:${c.ref}`).sort()).toEqual(["logo:logo:azienda", "signature:firma:op"]);
  });

  it("ogni immagine si scarica una volta sola, anche se compare due volte", async () => {
    const { caricamenti } = await disegna({ ...base, foto_urls: ["foto:0", "foto:0"] });
    expect(caricamenti.filter(c => c.ref === "foto:0")).toHaveLength(1);
  });
});

describe("rapportino a blocchi: i rapportini di sempre", () => {
  it("senza collegamenti (vocale, WhatsApp, storico) le fasi hanno la scheda e il resto va in «Altri materiali»", async () => {
    const { testi, risultato } = await disegna({
      ...base,
      fasi_lavorate: [{ phase_id: "ph-1", percentuale: 40 }],
      materiali_usati: [{ nome: "Colla", quantita: 2, unita: "kg" }],
      foto_urls: ["foto:0"],
    });
    expect(testi).toContain("Demolizioni e allestimento"); // il nome viene dall'elenco delle fasi della commessa
    expect(testi).toContain("ALTRI MATERIALI");
    expect(testi).toContain("Colla");
    expect(testi).toContain("DOCUMENTAZIONE FOTOGRAFICA"); // nessuna fase ha foto: sono tutte generali
    expect(testi).not.toContain("ALTRE FOTO DEL CANTIERE");
    expect(risultato.warnings).toEqual([]);
  });

  it("senza fasi: «Materiali utilizzati» e «Documentazione fotografica»", async () => {
    const { testi } = await disegna({ ...base, materiali_usati: [{ nome: "Colla", quantita: 2, unita: "kg" }], foto_urls: ["foto:0", "foto:1"] });
    expect(testi).toContain("MATERIALI UTILIZZATI");
    expect(testi).toContain("DOCUMENTAZIONE FOTOGRAFICA");
    expect(testi).not.toContain("ALTRI MATERIALI");
    expect(testi).not.toContain("LAVORAZIONE");
  });

  it("senza nulla da mostrare non compaiono blocchi vuoti", async () => {
    const { testi, risultato } = await disegna({ ...base, ore_lavorate: 0, descrizione_lavori: "Sopralluogo." });
    for (const titolo of ["SQUADRA", "ALTRI MATERIALI", "MATERIALI UTILIZZATI", "DOCUMENTAZIONE FOTOGRAFICA", "NOTE E SEGNALAZIONI", "FIRME", "TEMPI DI CHI COMPILA", "LAVORAZIONI", "LAVORAZIONE"]) {
      expect(testi.filter(t => t === titolo), titolo).toHaveLength(titolo === "LAVORAZIONI" ? 1 : 0); // «LAVORAZIONI» è anche il contatore
    }
    expect(testi).toContain("COSA È STATO FATTO");
    expect(testi).toContain("NOTE DEL DOCUMENTO");
    expect(risultato.pageCount).toBe(1);
  });

  it("l'avanzamento generale compare solo se c'è e la commessa non ha fasi", async () => {
    const con = await disegna({ ...base, percentuale_avanzamento: 35 });
    expect(con.testi.some(t => t.includes("Avanzamento generale dichiarato della commessa: 35%"))).toBe(true);
    const zero = await disegna({ ...base, percentuale_avanzamento: 0 });
    expect(zero.testi.some(t => t.includes("Avanzamento generale"))).toBe(false);
  });
});

describe("rapportino a blocchi: lo stato e le firme", () => {
  it("un rapportino rifiutato mostra il motivo in cima, prima dei contatori", async () => {
    const { testi } = await disegna({ ...base, stato: "rifiutato", motivo_rifiuto: "Mancano le ore degli altri operai." });
    const rifiutato = posizione(testi, "RAPPORTINO RIFIUTATO DALL'UFFICIO");
    expect(rifiutato).toBeGreaterThan(-1);
    expect(rifiutato).toBeLessThan(posizione(testi, "ORE LAVORATE"));
    expect(testi).toContain("Mancano le ore degli altri operai.");
    expect(testi).toContain("RIFIUTATO");
  });

  it("senza motivo registrato lo dice, non lo inventa", async () => {
    const { testi } = await disegna({ ...base, stato: "rifiutato", motivo_rifiuto: null });
    expect(testi).toContain("Motivazione non registrata.");
  });

  it("un rapportino approvato dice che non è una firma del cliente", async () => {
    const { testi } = await disegna({ ...base, stato: "approvato", approvato_at: "2026-10-06T07:10:00Z" });
    expect(testi).toContain("VERIFICA DELL'UFFICIO");
    expect(testi.some(t => t.startsWith("Rapportino approvato il"))).toBe(true);
    expect(testi).toContain("APPROVATO");
  });

  it("il rapporto di fine lavori ha le due firme, anche se quella del cliente manca", async () => {
    const { testi } = await disegna({ ...base, lavoro_completato: true, firma_operaio_url: "firma:op", firma_cliente_nome: "Anna Bianchi" });
    expect(testi).toContain("Rapporto di fine lavori".toUpperCase());
    expect(testi).toContain("FIRME");
    expect(testi).toContain("FIRMA DEL COMPILATORE");
    expect(testi).toContain("FIRMA DEL CLIENTE");
    expect(testi).toContain("Firma non acquisita");
    expect(testi).toContain("Anna Bianchi");
  });

  it("un rapportino giornaliero senza firme non mostra il blocco delle firme", async () => {
    const { testi } = await disegna(base);
    expect(testi).not.toContain("FIRME");
  });
});

describe("rapportino a blocchi: intestazione e squadra", () => {
  it("cantiere, cliente e compilatore si leggono nella scheda della commessa", async () => {
    const { testi } = await disegna(base);
    expect(valoreDopo(testi, "CANTIERE")).toBe("Via Mazzini 14, Como");
    expect(valoreDopo(testi, "CLIENTE")).toBe("Famiglia Bianchi");
    expect(valoreDopo(testi, "COMPILATORE")).toBe("Marco Operaio");
    expect(testi).toContain("Personale interno");
    expect(testi).toContain("ORD-2026-041");
    expect(testi).toContain("5 ottobre 2026");
  });

  it("la squadra ha una riga per persona, con l'inquadramento, e il totale", async () => {
    const { testi } = await disegna(giornataPiena());
    const squadra = posizione(testi, "SQUADRA");
    expect(squadra).toBeGreaterThan(-1);
    expect(testi.slice(squadra)).toEqual(expect.arrayContaining(["Marco Operaio", "Luigi Esterni", "Idraulica Salerno", "Totale presenze", "18 h"]));
    expect(testi.filter(t => t === "Subappaltatore")).toHaveLength(2);
  });

  it("i tempi di chi compila mostrano le timbrature in ora italiana e lo straordinario", async () => {
    const { testi } = await disegna({ ...base, ore_straordinario: 1.5 }, {
      punches: [{ tipo: "entrata", timestamp_evento: "2026-10-05T06:00:00Z" }, { tipo: "uscita", timestamp_evento: "2026-10-05T14:30:00Z" }],
    });
    expect(testi).toContain("TEMPI DI CHI COMPILA");
    expect(valoreDopo(testi, "ENTRATA")).toBe("08:00");
    expect(valoreDopo(testi, "USCITA")).toBe("16:30");
    expect(valoreDopo(testi, "STRAORDINARIO")).toBe("1 h 30");
  });

  it("le note vanno in un riquadro «Da leggere»", async () => {
    const { testi } = await disegna(giornataPiena());
    expect(testi).toContain("NOTE E SEGNALAZIONI");
    expect(testi).toContain("DA LEGGERE");
    expect(testi.some(t => t.includes("portoncino"))).toBe(true);
  });
});

describe("rapportino a blocchi: colori dell'azienda", () => {
  const coloreDelNome = async (primaryColor: string) => {
    const { corpo } = await disegna(base, { branding: { primaryColor } });
    return corpo.find(s => s.testo === "Renova Solution S.r.l.")!.colore!;
  };

  it("sul colore scuro la fascia scrive in bianco", async () => {
    const c = await coloreDelNome("#1E5AA8");
    expect([c.red, c.green, c.blue]).toEqual([1, 1, 1]);
  });

  it("sul colore chiaro la fascia scrive in scuro", async () => {
    const c = await coloreDelNome("#FFD700");
    expect(c.red).toBeLessThan(0.2);
    expect(c.blue).toBeLessThan(0.3);
  });

  it("un colore non valido ricade sull'arancione della piattaforma, senza rompere il documento", async () => {
    const c = await coloreDelNome("rosso");
    expect(c.red).toBeLessThan(0.2); // scuro su arancione: è il contrasto migliore
  });
});

describe("rapportino a blocchi: affidabilità", () => {
  it("una foto che non si scarica lascia il segnaposto e un'avvertenza col numero giusto", async () => {
    const { testi, risultato } = await disegna({
      ...base,
      fasi_lavorate: [{ phase_id: "ph-2", percentuale: 40, nome: "Posa", foto: ["foto:ok", "foto:manca"] }],
      foto_urls: ["foto:ok", "foto:manca"],
    }, { mancano: ["foto:manca"] });
    expect(testi).toContain("Immagine non disponibile");
    expect(testi).toContain("AVVERTENZE DEL DOCUMENTO");
    expect(risultato.warnings).toEqual(["Foto 2: impossibile includere l'immagine. Rigenerare dopo la verifica dell'allegato."]);
  });

  it("una firma che non si scarica lo dice, senza far fallire il PDF", async () => {
    const { testi, risultato } = await disegna({ ...base, lavoro_completato: true, firma_operaio_url: "firma:manca" }, { mancano: ["firma:manca"] });
    expect(testi).toContain("Firma registrata, immagine non disponibile");
    expect(risultato.warnings).toEqual(["Firma del compilatore: immagine non inclusa."]);
  });

  it("un'immagine che non è né JPEG né PNG non fa cadere il documento", async () => {
    const originale = FOTO;
    FOTO = new TextEncoder().encode("questo non è un'immagine");
    try {
      const { risultato } = await disegna({ ...base, foto_urls: ["foto:0"] });
      expect(risultato.warnings).toHaveLength(1);
      expect(risultato.pageCount).toBeGreaterThan(0);
    } finally { FOTO = originale; }
  });

  it("un documento normale non ha avvertenze", async () => {
    const { risultato } = await disegna(giornataPiena());
    expect(risultato.warnings).toEqual([]);
  });

  it("emoji e simboli fuori dal set del font diventano «?» e non fanno cadere il documento", async () => {
    const { scritti, risultato } = await disegna({ ...base, descrizione_lavori: "✓ fatto 🙂 – ok «prova»", note: "Sigillatura ≥ 2 mm" });
    expect(risultato.pageCount).toBeGreaterThan(0);
    expect(scritti.every(s => !/[^\x20-\x7E\xA0-\xFF\n‘’“”…€]/.test(s.testo))).toBe(true);
    expect(scritti.some(s => s.testo.includes("? fatto ? - ok"))).toBe(true); // un solo «?» per ogni emoji
  });

  it("non stampa mai paghe, coordinate o costi, nemmeno se stanno nel record", async () => {
    const { scritti } = await disegna({ ...giornataPiena(), costo_manodopera: 31337.5, gps_lat: 45.4642035, gps_lng: 9.189982, presenze_registrate: [{ costo_orario: 27.91 }] });
    expect(scritti.some(s => /31[.,]?337|45[.,]4642|9[.,]18998|27[.,]91/.test(s.testo))).toBe(false);
  });

  it("il PDF si legge: è valido e ha una pagina in più solo quando serve", async () => {
    const { risultato } = await disegna(giornataPiena());
    const letto = await PDFDocument.load(risultato.bytes);
    expect(letto.getPageCount()).toBe(risultato.pageCount);
    expect(String.fromCharCode(...risultato.bytes.slice(0, 4))).toBe("%PDF");
    expect(letto.getTitle()).toBe(`Rapportino giornaliero - 5 ottobre 2026 - ${SIGLA}`);
  });

  it("ogni pagina ha la numerazione «n / totale» e il riferimento", async () => {
    const lungo = { ...giornataPiena(), descrizione_lavori: Array.from({ length: 70 }, (_, i) => `Punto ${i + 1}: lavorazione eseguita con il controllo delle quote.`).join("\n") };
    const { scritti, risultato } = await disegna(lungo);
    expect(risultato.pageCount).toBeGreaterThan(1);
    const numeri = scritti.filter(s => /^\d+ \/ \d+$/.test(s.testo)).map(s => s.testo);
    expect(numeri).toEqual(Array.from({ length: risultato.pageCount }, (_, i) => `${i + 1} / ${risultato.pageCount}`));
    expect(scritti.filter(s => s.testo.startsWith(`Rif. ${SIGLA} | Edizione R1`))).toHaveLength(risultato.pageCount);
  });
});

describe("rapportino a blocchi: il salto pagina", () => {
  /** Una fase con molti materiali dal nome lungo: la tabella deve attraversare più pagine. */
  const lungo = () => ({
    ...base,
    fasi_lavorate: [{ phase_id: "ph-1", percentuale: 50, nome: "Demolizioni e allestimento" }],
    materiali_usati: Array.from({ length: 60 }, (_, i) => ({ nome: `Materiale numero ${i + 1} con una descrizione volutamente lunga per andare a capo nella tabella dei materiali`, quantita: i + 1, unita: "pz", fase_id: "ph-1" })),
  });

  it("ogni pagina dopo la prima riprende l'intestazione corrente", async () => {
    const { corpo, risultato } = await disegna(lungo());
    expect(risultato.pageCount).toBeGreaterThan(1);
    for (let p = 1; p < risultato.pageCount; p++) {
      const sullaPagina = corpo.filter(s => s.pagina === p).map(s => s.testo);
      expect(sullaPagina, `pagina ${p + 1}`).toContain("Rapportino giornaliero  |  ORD-2026-041  |  5 ottobre 2026");
      expect(sullaPagina, `pagina ${p + 1}`).toContain(`Rif. ${SIGLA}`);
    }
  });

  it("la tabella dei materiali ripete le sue colonne a ogni pagina in cui continua", async () => {
    const { corpo, risultato } = await disegna(lungo());
    const pagineConIntestazione = new Set(corpo.filter(s => s.testo === "MATERIALE").map(s => s.pagina));
    expect(pagineConIntestazione.size).toBeGreaterThan(1);
    // nessuna pagina con righe della tabella e senza intestazione
    const pagineConRighe = new Set(corpo.filter(s => s.testo.startsWith("Materiale numero")).map(s => s.pagina));
    for (const p of pagineConRighe) expect(pagineConIntestazione.has(p), `pagina ${p + 1}`).toBe(true);
    expect(risultato.pageCount).toBeGreaterThanOrEqual(pagineConRighe.size);
  });

  it("nessuna riga di materiale va persa: sono tutte nel documento", async () => {
    const { testi } = await disegna(lungo());
    for (const n of [1, 17, 33, 60]) expect(testi.some(t => t.startsWith(`Materiale numero ${n} `)), `n. ${n}`).toBe(true);
  });

  it("il titolo di una sezione non resta solo in fondo a una pagina", async () => {
    const { corpo, risultato } = await disegna({ ...lungo(), descrizione_lavori: Array.from({ length: 22 }, (_, i) => `Punto ${i + 1}: lavorazione eseguita.`).join("\n") });
    expect(risultato.pageCount).toBeGreaterThan(1);
    for (let p = 0; p < risultato.pageCount; p++) {
      const sulla = corpo.filter(s => s.pagina === p);
      const ultimo = sulla[sulla.length - 1]?.testo;
      // l'ultima scritta di una pagina non è mai il titolo di una sezione (in maiuscolo, senza corpo sotto)
      expect(["LAVORAZIONI", "ALTRI MATERIALI", "SQUADRA", "NOTE E SEGNALAZIONI", "FIRME", "COSA È STATO FATTO"], `pagina ${p + 1}`).not.toContain(ultimo);
    }
  });
});
