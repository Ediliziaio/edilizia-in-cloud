import type { PDFImage, PDFPage } from "pdf-lib";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";
import { areaPoligono } from "../../../shared/planimetrie/geometria.ts";
import { COLORI_INFISSI_PROGETTO, PROFILI_PROGETTO, descrizionePavimento, statoConMateriali } from "../../../shared/planimetrie/materialiProgetto.ts";
import { svgPiantaStanza } from "../../../shared/render-planimetria/piantaStanza.ts";
import { verificaPianta } from "../../../shared/planimetrie/verifiche.ts";
import { selectedRoomVisuals } from "../../../shared/render-references/roomVisualCatalog.ts";
import { makeReferenceImage } from "../../../shared/render-references/referenceUrl.ts";
import { contenutoFascicolo } from "./fascicoloModello";
import { caricaLogo, esportaPdf, vistaDaPlanimetria, type DatiCartiglio } from "./esporta";
import { pianteDaPlanimetria, pianiDaPlanimetria, costruisciScena, scenaEdificio, vistaGiroIntorno, vistaDentroLocale } from "./tred";
import { pianiProspetto, prospettoQuotato, sezione } from "./prospetti";
import { accodaTavole, accodaFoglioImpianti } from "./tavole";
import type { RenderDellaPianta } from "./render/renderDallaPianta";

export interface DatiFascicolo {
  documento: Planimetria; titolo: string; versione: number; ambito: string;
  cartiglio: DatiCartiglio; renders: RenderDellaPianta[];
  progresso?: (fase: string) => void;
}

