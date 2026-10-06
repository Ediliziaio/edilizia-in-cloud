/// <reference types="node" />
/**
 * Il prodotto del listino nel preventivo: a destra nell'anteprima e nel PDF del cliente
 * (06/10/2026). Con foto e descrizione la riga le mostra; senza, resta quella di sempre,
 * parola per parola. Renderer vero e offline per il PDF.
 */
import { renderToBuffer } from "@react-pdf/renderer/lib/react-pdf.js";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as calcoliBagni from "@/lib/bagni/calcoli";
import { anteprimaComputo, type VoceComputoAnteprima } from "@/lib/preventivatore/anteprimaComputo";
import { AnteprimaVeloce } from "@/components/preventivatore/AnteprimaVeloce";
import { costruisciDatiEdile, type AziendaComune, type ProgettoComune, type VoceComune } from "@/components/preventivi/pdf/adattatoreEdile";
import { DocumentoEdilePDF } from "@/components/preventivi/pdf/DocumentoEdilePDF";
import { MODULI_EDILI } from "@/components/preventivi/pdf/moduliEdili";
import { inlineImmaginiVoci, LATO_MINIATURA_PDF } from "@/lib/moduli/immaginiVociComputo";

const { conversioni } = vi.hoisted(() => ({ conversioni: [] as Array<{ url: string; latoMax?: number }> }));
vi.mock("@/lib/serramenti/pdfImageUtils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/serramenti/pdfImageUtils")>()),
  // Nel test non c'è il browser: la «conversione» registra cosa le si chiede e dà un'immagine incorporata, o niente.
  toDataUrl: async (url: string | null | undefined, opzioni?: { latoMax?: number }) => {
    if (!url) return null;
    conversioni.push({ url, latoMax: opzioni?.latoMax });
    return url.includes("rotta") ? null : `data:image/jpeg;base64,${"/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAwADADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD1miivBa6KdPnvqYznynvVFeC0Vr9W8yPa+R71RXgte9VlUp8ltS4T5grwWveq8FrXDdSKvQKKKK6zEK96rwWveq5MT0NqXUK8Fr3qisqdTkvoXOHMeC0V71RWv1nyI9l5ngte9UUVlUqc9tC4Q5T/2Q=="}`;
  },
}));

const FOTO = "/templates/bagno/products/piatto-doccia.webp";
const DESCRIZIONE = "Piatto doccia in resina minerale con finitura ardesia antiscivolo, bordo ribassato a filo pavimento, piletta inclusa e sifone ispezionabile. ".repeat(3);

beforeEach(() => { conversioni.length = 0; });
afterEach(() => cleanup());

const voce = (id: string, extra: Partial<VoceComputoAnteprima> = {}): VoceComputoAnteprima => ({
  id, capitolo_nome: "Sanitari", descrizione: `Voce ${id}`, unita_misura: "cad", quantita: 1, prezzo_unitario: 100, sconto_pct: 0,
  costo_materiali: 60, costo_manodopera: 0, ...extra,
});
const opzioni = { emittente: "Bianchi Bagni", ivaDefault: 10, oggi: new Date(2026, 9, 6) };
const anteprima = (voci: VoceComputoAnteprima[]) => anteprimaComputo(voci, { code: "BGN-1" }, calcoliBagni, opzioni);

describe("l'anteprima a destra", () => {
  it("la riga di un prodotto del listino porta la foto e la descrizione (accorciata); le altre no", () => {
    const a = anteprima([
      voce("p", { descrizione: "Piatto doccia", immagine_url: FOTO, descrizione_estesa: DESCRIZIONE }),
      voce("l", { descrizione: "Posa e collaudo" }),
    ]);
    const [prodotto, libera] = a.gruppi[0].righe;
    expect(prodotto.immagineUrl).toBe(FOTO);
    expect(prodotto.descrizione!.length).toBeLessThanOrEqual(200);
    expect(prodotto.descrizione!.endsWith("…")).toBe(true);
    expect(libera.immagineUrl).toBeNull();
    expect(libera.descrizione).toBeNull();
  });

  it("foto e descrizione vuote o di soli spazi valgono «niente»", () => {
    const a = anteprima([voce("p", { immagine_url: "  ", descrizione_estesa: " \n " })]);
    expect(a.gruppi[0].righe[0]).toMatchObject({ immagineUrl: null, descrizione: null });
  });

  it("il pannello mostra la miniatura e la descrizione del prodotto, e niente alle altre righe", () => {
    const a = anteprima([
      voce("p", { descrizione: "Piatto doccia", immagine_url: FOTO, descrizione_estesa: "Antiscivolo, finitura pietra." }),
      voce("l", { descrizione: "Posa e collaudo" }),
    ]);
    const { container } = render(<AnteprimaVeloce dati={a} />);
    const immagini = Array.from(container.querySelectorAll("img"));
    expect(immagini.map((i) => i.getAttribute("src"))).toEqual([FOTO]);
    const rigaProdotto = screen.getByText("Piatto doccia").closest("tr") as HTMLElement;
    expect(within(rigaProdotto).getByText("Antiscivolo, finitura pietra.")).toBeInTheDocument();
    const rigaLibera = screen.getByText("Posa e collaudo").closest("tr") as HTMLElement;
    expect(rigaLibera.querySelector("img")).toBeNull();
  });

  it("una foto che non si carica esce di scena: niente riquadro rotto", async () => {
    const a = anteprima([voce("p", { immagine_url: FOTO })]);
    const { container } = render(<AnteprimaVeloce dati={a} />);
    const img = container.querySelector("img") as HTMLImageElement;
    img.dispatchEvent(new Event("error"));
    await waitFor(() => expect(container.querySelector("img")).toBeNull());
  });
});

