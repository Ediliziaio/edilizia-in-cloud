import { esigiVerificaDocumento, verificheDelDocumento } from "../../../shared/planimetrie/verificaDocumento.ts";
import type { PDFImage, PDFPage } from "pdf-lib";
import { controlliDalDocumento } from "../../../shared/planimetrie/letturaDocumento.ts";
import { eAmbienteInterno, type Planimetria } from "../../../shared/planimetrie/modello.ts";
import { areaPoligono, puntoNelPoligono } from "../../../shared/planimetrie/geometria.ts";
import { modelloArredo } from "../../../shared/planimetrie/modelliArredo.ts";
import { nomeDelTipo, TIPI_ARREDO_3D } from "@/components/planimetrie/editor/catalogo";
import { coloriContraddittori } from "../../../shared/render-room/colours.ts";
import { COLORI_INFISSI_PROGETTO, PROFILI_PROGETTO, descrizionePavimento, statoConMateriali } from "../../../shared/planimetrie/materialiProgetto.ts";
import { svgPiantaStanza } from "../../../shared/render-planimetria/piantaStanza.ts";
import { verificaPianta } from "../../../shared/planimetrie/verifiche.ts";
import { DATI_URBANISTICI, firmaRiscontroTecnico, RISCONTRI_TECNICI, RUOLI_TAVOLA, valutaUrbanistica } from "../../../shared/planimetrie/urbanistica.ts";
import { selectedRoomVisuals } from "../../../shared/render-references/roomVisualCatalog.ts";
import { makeReferenceImage } from "../../../shared/render-references/referenceUrl.ts";
import { contenutoFascicolo, type RenderNelFascicolo } from "./fascicoloModello";
import { descriviScelteFascicolo, richiesteFascicolo } from "./fascicoloScelte";
import { caricaLogo, esportaPdf, vistaDaPlanimetria, type DatiCartiglio } from "./esporta";
import { pianteDaPlanimetria, pianiDaPlanimetria, costruisciScena, scenaEdificio, vistaGiroIntorno, vistaInternaArredata } from "./tred";
import { pianiProspetto, prospettoQuotato, sezione } from "./prospetti";
import { accodaTavole, accodaFoglioImpianti, impaginaDisegni } from "./tavole";
import type { RenderDellaPianta } from "./render/renderDallaPianta";
import type { RenderVisitaSalvato } from "./renderVisitaArchivio";

export interface DatiFascicolo {
  documento: Planimetria; titolo: string; versione: number; ambito: string;
  cartiglio: DatiCartiglio; renders: RenderDellaPianta[];
  renderDaIncludere?: RenderNelFascicolo;
  renderVisita?: RenderVisitaSalvato[];
  avvisiIniziali?: string[];
  progresso?: (fase: string) => void;
  leggiSorgente?: (render: RenderDellaPianta) => Promise<Uint8Array | null>;
  leggiCampioniPersonali?: (render: RenderDellaPianta) => Promise<Uint8Array[]>;
  leggiDocumentoOriginale?: () => Promise<Uint8Array | null>;
}

async function comprimiFoto(dati: Uint8Array): Promise<Uint8Array> {
  if (dati.byteLength < 85_000 || typeof createImageBitmap !== "function") return dati;
  try {
    const foto = await createImageBitmap(new Blob([new Uint8Array(dati).buffer]));
    const canvas = document.createElement("canvas");
    try {
      const fattore = Math.min(1, 1440 / Math.max(foto.width, foto.height));
      canvas.width = Math.round(foto.width * fattore); canvas.height = Math.round(foto.height * fattore);
      const ctx = canvas.getContext("2d");
      if (!ctx) return dati;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(foto, 0, 0, canvas.width, canvas.height);
      const jpeg = await new Promise<Blob | null>(ok => canvas.toBlob(ok, "image/jpeg", .88));
      return jpeg && jpeg.size < dati.length ? new Uint8Array(await jpeg.arrayBuffer()) : dati;
    } finally { foto.close(); canvas.width = canvas.height = 1; }
  } catch { return dati; }
}

