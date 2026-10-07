/**
 * Le rifiniture ai PDF dei preventivi chieste il 07/10/2026 dopo le annotazioni di Renova (valgono per tutti i tipi):
 *  - un titolo di sezione non resta mai solo in fondo alla pagina col suo contenuto su quella dopo
 *    (nei serramenti: «Perché …», «Le tue esigenze», «La soluzione per te», «Accessori e complementi»);
 *  - l'Art. 4 delle condizioni dice il piano di pagamento vero (le tappe della pagina economica), o niente di circolare;
 *  - la testata dei serramenti dice «PREVENTIVO N.», non «STIMA N.»;
 *  - la foto del sistema scelto dice che è di catalogo;
 *  - la pagina pubblica del preventivo non mostra l'email con cui il consulente entra nel gestionale;
 *  - l'HTML dei serramenti, stampato, non lascia un titolo solo in fondo al foglio.
 * Renderer vero, offline: si legge il testo del PDF come lo legge il cliente.
 */
import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createFullSerramentiTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
import { buildMockPdfData } from "@/lib/serramenti/mockPdfData";
import { SR_PDF_PAGES_META } from "@/types/serramenti";
import { SerramentoPDF } from "@/components/serramenti/SerramentoPDF";

vi.setConfig({ testTimeout: 300_000 });
vi.mock("@/lib/storage/immaginiModelloPdf", () => ({ CAMPI_IMMAGINE_SERRAMENTI: [], firmaImmagine: async (v: unknown) => v, firmaImmaginiModello: async (v: unknown) => v }));
vi.mock("@/lib/pdf/votiOnline", () => ({ votiOnlineAzienda: async (): Promise<null> => null }));
vi.mock("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: async (url: string | null): Promise<string | null> => {
  if (!url || url.startsWith("data:")) return url;
  if (url.startsWith(window.location.origin + "/")) url = new URL(url).pathname;
  if (!url.startsWith("/")) throw new Error(`Remote image forbidden: ${url}`);
  const bytes = await readFile(path.resolve("public", url.slice(1)));
  return `data:image/${url.endsWith(".png") ? "png" : "jpeg"};base64,${bytes.toString("base64")}`;
} }));

const AZIENDA = "Impresa esempio";

type DatiMock = Awaited<ReturnType<typeof buildMockPdfData>>;
/** Una riga di una pagina: la quota (y, dal basso) e il testo. */
interface Riga { y: number; testo: string }
interface PaginaLetta { numero: number; righe: Riga[]; testo: string }

/** Le pagine del PDF, con le righe del corpo (fra la testata e il piè di pagina) dall'alto in basso. */
async function leggi(dati: DatiMock): Promise<PaginaLetta[]> {
  const bytes = await renderToBuffer(SerramentoPDF(dati) as Parameters<typeof renderToBuffer>[0]);
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const pagine: PaginaLetta[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const oggetti = (await (await pdf.getPage(i)).getTextContent()).items.filter((x) => "str" in x) as Array<{ str: string; transform: number[] }>;
    const perQuota = new Map<number, string[]>();
    for (const o of oggetti) {
      const y = Math.round(o.transform[5]);
      // Il corpo sta fra la testata (sopra i 731 punti) e il piè di pagina (sotto i 95).
      if (y >= 731 || y <= 95 || !o.str.trim()) continue;
      perQuota.set(y, [...(perQuota.get(y) ?? []), o.str]);
    }
    const righe = [...perQuota.entries()].sort((a, b) => b[0] - a[0]).map(([y, t]) => ({ y, testo: t.join(" ").replace(/\s+/g, " ").trim() }));
    pagine.push({ numero: i, righe, testo: oggetti.map((o) => o.str).join(" ").replace(/\s+/g, " ") });
  }
  return pagine;
}

