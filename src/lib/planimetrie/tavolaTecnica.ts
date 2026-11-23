import type { PlanText } from "../preventivi/planReading";

export type AreaTavola = { x: number; y: number; larghezza: number; altezza: number };
export type ReteAria = "mandata" | "ripresa";
export type PortataTavola = { nome: string; cfm: number; zona: AreaTavola };
export type SezioneCanale = { rete: ReteAria; larghezzaMm: number; altezzaMm: number; letture: number };
type QuotaAssi = { totaleMm: number; campateMm: number[]; zona: AreaTavola; distanzaCentri: number };
export type DatiHvac = {
  portate: PortataTavola[];
  sezioni: SezioneCanale[];
  sigleDaVerificare: number;
  unitaTrattamentoAria: AreaTavola | null;
  simboli: string[];
  scalaScritta?: string;
  orizzontale: QuotaAssi | null;
  verticale: QuotaAssi | null;
};
export type VistaTavolaTecnica = "pianta" | ReteAria;
type Raster = { larghezza: number; altezza: number; pixel: Uint8Array };
export type TavolaTecnica =
  | { tipo: "ordinaria"; raster: Raster }
  | { tipo: "composita"; raster: Raster; area: AreaTavola }
  | { tipo: "hvac"; raster: Raster; area: AreaTavola; colori: Uint8Array | null; segniEsclusi: Uint8Array | null; codiceMandata: number; dati: DatiHvac };

const basso = (s: PlanText) => s.bbox[1] + s.bbox[3];
const centroX = (s: PlanText) => s.bbox[0] + s.bbox[2] / 2;
const centroY = (s: PlanText) => s.bbox[1] + s.bbox[3] / 2;
const zonaTesto = (s: PlanText): AreaTavola => ({
  x: s.bbox[0], y: s.bbox[1], larghezza: s.bbox[2], altezza: s.bbox[3],
});
export function dentroTavola(s: PlanText, area: AreaTavola) {
  const x = centroX(s);
  const y = centroY(s);
  return x >= area.x && x <= area.x + area.larghezza && y >= area.y && y <= area.y + area.altezza;
}

function dicitureHvac(righe: readonly PlanText[]) {
  return righe.some((s) => s.confidence >= 0.5 && /\b(?:HVAC\b.*\bDUCT|SUPPLY\s+AIR\s+DUCT|RETURN\s+AIR\s+DUCT)\b/i.test(s.text));
}

export function sezioneCanaleLetta(riga: string): Omit<SezioneCanale, "letture"> | null {
  const sezione = /^([SR])\s*\.?\s*A\.?\s*(\d{2,4})\s*[x×]\s*(\d{2,4})\s*(?:mm)?$/i.exec(riga.trim());
  if (!sezione) return null;
  const larghezzaMm = Number(sezione[2]);
  const altezzaMm = Number(sezione[3]);
  if (!larghezzaMm || !altezzaMm) return null;
  return { rete: sezione[1].toUpperCase() === "S" ? "mandata" : "ripresa", larghezzaMm, altezzaMm };
}