describe("le foto dentro il PDF", () => {
  it("ogni foto diventa un'immagine incorporata in miniatura, una volta sola anche se la riga si ripete", async () => {
    const voci = [
      { id: "1", immagine_url: FOTO },
      { id: "2", immagine_url: FOTO },
      { id: "3", immagine_url: null as string | null },
      { id: "4" },
    ];
    const fuori = await inlineImmaginiVoci(voci);
    expect(conversioni).toEqual([{ url: FOTO, latoMax: LATO_MINIATURA_PDF }]);
    expect(LATO_MINIATURA_PDF).toBeLessThanOrEqual(400);
    expect(fuori[0].immagine_url).toMatch(/^data:image\/jpeg;base64,/);
    expect(fuori[1].immagine_url).toBe(fuori[0].immagine_url);
    expect(fuori[2].immagine_url).toBeNull();
    expect(fuori[3]).toEqual({ id: "4" });
  });

  it("una foto che non si carica nel PDF non c'è: mai un link da scaricare né un'attesa infinita", async () => {
    const fuori = await inlineImmaginiVoci([{ id: "1", immagine_url: "/templates/rotta.webp" }]);
    expect(fuori[0].immagine_url).toBeNull();
  });

  it("senza foto non si tocca niente: lo stesso elenco", async () => {
    const voci = [{ id: "1", immagine_url: null as string | null }, { id: "2" }];
    expect(await inlineImmaginiVoci(voci)).toBe(voci);
    expect(conversioni).toHaveLength(0);
  });
});

const PROGETTO: ProgettoComune = {
  code: "BGN-2026-014", tipo_intervento: "Rifacimento completo", cliente_nome: "Mario", cliente_cognome: "Rossi",
  cantiere_indirizzo: "Via Roma 1", cantiere_citta: "Milano", cantiere_provincia: "MI", cantiere_cap: "20100",
  immobile_tipo: "Appartamento", immobile_superficie_mq: 90, immobile_anno: 1975, immobile_piani: 1,
};
const TOTALI = {
  imponibileLordo: 1000, scontoEur: 0, scontoPct: 0, imponibile: 1000, iva: 100, ivaPct: 10, totale: 1100,
  detrazionePct: 0, detrazioneEur: 0, costoTot: 600, margineEur: 400, marginePct: 40,
};
const FOTO_INCORPORATA = `data:image/jpeg;base64,${"/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAwADADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD1miivBa6KdPnvqYznynvVFeC0Vr9W8yPa+R71RXgte9VlUp8ltS4T5grwWveq8FrXDdSKvQKKKK6zEK96rwWveq5MT0NqXUK8Fr3qisqdTkvoXOHMeC0V71RWv1nyI9l5ngte9UUVlUqc9tC4Q5T/2Q=="}`;
const dati = (voci: VoceComune[]) =>
  costruisciDatiEdile({
    modulo: MODULI_EDILI.bagni, progetto: PROGETTO, template: {}, azienda: null as AziendaComune | null, totali: TOTALI, media: [],
    capitoli: [{ nome: "Sanitari", subtotale: 1000, voci }],
  });
const base = (id: string, descrizione: string): VoceComune => ({ id, descrizione, unita_misura: "cad", quantita: 1, prezzo_unitario: 500, importo: 500, costo_materiali: 300, costo_manodopera: 0 });