interface Scenario {
  /** Quante metriche nel riquadro «Perché …» (0 = nessuna). */
  metriche?: number;
  /** Lunghezza del testo di sintesi: sposta in basso quello che segue. */
  sintesi?: number;
  /** Senza esigenze e soluzione il «Perché …» arriva più su. */
  senzaVoci?: boolean;
  /** Nota sul primo serramento: sposta in basso la tabella degli accessori. */
  note?: number;
  accessori?: number;
  progetto?: Record<string, unknown>;
}

const TESTO_SINTESI = "Sostituzione dei serramenti esistenti con nuovi infissi ad alte prestazioni. ".repeat(40);
const voce = (prefisso: string, n: number) => ({
  titolo: `${prefisso} ${n} del preventivo`,
  descrizione: "Una descrizione abbastanza lunga da occupare due righe intere di testo nella pagina, così la voce ha un'altezza vera e non una riga sola.",
});

async function datiDi(s: Scenario): Promise<DatiMock> {
  const base = createFullSerramentiTemplate({ company_id: "qa", ragione_sociale: AZIENDA }, "finestre");
  const template = {
    ...base,
    pdf_pages_order: SR_PDF_PAGES_META.map((p) => ({ id: p.id, visible: true })),
    condizioni_legali_attivo: true,
    condizioni_legali_testo: null as string | null,
    pdf_perche_noi_metriche: Array.from({ length: s.metriche ?? 0 }, (_, i) => ({ value: String(10 + i), label: `Metrica ${i + 1}`, suffix: "+" })),
  };
  const dati = await buildMockPdfData({ template, companyName: AZIENDA, companyLogoUrl: null });
  Object.assign(dati.detail.progetto, {
    intervento_sintesi: TESTO_SINTESI.slice(0, s.sintesi ?? 0),
    esigenze: s.senzaVoci ? [] : [1, 2, 3].map((n) => voce("Esigenza", n)),
    soluzione: s.senzaVoci ? [] : [1, 2, 3, 4].map((n) => voce("Soluzione", n)),
    perche_noi: [1, 2, 3, 4, 5].map((n) => voce("Motivo", n)),
    ...(s.progetto ?? {}),
  });
  if (s.note) {
    // Le tre righe del preventivo di prova, con un id proprio e una nota sulla prima (come i serramenti di un preventivo vero).
    const originali = dati.detail.serramenti;
    dati.detail.serramenti = Array.from({ length: 3 }, (_, k) => ({
      ...originali[k % originali.length], id: `r${k}`, position: k,
      note: k === 0 ? "Nota del consulente sul primo serramento della composizione. ".repeat(s.note ?? 0) : null,
    }));
  }
  if (s.accessori) {
    const finestra = dati.detail.serramenti[0];
    const base2 = { progetto_id: dati.detail.progetto.id, company_id: "demo-company", position: 0, quantita: 1, prezzo_unitario: 252, prezzo_totale: 252, listino_voce_id: null as string | null, note: null as string | null };
    dati.detail.accessori = Array.from({ length: s.accessori }, (_, k) => ({
      ...base2, id: `a${k}`, tipo: "zanzariera", descrizione: `Zanzariera a molla numero ${k + 1}`, larghezza_mm: 1200, altezza_mm: 1400,
      serramento_id: finestra.id, family_id: null as string | null, valori_assi: {}, scelte_assi: null as string | null,
    })) as unknown as typeof dati.detail.accessori;
  }
  return dati;
}

/** Il testo senza spazi e in minuscolo: gli occhielli sono spaziati lettera per lettera. */
const piatto = (t: string) => t.replace(/\s+/g, "").toLowerCase();

/** I titoli che non devono mai chiudere una pagina da soli (la tabella degli accessori col suo capo colonne). */
const TITOLI = [
  "ANAGRAFICA CLIENTE", "L'INTERVENTO IN SINTESI", "LE TUE ESIGENZE", "LA SOLUZIONE PER TE", "PERCHÉ IMPRESA ESEMPIO",
  "LA TUA CONSULENZA", "ACCESSORI E COMPLEMENTI", "VOCE MISURE Q.TÀ",
];