/** Un fascicolo usa solo geometrie salvate, viste vere del modello e render già generati. Nessuna chiamata AI. */
export async function esportaFascicolo(d: DatiFascicolo): Promise<{ dati: Uint8Array; pagine: number; immaginiRender: number }> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 841.89, H = 595.28, M = 40, utile = W - M * 2;
  const nero = rgb(.08, .13, .19), grigio = rgb(.35, .4, .46), blu = rgb(.09, .25, .44);
  const pulito = (s: string) => s.replace(/[\r\n\t]+/g, " ").replace(/[–—]/g, "-").replace(/[^ -ÿ€’‘“”]/g, "");
  const num = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
  let pagina: PDFPage, y = H - M;
  const indice: Array<{ titolo: string; pagina: number }> = [];
  const immagini = new Map<string, PDFImage>();
  const fotoLette = new Map<string, ReturnType<typeof caricaLogo>>();
  const caricaFoto = (url: string, timeout: number) => {
    if (!fotoLette.has(url)) fotoLette.set(url, caricaLogo(url, timeout));
    return fotoLette.get(url)!;
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
      if (y < M + 25) nuovaPagina("Continua");
      pagina.drawText(r, { x, y, size, font: f, color: forte ? nero : grigio }); y -= size * 1.5;
    }
  };
  const nuovaPagina = (titolo: string, sotto = "", indicizza = false) => {
    pagina = doc.addPage([W, H]); y = H - M;
    pagina.drawRectangle({ x: 0, y: H - 9, width: W, height: 9, color: blu });
    if (indicizza) indice.push({ titolo, pagina: doc.getPageCount() });
    testo(titolo, 20, true); if (sotto) testo(sotto, 10); y -= 14;
  };
  const immagine = async (dati: Uint8Array, x: number, top: number, w: number, h: number) => {
    const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(dati).buffer);
    const chiave = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
    let img = immagini.get(chiave);
    if (!img) { img = dati[0] === 0x89 ? await doc.embedPng(dati) : await doc.embedJpg(dati); immagini.set(chiave, img); }
    const k = Math.min(w / img.width, h / img.height);
    pagina.drawImage(img, { x: x + (w - img.width * k) / 2, y: top - img.height * k, width: img.width * k, height: img.height * k });
  };
  const aggiungiPdf = async (bytes: Uint8Array) => {
    const p = await PDFDocument.load(bytes);
    for (const foglio of await doc.copyPages(p, p.getPageIndices())) doc.addPage(foglio);
  };
  const avanza = (fase: string) => d.progresso?.(fase);
  const piani = contenutoFascicolo(d.documento, d.versione, d.ambito, d.renders);
  const comuni = piani[0]?.materiali ?? {};
  const vista3D = d.ambito === "fatto" ? "fatto" as const : "progetto" as const;
  const stanze = piani.flatMap((p) => p.stanze);
  const immaginiRender = stanze.reduce((n, s) => n + s.renders.reduce((m, r) => m + (r.result_urls?.length ?? 0), 0), 0);
  const nomeAmbito = d.ambito === "fatto" ? "Stato di fatto" : d.documento.livelli.flatMap((l) => l.proposte).find((p) => `progetto:${p.id}` === d.ambito)?.nome ?? "Progetto";
  doc.setTitle(`${d.titolo} - Fascicolo completo`); doc.setAuthor(d.cartiglio.azienda.nome); doc.setCreator("Edilizia in Cloud - Planimetrie");
  nuovaPagina(d.titolo, `FASCICOLO COMPLETO / ${nomeAmbito} / Versione ${d.versione}`);
  if (d.cartiglio.azienda.logo) await immagine(d.cartiglio.azienda.logo.dati, W - M - 140, y + 18, 140, 55);
  testo(d.cartiglio.azienda.nome, 16, true);
  testo([d.cartiglio.azienda.indirizzo, d.cartiglio.azienda.telefono, d.cartiglio.azienda.email].filter(Boolean).join(" | "));
  if (d.cartiglio.cliente) testo(`Committente: ${d.cartiglio.cliente}`, 12);
  if (d.cartiglio.indirizzoCantiere) testo(`Immobile: ${d.cartiglio.indirizzoCantiere}`, 12);
  testo(`Data: ${(d.cartiglio.data instanceof Date ? d.cartiglio.data : new Date(d.cartiglio.data ?? Date.now())).toLocaleDateString("it-IT")}`);
  y -= 24;
  testo(`${piani.length} ${piani.length === 1 ? "piano" : "piani"}   |   ${stanze.length} ambienti   |   ${immaginiRender} immagini render`, 16, true);
  testo("Planimetrie in scala, viste 3D, materiali e campioni, misure, serramenti, arredi, impianti, prospetti, sezioni e render per stanza.", 12);
  y -= 16;
  const mancanti = stanze.filter((s) => !s.renders.length);
  testo(mancanti.length ? `Render ancora da generare: ${mancanti.map((s) => s.nome).join(", ")}. Le relative stanze sono comunque documentate.` : "Tutti gli ambienti di questa versione hanno almeno un render.");
  testo("Le immagini 3D sono viste del disegno. I render AI sono presentazioni fotorealistiche. Le misure indicate come stimate restano da verificare sul posto.");
  testo("Sono inclusi i render completati della versione e del progetto selezionati. Le versioni precedenti rimangono nello storico.");

  avanza("Materiali e campioni");
  nuovaPagina("Materiali della casa", nomeAmbito, true);
  testo(`Pavimento comune: ${comuni.pavimento ? descrizionePavimento(comuni.pavimento) : "non impostato; vedi le finiture delle singole stanze"}.`, 12, true);
  testo(`Infissi comuni: ${comuni.infissi ? `${PROFILI_PROGETTO[comuni.infissi.profilo]} - ${COLORI_INFISSI_PROGETTO[comuni.infissi.colore].nome}` : "mantieni i materiali esistenti"}.`, 12, true);
  testo("Il materiale comune non modifica il numero, la posizione, la misura o il numero di ante delle aperture.");
  const campioni = selectedRoomVisuals({ pavimento: comuni.pavimento, infissi_progetto: comuni.infissi }).filter((s) => ["floor_type", "window_profile"].includes(s.group));
  for (const [i, s] of campioni.entries()) {
    const foto = makeReferenceImage(s.photo!.folder, s.photo!.filename, s.label);
    const img = await caricaFoto(foto.url, 15_000);
    if (!img) throw new Error(`Campione ${s.label} non disponibile: riprova l'esportazione.`);
    await immagine(img.dati, M + i * (utile / 2), y - 10, utile / 2 - 20, 260);
    pagina.drawText(pulito(s.label), { x: M + i * utile / 2, y: y - 290, size: 11, font: bold, color: nero });
  }

  const { caricaFotogramma } = await import("@/components/planimetrie/Vista3DPigra");
  const cattura = await caricaFotogramma();
  const propostaId = d.ambito.startsWith("progetto:") ? d.ambito.slice(9) : undefined;
  const edificio = pianiDaPlanimetria(d.documento, propostaId);
  if (piani.some((p) => p.stanze.length)) {
    avanza("Vista 3D dell'edificio");
    const primo = piani.find((p) => p.stanze.length)!;
    const coppia = pianteDaPlanimetria(d.documento, { livelloId: primo.livello.id, propostaId, materialiAmbito: d.ambito });
    const pianta = d.ambito === "fatto" ? coppia.fatto : coppia.progetto;
    const scena = scenaEdificio(edificio, { vista: d.ambito === "fatto" ? "fatto" : "progetto", soffitto: true, elementi: true });
    const foto = await cattura({ pianta, piani: edificio, localeId: primo.stanze[0].id, telecamera: vistaGiroIntorno(scena.limiti, 1.5), vista: d.ambito === "fatto" ? "fatto" : "progetto", larghezza: 1536, altezza: 1024 });
    nuovaPagina("La casa in 3D", `${nomeAmbito} - vista del modello completo`, true);
    await immagine(new Uint8Array(await foto.png.arrayBuffer()), M, y, utile, y - M);
  }

  for (const piano of piani) {
    avanza(`Planimetria e 3D - ${piano.livello.nome}`);
    indice.push({ titolo: `Planimetria - ${piano.livello.nome}`, pagina: doc.getPageCount() + 1 });
    const docMateriali = { ...d.documento, livelli: d.documento.livelli.map((l) => l.id === piano.livello.id ? { ...l, fatto: statoConMateriali(l.fatto, comuni), proposte: l.proposte.map((pr) => ({ ...pr, ...statoConMateriali(pr, comuni) })) } : l) };
    const vista = vistaDaPlanimetria(docMateriali, { livelloId: piano.livello.id, modo: piano.geometria === "fatto" ? "fatto" : "progetto", propostaId });
    await aggiungiPdf((await esportaPdf(vista, { ...d.cartiglio, oggetto: `${piano.livello.nome} - ${nomeAmbito}` }, { formato: "A4", orientamento: "orizzontale", scala: "auto", stile: "presentazione" })).dati);
    const coppia = pianteDaPlanimetria(d.documento, { livelloId: piano.livello.id, propostaId, materialiAmbito: d.ambito });
    const pianta = d.ambito === "fatto" ? coppia.fatto : coppia.progetto;
    if (piano.stanze.length) {
      const scena = costruisciScena(pianta, { vista: vista3D, soffitto: false, elementi: true });
      const foto = await cattura({ pianta, localeId: piano.stanze[0].id, telecamera: vistaGiroIntorno(scena.limiti, 1.5), vista: vista3D, soffitto: false, larghezza: 1536, altezza: 1024 });
      nuovaPagina(`${piano.livello.nome} - vista 3D aperta`, "Distribuzione delle stanze, arredi, pavimenti e aperture", true);
      await immagine(new Uint8Array(await foto.png.arrayBuffer()), M, y, utile, y - M);
    }
    nuovaPagina(`${piano.livello.nome} - porte e finestre`, `${piano.serramenti.length} aperture disegnate`, true);
    for (const a of piano.serramenti) {
      testo(`${a.codice} - ${a.tipo} ${num(a.larghezza)} x ${num(a.altezza)} cm | ${a.stanze}`, 11, true);
      testo(`${a.sistema}; ${a.ante} ante; davanzale ${num(a.davanzale)} cm; ${a.stato}${a.stimata ? "; misure stimate" : ""}. Oscurante: ${a.oscurante}. Cassonetto: ${a.cassonetto}. Zanzariera: ${a.zanzariera}.`);
      y -= 7;
    }
    if (!piano.serramenti.length) testo("Nessuna apertura disegnata in questo piano.");
    nuovaPagina(`${piano.livello.nome} - muri ed elementi`, `Quota del piano: ${num(piano.livello.quota / 100)} m`, true);
    for (const [i, m] of piano.stato.muri.entries()) {
      testo(`Parete ${i + 1}: lunghezza ${num(Math.hypot(m.p2.x - m.p1.x, m.p2.y - m.p1.y) / 100)} m; spessore ${num(m.spessore)} cm; altezza ${num(m.altezza / 100)} m; ${m.tipo}; ${(m.stato ?? "esistente").replace(/_/g, " ")}${m.origine === "stimata" ? "; misure stimate" : ""}.`);
    }
    for (const a of piano.stato.aree ?? []) testo(`Area esterna: ${a.nome || a.tipo.replace(/_/g, " ")} - ${num(areaPoligono(a.contorno) / 10_000)} m².`);
    const esterni = piano.stato.elementi.filter((e) => !piano.stato.locali.some((l) => e.localeId === l.id || (!e.localeId && elementoNelLocale(e.posizione, l.contorno))));
    for (const e of esterni) testo(`Elemento fuori dai locali: ${e.tipo.replace(/_/g, " ")} - ${num(e.larghezza)} x ${num(e.profondita)} cm${e.altezza ? `; h ${num(e.altezza)} cm` : ""}.`);
    for (const stanza of piano.stanze) {
      avanza(`Scheda ambiente - ${stanza.nome}`);
      nuovaPagina(stanza.nome, `${piano.livello.nome} / ${nomeAmbito}`, true);
      testo(`${num(stanza.pavimentoMq)} m² | h ${num(stanza.altezzaCm / 100)} m | volume ${num(stanza.volumeMc)} m³ | perimetro ${num(stanza.perimetroMl)} m`, 12, true);
      testo(`${stanza.vincoli.locale.rettangolare ? "Dimensioni interne" : "Ingombro massimo"}: ${num(stanza.vincoli.locale.larghezza_cm / 100)} x ${num(stanza.vincoli.locale.profondita_cm / 100)} m.`);
      testo(`Pareti nette ${num(stanza.paretiNetteMq)} m²; soffitto ${num(stanza.soffittoMq)} m²; battiscopa ${num(stanza.battiscopaMl)} m.${stanza.stimata ? " Misure stimate: da verificare." : ""}`);
      if (stanza.finiture !== "—") testo(stanza.finiture);
      if (comuni.pavimento) testo(`Pavimento comune applicato: ${descrizionePavimento(comuni.pavimento)}.`);
      const elementi = piano.stato.elementi.filter((e) => e.localeId === stanza.id || (!e.localeId && stanza.vincoli && elementoNelLocale(e.posizione, piano.stato.locali.find((l) => l.id === stanza.id)!.contorno)));
      testo(`Arredi e impianti disegnati: ${elementi.map((e) => `${e.tipo.replace(/_/g, " ")} ${num(e.larghezza)} x ${num(e.profondita)} cm`).join("; ") || "nessuno"}.`);
      testo(stanza.renders.length ? `${stanza.renders.length} render ${stanza.renders.length === 1 ? "completato" : "completati"} nelle pagine seguenti.` : "Render AI ancora da generare per questa stanza.");
      y -= 6;
      const { pngDaSvg } = await import("./render/renderDallaPianta");
      const schema = await pngDaSvg(svgPiantaStanza(stanza.vincoli), 1024);
      const foto = await cattura({ pianta, localeId: stanza.id, telecamera: vistaDentroLocale(pianta.locali.find((l) => l.id === stanza.id)!), vista: vista3D, larghezza: 1536, altezza: 1024 });
      if (y < M + 170) nuovaPagina(`${stanza.nome} - pianta e 3D`, piano.livello.nome);
      const spazio = Math.max(140, y - M - 10);
      await immagine(new Uint8Array(await schema.arrayBuffer()), M, y, utile * .43, spazio);
      await immagine(new Uint8Array(await foto.png.arrayBuffer()), M + utile * .45, y, utile * .55, spazio);
      for (const [nRender, render] of stanza.renders.entries()) {
        if (render.scelte) {
          nuovaPagina(`${stanza.nome} - scelte del render ${nRender + 1}`, `${piano.livello.nome} / ${new Date(render.created_at).toLocaleDateString("it-IT")}`);
          const cfg = render.scelte;
          const leggi = (k: string) => cfg[k] && typeof cfg[k] === "object" ? cfg[k] as Record<string, unknown> : {};
          const pavimento = leggi("pavimento"), infissi = leggi("infissi_progetto");
          const eccezione = leggi("eccezioni_materiali_progetto").pavimento === true;
          if (pavimento.attivo) testo(`${eccezione ? "Eccezione al pavimento comune per questo render" : "Pavimento"}: ${descrizionePavimento(pavimento as never)}.`, 11, true);
          if (infissi.profilo && infissi.colore) testo(`Infissi: ${PROFILI_PROGETTO[infissi.profilo as keyof typeof PROFILI_PROGETTO] ?? ""} - ${COLORI_INFISSI_PROGETTO[infissi.colore as keyof typeof COLORI_INFISSI_PROGETTO]?.nome ?? ""}.`);
          for (const [chiave, nome] of [["verniciatura", "Pittura pareti"], ["carta_da_parati", "Carta da parati"], ["rivestimento_pareti", "Rivestimento pareti"], ["arredo", "Arredo"], ["soffitto", "Soffitto"], ["illuminazione", "Illuminazione"], ["tende", "Tende"], ["restyling_cucina", "Restyling cucina"]]) {
            const s = leggi(chiave); if (s.attivo !== true) continue;
            const valori = [s.colore_nome, s.colore_hex, s.tipo, s.materiale, s.stile_pattern, s.finitura, s.applica_a].filter((v): v is string => typeof v === "string" && !!v).map((v) => v.replace(/_/g, " "));
            testo(`${nome}: ${valori.join("; ") || "intervento selezionato"}.`);
          }
          if (typeof cfg.note_libere === "string" && cfg.note_libere.trim()) testo(`Richieste: ${cfg.note_libere}`);
          const campioni = selectedRoomVisuals(cfg).filter((s) => !["style", "floor_pattern", "floor_finish", "floor_skirting"].includes(s.group));
          const nomi: Record<string, string> = { floor_type: "Pavimento", window_profile: "Infissi", paint_finish: "Pittura", wallpaper_pattern: "Carta da parati", cladding_type: "Rivestimento", furniture_material: "Arredo", ceiling_type: "Soffitto", lighting_type: "Illuminazione", curtain_type: "Tende", kitchen_front: "Frontali cucina", kitchen_worktop: "Piano cucina", kitchen_handle: "Maniglie" };
          for (let c = 0; c < campioni.length; c++) {
            if (c % 6 === 0) nuovaPagina(`${stanza.nome} - campioni del render ${nRender + 1}`, "Materiali scelti per questa immagine");
            const s = campioni[c], colonna = c % 3, riga = Math.floor((c % 6) / 3);
            const foto = makeReferenceImage(s.photo!.folder, s.photo!.filename, s.label);
            const img = await caricaFoto(foto.url, 15_000);
            if (!img) throw new Error(`Campione ${s.label} non disponibile: riprova l'esportazione.`);
            const x = M + colonna * utile / 3, top = H - 110 - riga * 220;
            await immagine(img.dati, x, top, utile / 3 - 18, 180);
            pagina.drawText(pulito(`${nomi[s.group] ?? "Campione"}: ${s.label}`).slice(0, 40), { x, y: top - 200, size: 9, font: bold, color: nero });
          }
        }
        for (const [i, url] of (render.result_urls ?? []).entries()) {
        avanza(`Render AI - ${stanza.nome}`);
        const img = await caricaFoto(url, 20_000);
        if (!img) throw new Error(`Immagine render di ${stanza.nome} non disponibile: riprova per ottenere il fascicolo completo.`);
        nuovaPagina(`${stanza.nome} - render AI`, `${piano.livello.nome} / ${nomeAmbito} / ${new Date(render.created_at).toLocaleDateString("it-IT")}${(render.result_urls?.length ?? 0) > 1 ? ` / Variante ${i + 1}` : ""}`);
        await immagine(img.dati, M, y, utile, y - M);
        }
      }
    }
    const impianti = await accodaFoglioImpianti(null, piano.stato, { formato: "A4", intestazione: `${d.titolo} - ${piano.livello.nome}` });
    if (impianti) { indice.push({ titolo: `Impianti - ${piano.livello.nome}`, pagina: doc.getPageCount() + 1 }); await aggiungiPdf(impianti.dati); }
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
    await aggiungiPdf((await accodaTavole(null, disegni, { formato: "A4", intestazione: d.titolo })).dati);
  }
  nuovaPagina("Riepilogo e punti da verificare", nomeAmbito, true);
  for (const p of piani) {
    testo(`${p.livello.nome}: ${p.stanze.length} ambienti, ${num(p.stanze.reduce((n, s) => n + s.pavimentoMq, 0))} m², ${p.serramenti.length} aperture.`, 11, true);
    for (const a of p.stato.aree ?? []) testo(`Area esterna: ${a.nome || a.tipo.replace(/_/g, " ")}.`);
  }
  for (const v of verificaPianta(d.documento, d.ambito).filter((v) => v.esito !== "ok")) testo(`${v.livello} - ${v.oggetto}: ${v.messaggio}`);
  // L'indice si inserisce alla fine: i rimandi tengono conto di tutte le pagine reali, anche quelle paginate automaticamente.
  const nIndice = Math.max(1, Math.ceil(indice.length / 21));
  for (let i = 0; i < nIndice; i++) {
    pagina = doc.insertPage(1 + i, [W, H]); y = H - M;
    testo(i ? "Indice - continua" : "Indice del fascicolo", 20, true); y -= 15;
    for (const voce of indice.slice(i * 21, (i + 1) * 21)) {
      let titolo = pulito(voce.titolo);
      if (font.widthOfTextAtSize(titolo, 11) > utile - 70) {
        while (font.widthOfTextAtSize(`${titolo}...`, 11) > utile - 70) titolo = titolo.slice(0, -1);
        titolo += "...";
      }
      pagina.drawText(titolo, { x: M, y, size: 11, font, color: grigio });
      pagina.drawText(String(voce.pagina + nIndice), { x: W - M - 24, y, size: 11, font: bold, color: nero }); y -= 20.5;
    }
  }
  const pagine = doc.getPageCount();
  doc.getPages().forEach((p, i) => p.drawText(`Edilizia in Cloud | v${d.versione} | ${i + 1} / ${pagine}`, { x: 40, y: 13, size: 7, font, color: grigio }));
  return { dati: await doc.save(), pagine, immaginiRender };
}

function elementoNelLocale(p: { x: number; y: number }, poligono: Array<{ x: number; y: number }>): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) { const a = poligono[i], b = poligono[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) dentro = !dentro; }
  return dentro;
}