describe("l'adattatore del PDF", () => {
  it("la riga del prodotto porta foto (già incorporata) e descrizione accorciata; le altre null", () => {
    const d = dati([
      { ...base("p", "Piatto doccia"), immagine_url: FOTO_INCORPORATA, descrizione_estesa: DESCRIZIONE },
      base("l", "Posa e collaudo"),
    ]);
    const [p, l] = d.capitoli[0].voci;
    expect(p.foto).toBe(FOTO_INCORPORATA); // i data URL non si toccano
    expect(p.dettaglio!.length).toBeLessThanOrEqual(220);
    expect(p.dettaglio!.endsWith("…")).toBe(true);
    expect(l.foto).toBeNull();
    expect(l.dettaglio).toBeNull();
  });

  it("la descrizione passa dal filtro dei caratteri stampabili: un'emoji incollata dal listino non esce a caso", () => {
    const d = dati([{ ...base("p", "Piatto doccia"), descrizione_estesa: "Antiscivolo ✓ finitura pietra 🏠" }]);
    expect(d.capitoli[0].voci[0].dettaglio).toBe("Antiscivolo finitura pietra");
  });
});

async function leggiPdf(elemento: Parameters<typeof renderToBuffer>[0]) {
  const bytes = await renderToBuffer(elemento);
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  let testo = "";
  let immagini = 0;
  for (let i = 1; i <= doc.numPages; i++) {
    const pagina = await doc.getPage(i);
    testo += (await pagina.getTextContent()).items.map((x) => ("str" in x ? x.str : "")).join(" ") + "\n";
    const operatori = await pagina.getOperatorList();
    immagini += operatori.fnArray.filter((f) => f === OPS.paintImageXObject || f === OPS.paintInlineImageXObject).length;
  }
  return { testo: testo.replace(/\s+/g, " "), immagini, pagine: doc.numPages };
}

describe("il PDF vero", () => {
  const conProdotto = () => dati([
    { ...base("p", "Piatto doccia in resina 120x80"), immagine_url: FOTO_INCORPORATA, descrizione_estesa: "Antiscivolo, finitura pietra." },
    base("l", "Posa e collaudo del piatto"),
  ]);
  const senzaProdotto = () => dati([base("p", "Piatto doccia in resina 120x80"), base("l", "Posa e collaudo del piatto")]);

  it("la riga del prodotto stampa la miniatura e la descrizione; la riga libera no", async () => {
    const r = await leggiPdf(<DocumentoEdilePDF dati={conProdotto()} />);
    expect(r.testo).toContain("Piatto doccia in resina 120x80");
    expect(r.testo).toContain("Antiscivolo, finitura pietra.");
    expect(r.testo).toContain("Posa e collaudo del piatto");
    expect(r.immagini).toBeGreaterThanOrEqual(1);
  }, 120000);

  it("senza foto né descrizione il documento è quello di sempre: stesso testo, stessi fogli, nessuna immagine di riga", async () => {
    const standard = await leggiPdf(<DocumentoEdilePDF dati={senzaProdotto()} />);
    // Le stesse righe con i campi nuovi presenti ma vuoti (come arrivano da una riga libera salvata): identico.
    const vuoti = dati([
      { ...base("p", "Piatto doccia in resina 120x80"), immagine_url: null, descrizione_estesa: null },
      { ...base("l", "Posa e collaudo del piatto"), immagine_url: "  ", descrizione_estesa: "" },
    ]);
    const conCampiVuoti = await leggiPdf(<DocumentoEdilePDF dati={vuoti} />);
    expect(conCampiVuoti.testo).toBe(standard.testo);
    expect(conCampiVuoti.pagine).toBe(standard.pagine);
    expect(conCampiVuoti.immagini).toBe(standard.immagini);
    expect(standard.testo).not.toContain("Antiscivolo");
  }, 120000);

  it("con molte righe-prodotto il documento si impagina lo stesso, e ci sono tutte", async () => {
    const molte = Array.from({ length: 24 }, (_, i): VoceComune => ({
      ...base(`p${i}`, `Prodotto numero ${i + 1}`), immagine_url: FOTO_INCORPORATA, descrizione_estesa: DESCRIZIONE,
    }));
    const r = await leggiPdf(<DocumentoEdilePDF dati={dati(molte)} />);
    for (const i of [1, 12, 24]) expect(r.testo).toContain(`Prodotto numero ${i}`);
    expect(r.immagini).toBeGreaterThanOrEqual(24);
  }, 180000);
});