/** I titoli che sono l'ultima riga di una pagina. */
function titoliSoli(pagine: PaginaLetta[]): string[] {
  return pagine.flatMap((p) => {
    const ultima = p.righe[p.righe.length - 1];
    return ultima && TITOLI.includes(ultima.testo) ? [`pagina ${p.numero}: «${ultima.testo}»`] : [];
  });
}

describe("serramenti: un titolo non resta solo in fondo alla pagina", () => {
  // Ogni scenario è un punto in cui, prima della correzione, il titolo cadeva in fondo al foglio col contenuto sul foglio dopo
  // (trovati spostando il testo di sintesi di trenta caratteri alla volta).
  const SCENARI: Array<[string, Scenario]> = [
    ["«La soluzione per te» (sintesi di 1000 caratteri)", { sintesi: 1000 }],
    ["«Le tue esigenze» (sintesi di 2000 caratteri)", { sintesi: 2000 }],
    ["«Perché …» con le metriche (Renova, pagina 3)", { senzaVoci: true, metriche: 3, sintesi: 1850 }],
    ["«Perché …» senza metriche", { senzaVoci: true, metriche: 0, sintesi: 2000 }],
    ["«Accessori e complementi» col capo colonne (nota breve)", { metriche: 0, sintesi: 400, note: 1, accessori: 3 }],
    ["«Accessori e complementi» da solo (nota lunga)", { metriche: 0, sintesi: 400, note: 9, accessori: 3 }],
  ];

  it.each(SCENARI)("%s", async (_nome, scenario) => {
    const pagine = await leggi(await datiDi(scenario));
    expect(titoliSoli(pagine), "titoli rimasti soli in fondo alla pagina").toEqual([]);
    // E il contenuto c'è: lo scenario non è stato aggirato togliendo la sezione.
    const tutto = pagine.map((p) => p.testo).join(" ");
    if (scenario.accessori) expect(tutto).toContain("Zanzariera a molla numero 1");
    else expect(tutto).toContain("Motivo 1 del preventivo");
  });

  it("il titolo «Perché …» sta nella pagina della sua prima riga di metriche, e senza metriche della sua prima voce", async () => {
    const conMetriche = await leggi(await datiDi({ senzaVoci: true, metriche: 3, sintesi: 1850 }));
    const paginaMetriche = conMetriche.find((p) => /PERCH[ÉE] IMPRESA ESEMPIO/.test(p.testo));
    expect(paginaMetriche?.testo).toContain("METRICA 1");
    const senza = await leggi(await datiDi({ senzaVoci: true, metriche: 0, sintesi: 2000 }));
    const paginaVoci = senza.find((p) => /PERCH[ÉE] IMPRESA ESEMPIO/.test(p.testo));
    expect(paginaVoci?.testo).toContain("Motivo 1 del preventivo");
  });
});

describe("serramenti: l'Art. 4 delle condizioni dice il piano di pagamento", () => {
  const art4 = (pagine: PaginaLetta[]): string => {
    const tutto = pagine.map((p) => p.testo).join(" ");
    const da = tutto.indexOf("Il pagamento avviene");
    return da < 0 ? "" : tutto.slice(da, da + 400);
  };

  it("con le tappe della pagina economica le ripete (acconto e finanziamento, con gli importi)", async () => {
    const pagine = await leggi(await datiDi({ metriche: 0, sintesi: 200 }));
    const frase = art4(pagine);
    expect(frase).toContain("Il pagamento avviene secondo il piano concordato:");
    expect(frase).toContain("Acconto alla firma 30%");
    expect(frase).toContain("Finanziamento 70%");
    expect(frase).toMatch(/Acconto alla firma 30% \(\d[\d.]*,\d\d €\)/);
    expect(frase).not.toContain("come da condizioni di pagamento concordate");
  });

  it("senza tappe non dice niente di circolare", async () => {
    const pagine = await leggi(await datiDi({ metriche: 0, sintesi: 200, progetto: { pagamento_milestones: [] } }));
    const frase = art4(pagine);
    expect(frase).toContain("Il pagamento avviene secondo le modalità concordate tra le parti.");
    expect(frase).not.toContain("come da condizioni di pagamento concordate");
    expect(frase).not.toMatch(/piano concordato:\s*(come|le modalità)/);
  });
});