function etichettaPortata(portata: PlanText, testi: PlanText[]) {
  const precedente = (s: PlanText) => testi.filter((t) => t !== s
    && t.bbox[1] < s.bbox[1] && s.bbox[1] - basso(t) >= -0.004 && s.bbox[1] - basso(t) < 0.014
    && Math.abs(centroX(t) - centroX(s)) < 0.019
    && /^[\p{L}][\p{L}\d .'-]*$/u.test(t.text.trim()))
    .sort((a, b) => basso(b) - basso(a))[0];
  const riga = precedente(portata);
  if (!riga) return "";
  const sopra = /^(?:CABIN|ROOM|AREA)$/i.test(riga.text.trim()) ? precedente(riga) : undefined;
  return [sopra?.text.trim(), riga.text.trim()].filter(Boolean).join(" ");
}

/** Mantiene una lettura per punto della tavola, anche con nomi uguali. */
export function leggiDatiHvac(righe: readonly PlanText[], area: AreaTavola, quoteVerticali: readonly PlanText[] = []): DatiHvac {
  const testi = righe.filter((r) => r.confidence >= 0.48);
  const pianta = testi.filter((r) => dentroTavola(r, area));
  const portate: PortataTavola[] = [];
  const sezioni = new Map<string, SezioneCanale>();
  let sigleDaVerificare = 0;
  for (const testo of pianta) {
    const riga = testo.text.trim();
    const portata = /(?:^|\s|\()(\d{1,5}|\d{1,3}(?:[,. ]\d{3}){1,2})\s*CFM\b/i.exec(riga);
    if (portata) {
      const nome = (riga.slice(0, portata.index).trim() || etichettaPortata(testo, pianta)).slice(0, 100);
      const cfm = Number(portata[1].replace(/[,. ]/g, ""));
      const zona = zonaTesto(testo);
      if (!portate.some((p) => p.cfm === cfm && Math.abs(p.zona.x - zona.x) < 0.004 && Math.abs(p.zona.y - zona.y) < 0.004)) {
        portate.push({ nome, cfm, zona });
      }
    }
    const sezione = sezioneCanaleLetta(riga);
    if (sezione) {
      const chiave = `${sezione.rete}-${sezione.larghezzaMm}-${sezione.altezzaMm}`;
      const precedente = sezioni.get(chiave);
      if (precedente) precedente.letture++;
      else sezioni.set(chiave, { ...sezione, letture: 1 });
    } else if (/^(?:[SR]\s*\.?\s*)?A\.?\s*\d{2,4}\s*[x×]/i.test(riga)) {
      sigleDaVerificare++;
    }
  }
  const unitaTrattamentoAria = pianta.find((s) => /^AHU$/i.test(s.text.trim()));
  const scala = testi.find((s) => /\bSCALE\s*:?\s*1\s*:\s*\d+\b/i.test(s.text));
  const inMillimetri = testi.some((s) => /DIMENSIONS\b.*\bMILLIMET(?:ER|RE)S\b/i.test(s.text));
  const simboli = [
    { testo: /SUPPLY DIFFUSER/i, nome: "Diffusore di mandata" },
    { testo: /RETURN AIR GRILLE/i, nome: "Griglia di ripresa" },
  ].filter(({ testo }) => testi.some((s) => testo.test(s.text))).map(({ nome }) => nome);
  return {
    portate: portate.sort((a, b) => Math.round(a.zona.y / 0.012) - Math.round(b.zona.y / 0.012) || a.zona.x - b.zona.x),
    sezioni: [...sezioni.values()],
    sigleDaVerificare,
    unitaTrattamentoAria: unitaTrattamentoAria ? zonaTesto(unitaTrattamentoAria) : null,
    simboli,
    scalaScritta: scala?.text.match(/1\s*:\s*\d+/)?.[0]?.replace(/\s+/g, ""),
    orizzontale: inMillimetri ? quotaDAssi(testi.filter((s) => basso(s) < area.y), false) : null,
    verticale: inMillimetri ? quotaDAssi(quoteVerticali, true) : null,
  };
}

function quotaDAssi(righe: readonly PlanText[], verticale: boolean): QuotaAssi | null {
  const quote = righe.filter((s) => s.confidence >= 0.56 && /^\d{4,6}$/.test(s.text.trim()));
  const valore = (s: PlanText) => Number(s.text.trim());
  const asse = (s: PlanText) => verticale ? s.bbox[0] : s.bbox[1];
  const lungo = verticale ? centroY : centroX;
  for (const totale of quote) {
    const piuVicine = quote.filter((s) => s !== totale && asse(s) > asse(totale) + 0.006
      && asse(s) < asse(totale) + 0.08 && valore(s) < valore(totale));
    if (piuVicine.length < 2) continue;
    const campate = piuVicine.filter((s) => Math.abs(asse(s) - asse(piuVicine[0])) < 0.008).sort((a, b) => lungo(a) - lungo(b));
    if (campate.length >= 2 && campate.reduce((somma, s) => somma + valore(s), 0) === valore(totale)) {
      return { totaleMm: valore(totale), campateMm: campate.map(valore), zona: zonaTesto(totale),
        distanzaCentri: lungo(campate[campate.length - 1]) - lungo(campate[0]) };
    }
  }
  return null;
}

/** Confronto indicativo fra le due scale fotografiche, basato sulle posizioni delle scritte. */
export function scalaRasterHvacDiscordante(tavola: Extract<TavolaTecnica, { tipo: "hvac" }>) {
  const { orizzontale, verticale } = tavola.dati;
  if (!orizzontale || !verticale || Math.min(orizzontale.distanzaCentri, verticale.distanzaCentri) < 0.1) return false;
  const pxPerMm = (q: QuotaAssi, lato: number) => {
    const mezzeCampate = (q.campateMm[0] + q.campateMm[q.campateMm.length - 1]) / 2;
    return q.distanzaCentri * lato / (q.totaleMm - mezzeCampate);
  };
  const x = pxPerMm(orizzontale, tavola.raster.larghezza);
  const y = pxPerMm(verticale, tavola.raster.altezza);
  return Math.abs(x - y) / Math.max(x, y) > 0.12;
}

function coloreRete(r: number, g: number, b: number) {
  if (b > 135 && b > r + 28 && g > r + 19) return 1;
  if (r > 145 && r > b + 24 && r > g + 27) return 2;
  return 0;
}

function limitiImpianto(righeColori: Uint32Array, righeScure: Uint32Array, w: number, h: number): AreaTavola {
  const minimo = w * 0.014;
  let prima = -1;
  let ultima = -1;
  for (let y = Math.round(h * 0.05); y < h * 0.81; y++) {
    if (righeColori[y] < minimo || righeColori[y - 2] < minimo) continue;
    if (prima === -1) prima = y - 2;
    ultima = y;
  }
  if (prima < 0 || ultima - prima < h * 0.28) return { x: 0, y: 0, larghezza: 1, altezza: 1 };
  const bordo = (da: number, a: number, altrimenti: number) => {
    let scelto = altrimenti;
    let massimo = w * 0.24;
    for (let y = Math.max(0, Math.floor(da)); y < Math.min(h, Math.ceil(a)); y++) {
      if (righeScure[y] > massimo) { scelto = y; massimo = righeScure[y]; }
    }
    return scelto;
  };
  const alto = Math.max(0, bordo(prima - h * 0.11, prima - h * 0.013, prima - h * 0.04) - h * 0.014);
  const basso = Math.min(h, bordo(ultima + h * 0.017, ultima + h * 0.115, ultima + h * 0.055) + h * 0.014);
  return { x: 0, y: alto / h, larghezza: 1, altezza: (basso - alto) / h };
}

function codiceInLegenda(righe: readonly PlanText[], colori: Uint8Array, w: number, h: number, area: AreaTavola) {
  for (const testo of righe) {
    const mandata = /\bSUPPLY AIR DUCT\b/i.test(testo.text);
    if ((!mandata && !/\bRETURN AIR DUCT\b/i.test(testo.text)) || dentroTavola(testo, area)) continue;
    const [x, y, , altezza] = testo.bbox;
    const contatori = [0, 0, 0];
    for (let riga = Math.floor(y * h); riga < Math.min(h, Math.ceil((y + altezza) * h)); riga++) {
      for (let col = Math.floor(Math.max(0, x - 0.09) * w); col < Math.floor(x * w); col++) contatori[colori[riga * w + col]]++;
    }
    const prevale = contatori[1] > contatori[2] ? 1 : 2;
    if (contatori[prevale] > 20 && contatori[prevale] > 3 * contatori[3 - prevale]) return mandata ? prevale : 3 - prevale;
  }
  return 0;
}

/** Distanza in pixel dall'inchiostro dei canali. Include il loro bordo scuro. */
function bordiCanali(colori: Uint8Array, w: number, h: number, area: AreaTavola) {
  const distanza = new Uint8Array(colori.length);
  const inizio = Math.ceil(area.y * h);
  const fine = Math.floor((area.y + area.altezza) * h);
  distanza.fill(255);
  for (let y = inizio; y < fine; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      distanza[i] = colori[i] ? 0 : Math.min(255, x ? distanza[i - 1] + 1 : 255, y > inizio ? distanza[i - w] + 1 : 255);
    }
  }
  const margine = Math.max(2, Math.round(w * 0.003));
  const esclusi = new Uint8Array(colori.length);
  for (let y = fine - 1; y >= inizio; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      distanza[i] = Math.min(distanza[i], x < w - 1 ? distanza[i + 1] + 1 : 255, y < fine - 1 ? distanza[i + w] + 1 : 255);
      esclusi[i] = distanza[i] <= margine ? 1 : 0;
    }
  }
  return esclusi;
}

function ritaglioComposito(scuro: Uint8Array, w: number, h: number): AreaTavola | null {
  if (w / h < 1.2) return null;
  const sx = Math.round(w * 0.018);
  const dx = Math.round(w * 0.97);
  const alto = Math.round(h * 0.025);
  const fondo = Math.round(h * 0.978);
  const somme = new Uint32Array(w + 1);
  const da = Math.round(h * 0.25);
  const a = Math.round(h * 0.89);
  for (let x = sx; x < dx; x++) {
    let n = 0;
    for (let y = da; y < a; y++) n += scuro[y * w + x];
    somme[x + 1] = somme[x] + n;
  }
  const densita = (daX: number, aX: number) => (somme[aX] - somme[daX]) / ((aX - daX) * (a - da));
  const raggio = Math.max(2, Math.round(w * 0.004));
  const minimo = Math.round(w * 0.026);
  const fascia = Math.round(w * 0.15);
  const candidati: { inizio: number; fine: number; punteggio: number }[] = [];
  let inizio = -1;
  for (let x = Math.round(w * 0.57); x <= Math.round(w * 0.79); x++) {
    if (x < Math.round(w * 0.79) && densita(x - raggio, x + raggio) < 0.009) {
      if (inizio < 0) inizio = x;
      continue;
    }
    if (inizio >= 0 && x - inizio >= minimo) {
      const aSinistra = densita(inizio - fascia, inizio);
      const aDestra = densita(x, x + fascia);
      if (aSinistra > 0.018 && aDestra > 0.045) candidati.push({ inizio, fine: x, punteggio: (x - inizio) * Math.min(aSinistra, aDestra) });
    }
    inizio = -1;
  }
  const migliore = candidati.sort((p, q) => q.punteggio - p.punteggio)[0];
  if (!migliore) return null;
  const taglio = migliore.inizio + Math.round(w * 0.003);
  // Anche i riquadri in alto e in basso devono contenere grafica. Una sola nota laterale non basta.
  for (const [frazioneSu, frazioneGiu] of [[0.10, 0.34], [0.40, 0.63], [0.66, 0.92]]) {
    let marcati = 0;
    const su = Math.floor(h * frazioneSu);
    const giu = Math.floor(h * frazioneGiu);
    for (let y = su; y < giu; y++) {
      for (let x = migliore.fine; x < dx; x++) marcati += scuro[y * w + x];
    }
    if (marcati < (giu - su) * (dx - migliore.fine) * 0.022) return null;
  }
  return { x: sx / w, y: alto / h, larghezza: (taglio - sx) / w, altezza: (fondo - alto) / h };
}

export function aperturaCopertaDaiCanali(zona: AreaTavola, tavola: Extract<TavolaTecnica, { tipo: "hvac" }>) {
  const { segniEsclusi, raster: { larghezza, altezza } } = tavola;
  if (!segniEsclusi) return false;
  const x0 = Math.floor(zona.x * larghezza);
  const x1 = Math.min(larghezza, Math.ceil((zona.x + zona.larghezza) * larghezza));
  const y0 = Math.floor(zona.y * altezza);
  const y1 = Math.min(altezza, Math.ceil((zona.y + zona.altezza) * altezza));
  const limite = (x1 - x0) * (y1 - y0) * 0.1;
  let coperti = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      coperti += segniEsclusi[y * larghezza + x];
      if (coperti > limite) return true;
    }
  }
  return false;
}