/** Geometrie della revisione scelta, viste del modello e render già generati. */
export async function esportaFascicolo(d: DatiFascicolo): Promise<{ dati: Uint8Array; pagine: number; immaginiRender: number; avvisi: number }> {
  esigiVerificaDocumento(d.documento, "pdf");
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 841.89, H = 595.28, M = 40, utile = W - M * 2;
  const nero = rgb(.08, .13, .19), grigio = rgb(.35, .4, .46), blu = rgb(.09, .25, .44);
  const fondo = rgb(.944, .965, .985), rigaChiara = rgb(.84, .89, .94);
  const pulito = (s: string) => s.replace(/[\r\n\t]+/g, " ").replace(/[–—]/g, "-").replace(/[^ -ÿ€’‘“”]/g, "");
  const num = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
  let pagina: PDFPage, y = H - M;
  let titoloInCorso = "", sottoInCorso = "";
  const indice: Array<{ titolo: string; pagina: number }> = [];
  const immagini = new Map<string, PDFImage>();
  const avvisi = new Set(d.avvisiIniziali);
  let immaginiRender = 0;
  const fotoLette = new Map<string, ReturnType<typeof caricaLogo>>();
  const caricaFoto = (url: string, timeout: number) => {
    if (!fotoLette.has(url)) fotoLette.set(url, caricaLogo(url, timeout));
    return fotoLette.get(url)!;
  };
  const risorsa = async <T,>(nome: string, lavoro: () => Promise<T | null>): Promise<T | null> => {
    try {
      const risultato = await lavoro();
      if (risultato !== null) return risultato;
    } catch { /* Le tavole vettoriali restano disponibili e l'assenza è registrata nel riepilogo. */ }
    avvisi.add(nome);
    return null;
  };
  const testo = (s: string, size = 10, forte = false, max = utile, x = M) => {
    const f = forte ? bold : font;
    const righe: string[] = []; let riga = "";
    // Spezza anche un singolo nome molto lungo, senza uscire dal foglio.
    for (const parola of pulito(s).split(/\s+/)) {
      if (f.widthOfTextAtSize(`${riga} ${parola}`.trim(), size) <= max) { riga = `${riga} ${parola}`.trim(); continue; }
      if (riga) righe.push(riga); riga = "";
      for (const c of parola) { if (f.widthOfTextAtSize(riga + c, size) > max) { righe.push(riga); riga = ""; } riga += c; }
    }
    if (riga) righe.push(riga);
    for (const r of righe) {
      if (y < M + 25) nuovaPagina(`${titoloInCorso} (continua)`, sottoInCorso);
      pagina.drawText(r, { x, y, size, font: f, color: forte ? nero : grigio }); y -= size * 1.5;
    }
  };
  const ellissi = (s: string, max: number, size = 10) => {
    const t = pulito(s);
    if (font.widthOfTextAtSize(t, size) <= max) return t;
    let i = t.length;
    while (font.widthOfTextAtSize(`${t.slice(0, i)}...`, size) > max && i > 0) i--;
    return `${t.slice(0, i)}...`;
  };
  const nuovaPagina = (titolo: string, sotto = "", indicizza = false) => {
    pagina = doc.addPage([W, H]); y = H - M;
    titoloInCorso = titolo.replace(/ \(continua\)$/, ""); sottoInCorso = sotto;
    pagina.drawRectangle({ x: 0, y: H - 5, width: W, height: 5, color: blu });
    if (indicizza) indice.push({ titolo, pagina: doc.getPageCount() });
    testo(titolo, 20, true); if (sotto) testo(sotto, 10); y -= 14;
  };
  const immagine = async (dati: Uint8Array, x: number, top: number, w: number, h: number, fotografia = false) => {
    const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(dati).buffer);
    const chiave = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("") + (fotografia ? "/foto" : "");
    let img = immagini.get(chiave);
    if (!img) {
      const bytes = fotografia ? await comprimiFoto(dati) : dati;
      img = bytes[0] === 0x89 ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      immagini.set(chiave, img);
    }
    const k = Math.min(w / img.width, h / img.height);
    pagina.drawImage(img, { x: x + (w - img.width * k) / 2, y: top - img.height * k, width: img.width * k, height: img.height * k });
    return img.height * k;
  };
  const aggiungiPdf = async (bytes: Uint8Array) => {
    const p = await PDFDocument.load(bytes);
    for (const foglio of await doc.copyPages(p, p.getPageIndices())) doc.addPage(foglio);
  };
  const avanza = (fase: string) => d.progresso?.(fase);
  const piani = contenutoFascicolo(d.documento, d.versione, d.ambito, d.renders, d.renderDaIncludere);
  const comuni = piani[0]?.materiali ?? {};
  const vista3D = d.ambito === "fatto" ? "fatto" as const : "progetto" as const;
  const propostaId = d.ambito.startsWith("progetto:") ? d.ambito.slice(9) : undefined;
  const edificio = pianiDaPlanimetria(d.documento, propostaId);
  const { catturaVistaProgetto } = await import("@/components/planimetrie/tred/fotogramma");
  const stanze = piani.flatMap((p) => p.stanze);
  const mqInterni = piani.reduce((n, p) => n + p.stato.locali.filter(eAmbienteInterno).reduce((m, l) => m + areaPoligono(l.contorno) / 10_000, 0), 0);
  let riscontri3D: string[] = [];
  const anteprimaEdificio = async () => {
    if (!edificio.length) return null;
    const scena = scenaEdificio(edificio, { vista: vista3D, soffitto: true, elementi: true, terreno: 2.5 });
    riscontri3D = scena.avvisi;
    if (!scena.mesh.length) return null;
    const foto = await catturaVistaProgetto({ pianta: edificio[0].piante[vista3D], scena, telecamera: vistaGiroIntorno(scena.limiti, 1.5), vista: vista3D, larghezza: 1440, altezza: 960 });
    return new Uint8Array(await foto.arrayBuffer());
  };
  const nomeAmbito = d.ambito === "fatto" ? "Stato di fatto" : d.documento.livelli.flatMap((l) => l.proposte).find((p) => `progetto:${p.id}` === d.ambito)?.nome ?? "Progetto";
  doc.setTitle(`${d.titolo} - Fascicolo di progetto`); doc.setAuthor(d.cartiglio.azienda.nome); doc.setCreator("Edilizia in Cloud - Planimetrie");
  avanza("Copertina e vista del progetto");
  const modello = await risorsa("Vista d’insieme 3D", anteprimaEdificio);
  nuovaPagina("Fascicolo di progetto");
  y = H - 104;
  testo(d.titolo, 30, true);
  testo(`${nomeAmbito}  /  Versione ${d.versione}`, 12);
  y -= 22;
  const topCopertina = y;
  const xVista = M + 275, wVista = W - M - xVista, hVista = Math.min(282, topCopertina - M - 36);
  if (modello && hVista > 90) {
    pagina.drawRectangle({ x: xVista, y: topCopertina - hVista, width: wVista, height: hVista, color: fondo });
    await immagine(modello, xVista, topCopertina, wVista, hVista, true);
    pagina.drawText("Vista 3D del progetto", { x: xVista, y: topCopertina - hVista - 15, size: 9, font: bold, color: blu });
  }
  if (d.cartiglio.azienda.logo) {
    await immagine(d.cartiglio.azienda.logo.dati, M, y, 126, 35);
    y -= 46;
  }
  testo(d.cartiglio.azienda.nome, 15, true, 248);
  testo([d.cartiglio.azienda.indirizzo, d.cartiglio.azienda.telefono, d.cartiglio.azienda.email].filter(Boolean).join(" | "), 9, false, 248);
  if (d.cartiglio.cliente) testo(`Committente ${d.cartiglio.cliente}`, 10, false, 248);
  if (d.cartiglio.indirizzoCantiere) testo(`Immobile ${d.cartiglio.indirizzoCantiere}`, 10, false, 248);
  testo((d.cartiglio.data instanceof Date ? d.cartiglio.data : new Date(d.cartiglio.data ?? Date.now())).toLocaleDateString("it-IT"), 10, false, 248);
  y -= 26;
  testo(`${piani.length} ${piani.length === 1 ? "piano" : "piani"}  /  ${stanze.length} ambienti`, 14, true, 248);
  testo(`${num(mqInterni)} m² interni dal disegno`, 11, false, 248);
  if (d.documento.ambitoDocumento === "ambiente") testo("Elaborato riferito al singolo ambiente.", 9, false, 248);
  y -= 14;
  testo("Tavole in scala, viste 3D, finiture, abachi, impianti, sezioni e verifiche.", 10, false, 246);

  if (comuni.pavimento || comuni.infissi) {
    avanza("Materiali e campioni");
    nuovaPagina("Finiture e materiali comuni", nomeAmbito, true);
    if (comuni.pavimento) testo(`Pavimento comune - ${descrizionePavimento(comuni.pavimento)}`, 12, true);
    if (comuni.infissi) testo(`Infissi comuni - ${PROFILI_PROGETTO[comuni.infissi.profilo]} - ${COLORI_INFISSI_PROGETTO[comuni.infissi.colore].nome}`, 12, true);
    const campioni = selectedRoomVisuals({ pavimento: comuni.pavimento, infissi_progetto: comuni.infissi }).filter((s) => ["floor_type", "window_profile"].includes(s.group));
    for (const [i, s] of campioni.entries()) {
      const foto = makeReferenceImage(s.photo!.folder, s.photo!.filename, s.label);
      const img = await risorsa(`Campione ${s.label}`, () => caricaFoto(foto.url, 15_000));
      if (!img) continue;
      await immagine(img.dati, M + i * (utile / 2), y - 10, utile / 2 - 20, 260, true);
      pagina.drawText(ellissi(s.label, utile / 2 - 20, 11), { x: M + i * utile / 2, y: y - 290, size: 11, font: bold, color: nero });
    }
  }

  for (const piano of piani) {
    avanza(`Planimetria e 3D - ${piano.livello.nome}`);
    indice.push({ titolo: `Planimetria - ${piano.livello.nome}`, pagina: doc.getPageCount() + 1 });
    const docMateriali = { ...d.documento, livelli: d.documento.livelli.map((l) => l.id === piano.livello.id ? { ...l, fatto: statoConMateriali(l.fatto, comuni), proposte: l.proposte.map((pr) => ({ ...pr, ...statoConMateriali(pr, comuni) })) } : l) };
    const vista = vistaDaPlanimetria(docMateriali, { livelloId: piano.livello.id, modo: piano.geometria === "fatto" ? "fatto" : "progetto", propostaId });
    await aggiungiPdf((await esportaPdf(vista, { ...d.cartiglio, oggetto: `${piano.livello.nome} - ${nomeAmbito}` }, {
      formato: "A4", orientamento: "orizzontale", scala: "auto", stile: "presentazione", quoteAutomatiche: "ingombri",
    })).dati);
    const coppia = pianteDaPlanimetria(d.documento, { livelloId: piano.livello.id, propostaId, materialiAmbito: d.ambito });
    const pianta = d.ambito === "fatto" ? coppia.fatto : coppia.progetto;
    if (piano.stanze.length) {
      const scena = costruisciScena(pianta, { vista: vista3D, soffitto: false, elementi: true });
      const foto = await risorsa(`Vista 3D del piano ${piano.livello.nome}`, () =>
        catturaVistaProgetto({ pianta, scena, telecamera: vistaGiroIntorno(scena.limiti, 1.5), vista: vista3D, larghezza: 1440, altezza: 960 }));
      if (foto) {
        nuovaPagina(`${piano.livello.nome} - vista 3D aperta`, "Distribuzione degli ambienti e degli arredi", true);
        await immagine(new Uint8Array(await foto.arrayBuffer()), M, y, utile, y - M, true);
      }
    }
    nuovaPagina(`${piano.livello.nome} - abaco del piano`, `${piano.serramenti.length} aperture disegnate / quota ${num(piano.livello.quota / 100)} m`, true);
    testo("PORTE E FINESTRE", 12, true);
    for (const a of piano.serramenti) {
      testo(`${a.codice} - ${a.tipo} ${num(a.larghezza)} x ${num(a.altezza)} cm | ${a.stanze}`, 11, true);
      testo(`${a.sistema}; ${a.ante} ante; davanzale ${num(a.davanzale)} cm; ${a.stato}${a.stimata ? "; misure stimate" : ""}. Oscurante: ${a.oscurante}. Cassonetto: ${a.cassonetto}. Zanzariera: ${a.zanzariera}.`);
      y -= 7;
    }
    if (!piano.serramenti.length) testo("Nessuna apertura disegnata in questo piano.");
    const muri = piano.stato.muri;
    if (muri.length) {
      if (y < M + 78) nuovaPagina(`${piano.livello.nome} - abaco del piano (continua)`, nomeAmbito);
      y -= 9;
      testo("MURI", 12, true);
      for (const [i, m] of muri.entries()) {
        const colonna = i % 2, larghezza = utile / 2 - 10, x = M + colonna * (utile / 2 + 10);
        if (colonna === 0 && y < M + 32) nuovaPagina(`${piano.livello.nome} - abaco muri (continua)`, nomeAmbito);
        if (Math.floor(i / 2) % 2 === 0) pagina.drawRectangle({ x, y: y - 5, width: larghezza, height: 15, color: fondo });
        const lunghezza = Math.hypot(m.p2.x - m.p1.x, m.p2.y - m.p1.y) / 100;
        const dati = [`Parete ${i + 1}`, `L ${num(lunghezza)} m`, `sp. ${num(m.spessore)} cm`, `h ${num(m.altezza / 100)} m`,
          m.tipo, (m.stato ?? "esistente").replace(/_/g, " "), m.origine === "stimata" ? "stima" : ""].filter(Boolean).join(" / ");
        pagina.drawText(ellissi(dati, larghezza - 11, 8.5), { x: x + 5, y, size: 8.5, color: grigio, font });
        if (colonna || i === muri.length - 1) y -= 15.5;
      }
      y -= 10;
    }
    for (const a of piano.stato.aree ?? []) testo(`Area esterna: ${a.nome || a.tipo.replace(/_/g, " ")} - ${num(areaPoligono(a.contorno) / 10_000)} m².`);
    const esterni = piano.stato.elementi.filter((e) => !TIPI_ARREDO_3D.has(e.tipo) &&
      !piano.stato.locali.some(l => e.localeId === l.id || (!e.localeId && puntoNelPoligono(e.posizione, l.contorno))));
    for (const e of esterni) testo(`Elemento fuori dai locali: ${e.tipo.replace(/_/g, " ")} - ${num(e.larghezza)} x ${num(e.profondita)} cm${e.altezza ? `; h ${num(e.altezza)} cm` : ""}.`);
    const arredi = piano.stato.elementi.filter(e => e.stato !== "da_demolire" && TIPI_ARREDO_3D.has(e.tipo))
      .map(e => ({ e, ambiente: piano.stato.locali.find(l => l.id === e.localeId)?.nome ??
        piano.stato.locali.find(l => puntoNelPoligono(e.posizione, l.contorno))?.nome ?? "Fuori dai locali" }))
      .sort((a, b) => a.ambiente.localeCompare(b.ambiente, "it") || nomeDelTipo(a.e.tipo).localeCompare(nomeDelTipo(b.e.tipo), "it"));
    if (arredi.length) {
      avanza(`Abaco arredi - ${piano.livello.nome}`);
      const intestazione = (prima: boolean) => {
        nuovaPagina(`${piano.livello.nome} - arredi e sanitari${prima ? "" : " (continua)"}`, `${arredi.length} elementi nel modello / ${nomeAmbito}`, prima);
        pagina.drawRectangle({ x: M, y: y - 8, width: utile, height: 24, color: blu });
        for (const [x, nome] of [[12, "AMBIENTE"], [194, "ELEMENTO E MODELLO"], [493, "L x P x H (cm)"], [627, "STATO"], [714, "COLORE"]] as const) {
          pagina.drawText(nome, { x: M + x, y, size: 8, font: bold, color: rgb(1, 1, 1) });
        }
        y -= 26;
      };
      intestazione(true);
      for (const [i, { e, ambiente }] of arredi.entries()) {
        if (y < M + 38) intestazione(false);
        if (i % 2 === 0) pagina.drawRectangle({ x: M, y: y - 16, width: utile, height: 30, color: fondo });
        pagina.drawText(ellissi(ambiente, 174), { x: M + 12, y, size: 10, font, color: grigio });
        const base = e.etichetta?.trim() || nomeDelTipo(e.tipo);
        const modello = modelloArredo(e.tipo, e.modello)?.nome;
        pagina.drawText(ellissi(base, 278), { x: M + 194, y: modello ? y + 4 : y, size: 10, font: bold, color: nero });
        if (modello && modello !== base) pagina.drawText(ellissi(modello, 278, 8), { x: M + 194, y: y - 8, size: 8, font, color: grigio });
        pagina.drawText(`${num(e.larghezza)} x ${num(e.profondita)} x ${e.altezza === undefined ? "-" : num(e.altezza)}`, { x: M + 493, y, size: 9, font, color: nero });
        pagina.drawText(e.stato === "nuovo" ? "Nuovo" : "Esistente", { x: M + 627, y, size: 9, font, color: grigio });
        if (e.colore && /^#[0-9a-f]{6}$/i.test(e.colore)) {
          const n = Number.parseInt(e.colore.slice(1), 16);
          pagina.drawRectangle({ x: M + 721, y: y - 3, width: 12, height: 12, color: rgb((n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255),
            borderColor: rigaChiara, borderWidth: .6 });
        }
        y -= 30;
      }
    }
    for (const stanza of piano.stanze) {
      avanza(`Scheda ambiente - ${stanza.nome}`);
      nuovaPagina(stanza.nome, `${piano.livello.nome} / ${nomeAmbito}`, true);
      testo(`${num(stanza.pavimentoMq)} m² | h ${num(stanza.altezzaCm / 100)} m | volume ${num(stanza.volumeMc)} m³ | perimetro ${num(stanza.perimetroMl)} m`, 12, true);
      testo(`${stanza.vincoli.locale.rettangolare ? "Dimensioni interne" : "Ingombro massimo"}: ${num(stanza.vincoli.locale.larghezza_cm / 100)} x ${num(stanza.vincoli.locale.profondita_cm / 100)} m.`);
      testo(`Pareti nette ${num(stanza.paretiNetteMq)} m²; soffitto ${num(stanza.soffittoMq)} m²; battiscopa ${num(stanza.battiscopaMl)} m.${stanza.stimata ? " Misure stimate: da verificare." : ""}`);
      if (stanza.finiture !== "—") testo(stanza.finiture);
      if (comuni.pavimento) testo(`Pavimento comune applicato: ${descrizionePavimento(comuni.pavimento)}.`);
      const locale = piano.stato.locali.find(l => l.id === stanza.id);
      const elementi = piano.stato.elementi.filter(e => e.stato !== "da_demolire" &&
        (e.localeId === stanza.id || (!e.localeId && locale && puntoNelPoligono(e.posizione, locale.contorno))));
      if (elementi.length) testo(`Elementi nel disegno: ${elementi.map(e => e.etichetta?.trim() || modelloArredo(e.tipo, e.modello)?.nome || nomeDelTipo(e.tipo)).join(", ")}.`);
      if (stanza.renders.length) testo(`Render AI in archivio: ${stanza.renders.length}.`);
      y -= 6;
      const { pngDaSvg } = await import("./render/renderDallaPianta");
      const schema = await pngDaSvg(svgPiantaStanza(stanza.vincoli), 1024);
      const foto = await risorsa(`Vista 3D di ${stanza.nome} (${piano.livello.nome})`, () =>
        catturaVistaProgetto({ pianta, telecamera: vistaInternaArredata(pianta, stanza.id, { vista: vista3D }), vista: vista3D, larghezza: 1200, altezza: 800 }));
      if (y < M + 170) nuovaPagina(`${stanza.nome} - pianta e 3D`, piano.livello.nome);
      const spazio = Math.max(140, y - M - 10);
      await immagine(new Uint8Array(await schema.arrayBuffer()), M, y, foto ? utile * .43 : utile, spazio);
      if (foto) await immagine(new Uint8Array(await foto.arrayBuffer()), M + utile * .45, y, utile * .55, spazio, true);
      for (const [nRender, render] of stanza.renders.entries()) {
        if (render.scelte) {
          nuovaPagina(`${stanza.nome} - scelte del render ${nRender + 1}`, `${piano.livello.nome} / ${new Date(render.created_at).toLocaleDateString("it-IT")}`);
          const cfg = render.scelte;
          testo(`Qualità del render: ${cfg.qualita_render === "alta" ? "Alta" : "Standard"}.`, 10, true);
          if (coloriContraddittori(cfg).length) testo("Configurazione storica da verificare: il nome colore contiene un codice diverso dal selettore. I valori originali sono riportati sotto; questa incongruenza viene ora fermata prima di generare un nuovo render.", 10, true);
          const leggi = (k: string) => cfg[k] && typeof cfg[k] === "object" ? cfg[k] as Record<string, unknown> : {};
          const pavimento = leggi("pavimento"), infissi = leggi("infissi_progetto");
          const eccezione = leggi("eccezioni_materiali_progetto").pavimento === true;
          if (pavimento.attivo) testo(`${eccezione ? "Eccezione al pavimento comune per questo render" : "Pavimento"}: ${descrizionePavimento(pavimento as never)}.`, 11, true);
          if (infissi.profilo && infissi.colore) testo(`Infissi: ${PROFILI_PROGETTO[infissi.profilo as keyof typeof PROFILI_PROGETTO] ?? ""} - ${COLORI_INFISSI_PROGETTO[infissi.colore as keyof typeof COLORI_INFISSI_PROGETTO]?.nome ?? ""}.`);
          for (const riga of descriviScelteFascicolo(cfg)) testo(riga);
          const richieste = richiesteFascicolo(cfg.note_libere);
          if (richieste) testo(`Richieste: ${richieste}`);
          const campioni = selectedRoomVisuals(cfg).filter((s) => !["style", "floor_pattern", "floor_finish", "floor_skirting"].includes(s.group));
          const nomi: Record<string, string> = { floor_type: "Pavimento", window_profile: "Infissi", paint_finish: "Pittura", wallpaper_pattern: "Carta da parati", cladding_type: "Rivestimento", furniture_material: "Arredo", ceiling_type: "Soffitto", lighting_type: "Illuminazione", curtain_type: "Tende", kitchen_front: "Frontali cucina", kitchen_worktop: "Piano cucina", kitchen_handle: "Maniglie" };
          let topCampioni = y - 22, primaRiga = 0;
          for (let c = 0; c < campioni.length; c++) {
            if (c % 3 === 0 && topCampioni - Math.floor((c - primaRiga) / 3) * 200 < M + 185) {
              nuovaPagina(`${stanza.nome} - campioni del render ${nRender + 1}`, "Materiali scelti per questa immagine");
              topCampioni = y - 8; primaRiga = c;
            }
            const s = campioni[c], colonna = c % 3, riga = Math.floor((c - primaRiga) / 3);
            const foto = makeReferenceImage(s.photo!.folder, s.photo!.filename, s.label);
            const img = await risorsa(`Campione ${s.label} - ${stanza.nome}`, () => caricaFoto(foto.url, 15_000));
            if (!img) continue;
            const x = M + colonna * utile / 3, top = topCampioni - riga * 200;
            await immagine(img.dati, x, top, utile / 3 - 18, 155, true);
            pagina.drawText(pulito(`${nomi[s.group] ?? "Campione"}: ${s.label}`).slice(0, 40), { x, y: top - 176, size: 9, font: bold, color: nero });
          }
        }
        const sorgente = d.leggiSorgente && render.original_photo_url ? await risorsa(`Immagine di partenza - ${stanza.nome}`, () => d.leggiSorgente!(render)) : null;
        const personali = d.leggiCampioniPersonali ? await risorsa(`Campioni personali - ${stanza.nome}`, () => d.leggiCampioniPersonali!(render)) ?? [] : [];
        for (const [i, tavola] of personali.entries()) {
          nuovaPagina(`${stanza.nome} - prodotti selezionati`, `Campioni fotografici utilizzati per il render ${nRender + 1} / tavola ${i + 1}`);
          await immagine(tavola, M, y, utile, y - M, true);
        }
        for (const [i, url] of (render.result_urls ?? []).entries()) {
        avanza(`Render AI - ${stanza.nome}`);
        const img = await risorsa(`Render AI - ${stanza.nome} (${piano.livello.nome}), immagine ${i + 1}`, () => caricaFoto(url, 20_000));
        if (!img) continue;
        immaginiRender++;
        nuovaPagina(`${stanza.nome} - render AI`, `${piano.livello.nome} / ${nomeAmbito} / ${new Date(render.created_at).toLocaleDateString("it-IT")}${(render.result_urls?.length ?? 0) > 1 ? ` / Variante ${i + 1}` : ""}`, true);
        if (sorgente) {
          const colonna = 230, top = y - 22;
          pagina.drawText(render.planimetria?.partenza === "vista_3d" ? "MODELLO 3D DI PARTENZA" : "FOTO DI PARTENZA", { x: M, y, size: 9, font: bold, color: blu });
          pagina.drawText("RISULTATO AI", { x: M + colonna + 22, y, size: 9, font: bold, color: blu });
          await immagine(sorgente, M, top, colonna, 170, true);
          await immagine(img.dati, M + colonna + 22, top, utile - colonna - 22, top - M, true);
          y = top - 196;
          testo("La stessa inquadratura", 11, true, colonna);
          testo("La sorgente qui accanto è quella realmente usata per questo render. Puoi confrontare aperture, arredi e disposizione.", 10, false, colonna);
          testo(`${num(stanza.pavimentoMq)} m² | h ${num(stanza.altezzaCm / 100)} m`, 10, true, colonna);
        } else {
          await immagine(img.dati, M, y, utile, y - M, true);
        }
        }
      }
    }
    const impianti = await accodaFoglioImpianti(null, piano.stato, { formato: "A4", intestazione: `${d.titolo} - ${piano.livello.nome}` });
    if (impianti) { indice.push({ titolo: `Impianti - ${piano.livello.nome}`, pagina: doc.getPageCount() + 1 }); await aggiungiPdf(impianti.dati); }
  }
  for (const visuale of d.renderVisita ?? []) {
    avanza(`Render dalla vista 3D - ${visuale.nome}`);
    nuovaPagina(`${visuale.nome} - render dalla vista 3D`,
      [visuale.piano, nomeAmbito, new Date(visuale.data).toLocaleDateString("it-IT")].join(" / "), true);
    const intervallo = 20, colonna = (utile - intervallo) / 2, top = y - 15;
    const altezzaFoto = Math.min(310, top - M - 48);
    pagina.drawText("INQUADRATURA 3D", { x: M, y, size: 9, font: bold, color: blu });
    pagina.drawText("RENDER FOTOREALISTICO", { x: M + colonna + intervallo, y, size: 9, font: bold, color: blu });
    const h3d = await immagine(new Uint8Array(await visuale.anteprima.arrayBuffer()), M, top, colonna, altezzaFoto, true);
    const hRender = await immagine(new Uint8Array(await visuale.render.arrayBuffer()), M + colonna + intervallo, top, colonna, altezzaFoto, true);
    y = top - Math.max(h3d, hRender) - 19;
    testo("Stessa geometria e stessa camera. Calcolo della luce con Blender Cycles.");
    immaginiRender++;
  }
  if (propostaId) {
    const { studioVariante } = await import("./studioImmobiliare");
    const { righe } = studioVariante(d.documento, propostaId);
    if (righe.length) {
      avanza("Lavorazioni e quantità della variante");
      nuovaPagina("Lavorazioni e quantità", `${nomeAmbito} / Misure a partire dal progetto`, true);
      for (const riga of righe) {
        if (y < M + 64) nuovaPagina("Lavorazioni e quantità (continua)", nomeAmbito);
        const quantita = riga.quantita === null ? "Da quantificare" : `${num(riga.quantita)} ${riga.unita}${riga.stimata ? " (stima)" : ""}`;
        testo(`${riga.descrizione}  |  ${quantita}`, 11, true);
        testo([riga.piano, riga.fase, riga.criterio].filter(Boolean).join(" / "), 9);
        if (riga.prezzo) testo(`Prezzo unitario ${num(riga.prezzo.importo)} €/${riga.prezzo.unita} / ${riga.prezzo.fonte} ${riga.prezzo.tariffa}`, 9);
        y -= 8;
      }
    }
  }
  avanza("Prospetti, sezioni e riepilogo");
  const prospetti = pianiProspetto(d.documento, d.ambito);
  if (prospetti.some((p) => p.stato.muri.length)) {
    indice.push({ titolo: "Prospetti e sezioni", pagina: doc.getPageCount() + 1 });
    const disegni = (["sud", "nord", "est", "ovest"] as const).map((lato) => prospettoQuotato(prospetti, lato));
    for (const p of piani) if (p.stato.muri.length) {
      const pts = p.stato.muri.flatMap((m) => [m.p1, m.p2]);
      disegni.push(sezione(p.stato, { asse: "verticale", valore: (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2 }, `Sezione - ${p.livello.nome}`, p.livello.tetto));
    }
    const normale = impaginaDisegni(disegni, "A4"), compatto = impaginaDisegni(disegni, "A4", 100);
    const scala = normale.fogli - compatto.fogli >= 2 ? compatto.scala : normale.scala;
    await aggiungiPdf((await accodaTavole(null, disegni, { formato: "A4", scala, intestazione: d.titolo })).dati);
  }
  if (d.documento.letturaDocumento) {
    const sorgente = d.documento.letturaDocumento.sorgente;
    if (sorgente) {
      const bytes = await risorsa(`Documento originale - ${sorgente.nome}`, async () => await d.leggiDocumentoOriginale?.() ?? null);
      if (bytes?.length) {
        nuovaPagina("Documento originale della planimetria", sorgente.nome, true);
        await immagine(bytes, M, y, utile, H - 180);
      }
    }
    nuovaPagina("Verifiche del documento", "Conferme riferite alla geometria di questa versione", true);
    for (const v of verificheDelDocumento(d.documento)) {
      testo(v.descrizione, 10, true);
      if (v.valoriLettiCm?.length) testo(`Letture iniziali (cm): ${v.valoriLettiCm.map(num).join(" / ")}.`);
      if (v.conferma?.valoreCm !== undefined) testo(`Misura verificata: ${num(v.conferma.valoreCm)} cm.`);
      if (v.conferma?.nota) testo(`Verifica: ${v.conferma.nota}`);
      if (v.conferma?.quando) testo(`Confermata il ${new Date(v.conferma.quando).toLocaleDateString("it-IT")}.`, 8);
      y -= 8;
    }
  }
  const urbanistica = d.documento.urbanistica;
  if (urbanistica && (urbanistica.fonti.length || urbanistica.regole.length || urbanistica.riscontriTecnici?.length)) {
    const varianteId = d.ambito.startsWith("progetto:") ? d.ambito.slice(9) : "";
    nuovaPagina("Fonti e riscontri del fascicolo", `Versione ${d.versione} / ${nomeAmbito}`, true);
    for (const f of urbanistica.fonti) {
      testo([f.ruoloTavola && RUOLI_TAVOLA[f.ruoloTavola],f.titolo].filter(Boolean).join(" - "),11,true);
      testo([f.ente,f.versione,`Acquisito il ${f.acquisitaIl}`,f.efficaceDal && `Efficacia dichiarata dal ${f.efficaceDal}`,f.inquadramento && `Confronto con PDF, pagina ${f.inquadramento.pagina}`].filter(Boolean).join(" | "));
      if (f.url) testo(f.url,9);
      if (f.allegato) testo(`Allegato in archivio - ${f.allegato.nome}`,9);
      y -= 5;
    }
    if (varianteId) {
      const giorno = new Date().toLocaleDateString("sv-SE",{timeZone:"Europe/Rome"});
      for (const e of valutaUrbanistica(d.documento,varianteId,urbanistica,giorno)) {
        const regola = urbanistica.regole.find(r=>r.id===e.regolaId);
        if (!regola) continue;
        testo(`${DATI_URBANISTICI[regola.metrica]} - ${e.stato}`,11,true);
        testo(`${regola.riferimento} | ${regola.condizione}`);
        testo(e.dato);
      }
      for (const r of urbanistica.riscontriTecnici ?? []) {
        if (r.varianteId!==varianteId) continue;
        const titolo = RISCONTRI_TECNICI[r.criterio];
        const attuale = firmaRiscontroTecnico(d.documento,r)===r.firma;
        testo(`${titolo} - ${attuale ? r.esito==="criticita" ? "Criticità" : r.esodo?.simulazione ? "Collaudo registrato" : "Riscontro registrato" : "Da rinnovare"}`,11,true);
        testo([d.documento.livelli.find(l=>l.id===r.livelloId)?.nome,r.tecnico,r.data,urbanistica.fonti.find(f=>f.id===r.fonteId)?.titolo].filter(Boolean).join(" | "));
        testo(r.riferimento);
      }
    }
  }
  nuovaPagina("Riepilogo e punti da verificare", nomeAmbito, true);
  const dalDocumento = controlliDalDocumento(d.documento);
  if (dalDocumento.length) { testo("Controlli dal documento originale", 12, true); for (const avviso of dalDocumento) testo(avviso); y -= 10; }
  for (const p of piani) {
    testo(`${p.livello.nome}: ${p.stanze.length} ambienti, ${num(p.stanze.reduce((n, s) => n + s.pavimentoMq, 0))} m², ${p.serramenti.length} aperture.`, 11, true);
    for (const a of p.stato.aree ?? []) testo(`Area esterna: ${a.nome || a.tipo.replace(/_/g, " ")}.`);
  }
  if (riscontri3D.length) {
    y -= 10;
    testo("Aperture e geometria 3D da confrontare con la tavola", 12, true);
    for (const avviso of new Set(riscontri3D)) testo(avviso);
    y -= 10;
  }
  for (const v of verificaPianta(d.documento, d.ambito).filter((v) => v.esito !== "ok")) testo(`${v.livello} - ${v.oggetto}: ${v.messaggio}`);
  if (avvisi.size) {
    nuovaPagina("Immagini e allegati da recuperare", "Risorse che non è stato possibile leggere durante l’esportazione", true);
    for (const nome of avvisi) testo(nome, 11);
  }
  // L'indice si inserisce alla fine: i rimandi tengono conto di tutte le pagine reali, anche quelle paginate automaticamente.
  const nIndice = Math.max(1, Math.ceil(indice.length / 21));
  const fogliIndice = Array.from({ length: nIndice }, (_, i) => doc.insertPage(1 + i, [W, H]));
  for (let i = 0; i < nIndice; i++) {
    pagina = fogliIndice[i]; y = H - M;
    pagina.drawRectangle({ x: 0, y: H - 5, width: W, height: 5, color: blu });
    testo(i ? "Indice - continua" : "Indice del fascicolo", 20, true); y -= 15;
    for (const [r, voce] of indice.slice(i * 21, (i + 1) * 21).entries()) {
      if (r % 2 === 0) pagina.drawRectangle({ x: M, y: y - 5, width: utile, height: 20, color: fondo });
      pagina.drawText(ellissi(voce.titolo, utile - 80, 11), { x: M + 8, y, size: 11, font, color: blu });
      const numero = voce.pagina + nIndice;
      pagina.drawText(String(numero), { x: W - M - 24, y, size: 11, font: bold, color: nero });
      const link = doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [M, y - 5, W - M, y + 15],
        Border: [0, 0, 0], Dest: [doc.getPage(numero - 1).ref, "Fit"] });
      pagina.node.addAnnot(doc.context.register(link));
      y -= 20.5;
    }
  }
  const pagine = doc.getPageCount();
  doc.getPages().forEach((p, i) => {
    p.drawText(`Edilizia in Cloud  /  Versione ${d.versione}`, { x: M, y: 13, size: 7, font, color: grigio });
    p.drawText(`${i + 1} / ${pagine}`, { x: p.getWidth() - M - 25, y: 13, size: 7, font: bold, color: blu });
  });
  return { dati: await doc.save(), pagine, immaginiRender, avvisi: avvisi.size };
}