describe("serramenti: testata e foto del sistema", () => {
  it("la testata dice «PREVENTIVO N.» e mai «STIMA N.»; il documento si chiama «Preventivo …»", async () => {
    const pagine = await leggi(await datiDi({ sintesi: 200 }));
    const tutto = pagine.map((p) => p.testo).join(" ");
    expect(tutto).toContain("PREVENTIVO N.");
    expect(tutto).not.toContain("STIMA N.");
    const dati = await datiDi({ sintesi: 200 });
    const documento = SerramentoPDF(dati) as unknown as { props: { title?: string } };
    expect(documento.props.title).toMatch(/^Preventivo SF-DEMO-0001/);
  });

  it("sotto la foto del sistema scelto c'è «Immagine di catalogo»; senza foto non c'è", async () => {
    const png = `data:image/png;base64,${(await readFile(path.resolve("public/icons/icon-192.png"))).toString("base64")}`;
    const linea = { id: "l1", nome: "Linea Prova", tipologia: "Serramenti", descrizione: null as string | null, dati: [] as Array<{ etichetta: string; valore: string }>, scheda_tecnica_url: null as string | null, scheda_tecnica_nome: null as string | null, prodotti: "Finestra 2 Ante" };
    const dati = await datiDi({ sintesi: 200 });
    const conFoto = await leggi({ ...dati, lineeDedicate: [{ ...linea, immagine_url: png }] });
    expect(conFoto.map((p) => p.testo).join(" ")).toContain("Immagine di catalogo: colori e finiture del tuo preventivo sono quelli indicati nella composizione.");
    const senzaFoto = await leggi({ ...dati, lineeDedicate: [{ ...linea, immagine_url: null }] });
    // La pagina c'è (l'occhiello è spaziato lettera per lettera), ma senza la foto non c'è nemmeno la didascalia.
    expect(piatto(senzaFoto.map((p) => p.testo).join(" "))).toContain("ilsistemascelto");
    expect(senzaFoto.map((p) => p.testo).join(" ")).not.toContain("Immagine di catalogo");
  });
});

describe("la pagina pubblica del preventivo e l'HTML dei serramenti", () => {
  const sorgente = (file: string) => readFileSync(path.resolve(file), "utf8");

  it("l'email del profilo del consulente (quella di accesso) non esce né dal server né dalla pagina", () => {
    const funzione = sorgente("supabase/functions/sr-public-progetto/index.ts");
    expect(funzione).toContain('.select("first_name, last_name, phone")');
    expect(funzione).not.toMatch(/email:\s*cons\./);
    const pagina = sorgente("src/pages/public/SerramentiStimaPubblica.tsx");
    expect(pagina).not.toContain("mailto:${consulente");
    expect(pagina).not.toContain("consulente.email");
    // Il telefono, e WhatsApp, restano: sono i recapiti del consulente.
    expect(pagina).toContain("consulente.telefono");
    // Le parole: lì si parla di preventivo, come nel PDF.
    expect(pagina).toContain("Preventivo n.");
    expect(pagina).not.toContain("Stima n.");
  });

  it("stampando, un titolo non resta solo in fondo al foglio", () => {
    const html = sorgente("supabase/functions/_shared/srHtmlTemplate.ts");
    expect(html).toMatch(/\.section-title, \.cond-sub \{ break-after: avoid; page-break-after: avoid; \}/);
    expect(html).toMatch(/\.bullet-item, \.check-list li, \.cond-list li \{ break-inside: avoid;/);
  });

  it("il pacchetto del PDF bagno (WhatsApp) ha la pagina da firmare col titolo di adesso", () => {
    const pacchetto = sorgente("supabase/functions/bgn-genera-pdf/_render.mjs");
    expect(pacchetto).toContain("ACCETTAZIONE PROPOSTA");
    expect(pacchetto).not.toContain("Firma del contratto");
  });
});