export function analizzaRasterTavola(data: Uint8ClampedArray, larghezza: number, altezza: number, righe: readonly PlanText[], soloGrafica = false): TavolaTecnica {
  const pixel = new Uint8Array(larghezza * altezza);
  const raster = { larghezza, altezza, pixel };
  for (let i = 0; i < pixel.length; i++) {
    const j = i * 4;
    pixel[i] = data[j] * 0.2126 + data[j + 1] * 0.7152 + data[j + 2] * 0.0722 < 183 ? 1 : 0;
  }
  if (soloGrafica || Math.min(larghezza, altezza) < 160) return { tipo: "ordinaria", raster };
  const w = larghezza;
  const h = altezza;
  const colori = new Uint8Array(pixel.length);
  const scuro = new Uint8Array(pixel.length);
  const righeColori = new Uint32Array(h);
  const righeScure = new Uint32Array(h);
  const massimi = [0, 0, 0];
  const quanti = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    const inPianta = y > h * 0.09 && y < h * 0.79;
    const perRiga = [0, 0, 0];
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const j = i * 4;
      const r = data[j];
      const g = data[j + 1];
      const b = data[j + 2];
      const colore = coloreRete(r, g, b);
      colori[i] = colore;
      scuro[i] = Math.max(r, g, b) < 168 ? 1 : 0;
      if (inPianta && x > w * 0.06 && x < w * 0.98) perRiga[colore]++;
      if (colore) righeColori[y]++;
      if (!colore && Math.max(r, g, b) < 118) righeScure[y]++;
    }
    for (const codice of [1, 2]) {
      quanti[codice] += perRiga[codice];
      massimi[codice] = Math.max(massimi[codice], perRiga[codice]);
    }
  }
  const haReti = w > h && Math.max(massimi[1], massimi[2]) > w * 0.15 && Math.min(massimi[1], massimi[2]) > w * 0.08
    && Math.min(quanti[1], quanti[2]) > pixel.length * 0.005;
  const riconosciuta = dicitureHvac(righe);
  if (haReti || riconosciuta) {
    const area = haReti ? limitiImpianto(righeColori, righeScure, w, h) : { x: 0, y: 0, larghezza: 1, altezza: 1 };
    const codiceMandata = haReti ? codiceInLegenda(righe, colori, w, h, area) : 0;
    const segniEsclusi = haReti ? bordiCanali(colori, w, h, area) : null;
    if (segniEsclusi) {
      for (let y = 0; y < h; y++) {
        if (y < Math.ceil(area.y * h) || y >= Math.floor((area.y + area.altezza) * h)) pixel.fill(0, y * w, (y + 1) * w);
        else for (let x = 0; x < w; x++) if (segniEsclusi[y * w + x]) pixel[y * w + x] = 0;
      }
    }
    return { tipo: "hvac", area, raster, colori: haReti ? colori : null, segniEsclusi, codiceMandata, dati: leggiDatiHvac(righe, area) };
  }
  const area = ritaglioComposito(scuro, w, h);
  return area ? { tipo: "composita", raster, area } : { tipo: "ordinaria", raster };
}
