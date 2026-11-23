import { aggiungiApertura, chiudiStanze, modificaApertura } from "@/components/planimetrie/editor/comandi";
import { ALTEZZA_PIANO, SPESSORE_TRAMEZZO, contornoInterno, type Pianta, type Punto } from "@/components/planimetrie/editor/adattatore";
import { dist, proiettaSuMuro } from "@/components/planimetrie/editor/geometria";
import { leggiMisura } from "@/components/planimetrie/editor/misure";
import { areaPoligono, puntoNelPoligono, ricostruisciLocali } from "../../../shared/planimetrie/geometria.ts";
import type { ElementoLetturaTavola, TrattoTavola } from "../../../shared/planimetrie/letturaAssistita.ts";
import type { LetturaDocumento, VerificaLettura, ZonaFotoDocumento } from "../../../shared/planimetrie/letturaTipi.ts";
import type { Muro as MuroModello } from "../../../shared/planimetrie/modello.ts";
import { destinazioneDa } from "../../../supabase/functions/planimetria-genera/rispostaAI.ts";
import type { PlanText } from "../preventivi/planReading";
import { leggiImmagineTavola } from "./letturaAssistita";

type Asse = { verticale: boolean; asse: number; inizio: number; fine: number };
type MuroSchizzo = Asse & { id: string; tipo: "esterno" | "tramezzo" };
type QuotaScritta = { cm: number; zona: ZonaFotoDocumento };
type StanzaSchizzo = { nome: string; punti: Punto[]; larghezza?: QuotaScritta; profondita?: QuotaScritta };
type AperturaSchizzo = Asse & {
  muroId: string;
  tipo: "porta" | "finestra" | "varco";
  zona: ZonaFotoDocumento;
  scritto?: QuotaScritta;
  discordante?: boolean;
};

export interface ScalaSchizzo {
  id: string;
  nome: string;
  da: Punto;
  a: Punto;
  /** Spessore convenzionale da togliere all’ingombro o aggiungere alla luce interna, in cm. */
  correzioneCm: number;
  scritto?: QuotaScritta;
}

export interface LetturaSchizzo {
  larghezza: number;
  altezza: number;
  rilievoLetto: boolean;
  muri: MuroSchizzo[];
  stanze: StanzaSchizzo[];
  aperture: AperturaSchizzo[];
  riferimenti: ScalaSchizzo[];
  nonRicostruiti?: string[];
  altreVerifiche: Array<Omit<VerificaLettura, "id">>;
}

const NUMERO = String.raw`\d{1,4}(?:[.,]\d{1,3})?`;
const QUOTA_DOPPIA = new RegExp(String.raw`(${NUMERO})\s*(mm|cm|m)?\s*[x×]\s*(${NUMERO})\s*(mm|cm|m)?\s*$`, "i");
const SIGLA_VANO = new RegExp(String.raw`^(porta|p|finestra|f)\.?\s*[:=]?\s*(?:${NUMERO})?\s*(mm|cm|m)?\s*$`, "i");
const CODICE_VANO = /^(?:p|f)\.?\d{1,3}$/i;
const QUOTA_SINGOLA = new RegExp(String.raw`^${NUMERO}\s*(mm|cm|m)?$`, "i");
const lunghezza = (s: Asse) => s.fine - s.inizio;
const punto = (s: Asse, lungo: number): Punto => s.verticale ? { x: s.asse, y: lungo } : { x: lungo, y: s.asse };
const arrotonda = (n: number) => Math.round(n * 100) / 100;
const formato = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const metri = (cm: number) => formato.format(cm / 100) + " m";
const vicino = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const contenimento = (a: Asse, b: Asse) => Math.min(a.fine, b.fine) - Math.max(a.inizio, b.inizio);

function limiti(punti: Punto[]) {
  return {
    x0: Math.min(...punti.map(p => p.x)), x1: Math.max(...punti.map(p => p.x)),
    y0: Math.min(...punti.map(p => p.y)), y1: Math.max(...punti.map(p => p.y)),
  };
}

function dalTratto(t: TrattoTavola, w: number, h: number): Asse {
  const verticale = Math.abs(t.a.y - t.da.y) * h > Math.abs(t.a.x - t.da.x) * w;
  const a = verticale ? t.da.y * h : t.da.x * w;
  const b = verticale ? t.a.y * h : t.a.x * w;
  return {
    verticale, asse: verticale ? (t.da.x + t.a.x) * w / 2 : (t.da.y + t.a.y) * h / 2,
    inizio: Math.min(a, b), fine: Math.max(a, b),
  };
}

function rettangoloFoto(a: Punto, b: Punto, w: number, h: number, margine = 6): ZonaFotoDocumento {
  const x0 = Math.max(0, Math.min(a.x, b.x) - margine);
  const y0 = Math.max(0, Math.min(a.y, b.y) - margine);
  return {
    x: x0 / w, y: y0 / h,
    larghezza: (Math.min(w, Math.max(a.x, b.x) + margine) - x0) / w,
    altezza: (Math.min(h, Math.max(a.y, b.y) + margine) - y0) / h,
  };
}

function zonaTesto(r: PlanText, w: number, h: number) {
  const [x, y, larghezza, altezza] = r.bbox;
  return rettangoloFoto({ x: x * w, y: y * h }, { x: (x + larghezza) * w, y: (y + altezza) * h }, w, h, 3);
}

function centroTesto(r: PlanText, w: number, h: number): Punto {
  const [x, y, larghezza, altezza] = r.bbox;
  return { x: (x + larghezza / 2) * w, y: (y + altezza / 2) * h };
}

function unisciMuri(tratti: Asse[], tol: number, gapMassimo: number) {
  const assi: Array<{ verticale: boolean; asse: number; tratti: Asse[] }> = [];
  for (const tratto of tratti.sort((a, b) => lunghezza(b) - lunghezza(a))) {
    const asse = assi.find(a => a.verticale === tratto.verticale && vicino(a.asse, tratto.asse, tol));
    if (asse) asse.tratti.push(tratto);
    else assi.push({ verticale: tratto.verticale, asse: tratto.asse, tratti: [tratto] });
  }
  const muri: MuroSchizzo[] = [];
  const interruzioni: Array<Asse & { muroId: string }> = [];
  for (const asse of assi) {
    let corrente: MuroSchizzo | undefined;
    for (const t of asse.tratti.sort((a, b) => a.inizio - b.inizio)) {
      if (corrente && t.inizio - corrente.fine <= gapMassimo) {
        // Unisco solo tratti allineati. Un buco significativo resta candidato da verificare.
        if (t.inizio - corrente.fine >= tol * 2.4) {
          interruzioni.push({ muroId: corrente.id, verticale: asse.verticale, asse: asse.asse, inizio: corrente.fine, fine: t.inizio });
        }
        corrente.fine = Math.max(corrente.fine, t.fine);
      } else {
        corrente = { id: "asse-" + (muri.length + 1), verticale: asse.verticale, asse: asse.asse, inizio: t.inizio, fine: t.fine, tipo: "tramezzo" };
        muri.push(corrente);
      }
    }
  }
  return { muri, interruzioni };
}

function raccordaMuri(muri: MuroSchizzo[], tolleranza: number) {
  for (const a of muri) {
    for (const b of muri) {
      if (a.verticale === b.verticale || a.asse < b.inizio - tolleranza || a.asse > b.fine + tolleranza) continue;
      if (vicino(a.inizio, b.asse, tolleranza)) a.inizio = b.asse;
      if (vicino(a.fine, b.asse, tolleranza)) a.fine = b.asse;
    }
  }
}

function quoteNelloSchizzo(candidati: PlanText[], w: number, h: number) {
  for (const r of [...candidati].sort((a, b) => b.confidence - a.confidence)) {
    const coppia = QUOTA_DOPPIA.exec(r.text.trim());
    if (!coppia) continue;
    const [, a, ua, b, ub] = coppia;
    const orizzontale = leggiMisura(a + (ua ?? ub ?? ""));
    const verticale = leggiMisura(b + (ub ?? ua ?? ""));
    if (!orizzontale || !verticale || Math.min(orizzontale, verticale) < 50 || Math.max(orizzontale, verticale) > 10000) continue;
    const zona = zonaTesto(r, w, h);
    return { larghezza: { cm: orizzontale, zona }, profondita: { cm: verticale, zona } };
  }
  return {};
}

/** Analizza soltanto la geometria che chiude ambienti, così scritte e linee di quota
 * isolate non diventano muri modificabili. Le interruzioni restano ipotesi di vano. */
export function interpretazioneSchizzo({ elementi, righe, larghezza: w, altezza: h, etichetteLette }: Awaited<ReturnType<typeof leggiImmagineTavola>>): LetturaSchizzo {
  const misuraImmagine = Math.max(w, h);
  const tol = Math.max(3, misuraImmagine * .006);
  const tratti = elementi.filter(e => e.tipo === "muro" && e.tratto)
    .map(e => dalTratto(e.tratto!, w, h)).filter(t => lunghezza(t) >= misuraImmagine * .041);
  const { muri, interruzioni } = unisciMuri(tratti, tol, misuraImmagine * .134);
  raccordaMuri(muri, tol * 1.6);
  const assi = muri.map(m => ({
    id: m.id, p1: punto(m, m.inizio), p2: punto(m, m.fine), spessore: 2,
    altezza: ALTEZZA_PIANO, stato: "esistente", origine: "stimata", tipo: "tramezzo",
  } satisfies MuroModello));
  const facce = ricostruisciLocali(assi).filter(s => areaPoligono(s.contorno) >= w * h * .008);
  if (!facce.length) throw new Error("Non trovo un perimetro chiuso. Raddrizza la foto se il foglio è inclinato, ritaglia un solo piano o ricalca i muri mancanti.");
  const usati = new Set(facce.flatMap(f => f.muriIds));
  const chiusi = muri.filter(m => usati.has(m.id)).map(m => {
    const alCentro = punto(m, (m.inizio + m.fine) / 2);
    const lati = [-4, 4].map(d => m.verticale ? { ...alCentro, x: alCentro.x + d } : { ...alCentro, y: alCentro.y + d });
    const interno = lati.every(p => facce.some(f => puntoNelPoligono(p, f.contorno)));
    return { ...m, tipo: interno ? "tramezzo" as const : "esterno" as const };
  });
  const testo = righe.filter(r => r.confidence >= .34);
  const etichette = elementi.filter(e => e.tipo === "locale" && !!e.nome);
  const collegate = new Set<string>();
  const stanze = facce.map((f, i) => {
    const etichetta = etichette.find(e => !collegate.has(e.id) && puntoNelPoligono({
      x: (e.zona.x + e.zona.larghezza / 2) * w, y: (e.zona.y + e.zona.altezza / 2) * h,
    }, f.contorno));
    const nome = etichetta?.nome?.replace(QUOTA_DOPPIA, "").trim();
    if (etichetta) collegate.add(etichetta.id);
    const scritto = nome ? nome.charAt(0).toLocaleUpperCase("it") + nome.slice(1).toLocaleLowerCase("it") : "";
    const interno = testo.filter(r => puntoNelPoligono(centroTesto(r, w, h), f.contorno));
    return { nome: scritto || "Locale " + (i + 1), punti: f.contorno, ...quoteNelloSchizzo(interno, w, h) };
  });

  const simboli = elementi.filter((e): e is ElementoLetturaTavola & { tipo: "porta" | "finestra"; tratto: TrattoTavola } =>
    (e.tipo === "porta" || e.tipo === "finestra") && !!e.tratto).map(e => ({ ...dalTratto(e.tratto, w, h), tipo: e.tipo, zona: e.zona }));
  const aperture: AperturaSchizzo[] = [];
  const scritteUsate = new Set<PlanText>();
  // Fessure e simboli devono ricadere su un asse che fa parte della pianta.
  for (const vano of [...interruzioni, ...simboli]) {
    const muro = chiusi.filter(m => m.verticale === vano.verticale && vicino(m.asse, vano.asse, tol)
      && vano.inizio >= m.inizio - tol && vano.fine <= m.fine + tol)
      .sort((a, b) => Math.abs(a.asse - vano.asse) - Math.abs(b.asse - vano.asse))[0];
    if (!muro || ("muroId" in vano && vano.muroId !== muro.id)
      || lunghezza(vano) < misuraImmagine * .019 || lunghezza(vano) > misuraImmagine * .14) continue;
    if (aperture.some(a => a.muroId === muro.id && contenimento(a, vano) > .55 * Math.min(lunghezza(a), lunghezza(vano)))) continue;
    const compatibili = simboli.filter(s => s.verticale === vano.verticale && vicino(s.asse, vano.asse, tol)
      && contenimento(s, vano) > .62 * Math.min(lunghezza(s), lunghezza(vano)));
    const centro = punto(vano, (vano.inizio + vano.fine) / 2);
    const nota = testo.flatMap(r => {
      const sigla = SIGLA_VANO.exec(r.text.trim());
      if (!sigla || scritteUsate.has(r)) return [];
      const p = centroTesto(r, w, h);
      const lungo = vano.verticale ? p.y : p.x;
      const fascia = Math.max(14, lunghezza(vano) * .28);
      if (lungo < vano.inizio - fascia || lungo > vano.fine + fascia || dist(centro, p) > misuraImmagine * .108) return [];
      return [{ r, p, tipo: sigla[1].toLowerCase().startsWith("p") ? "porta" as const : "finestra" as const }];
    }).sort((a, b) => dist(a.p, centro) - dist(b.p, centro))[0];
    if (nota) scritteUsate.add(nota.r);
    const segni = new Set(compatibili.map(s => s.tipo));
    if (nota) segni.add(nota.tipo);
    const tipo = segni.size === 1 ? [...segni][0] : "varco";
    const etichettaVano = nota?.r.text.trim() ?? "";
    const misuraVano = etichettaVano.replace(/^(porta|p|finestra|f)\.?\s*[:=]?\s*/i, "");
    const numeroDaLegenda = /^\d{1,2}$/.test(misuraVano) && Number(misuraVano) < 35;
    const letta = CODICE_VANO.test(etichettaVano) || numeroDaLegenda ? null : leggiMisura(misuraVano);
    aperture.push({
      ...vano, muroId: muro.id, tipo, discordante: segni.size > 1,
      zona: compatibili[0]?.zona ?? rettangoloFoto(punto(vano, vano.inizio), punto(vano, vano.fine), w, h, 10),
      ...(letta && letta >= 35 && letta <= 450 && nota ? { scritto: { cm: letta, zona: zonaTesto(nota.r, w, h) } } : {}),
    });
  }
  const b = limiti(chiusi.flatMap(m => [punto(m, m.inizio), punto(m, m.fine)]));
  const riferimenti: ScalaSchizzo[] = [{
    id: "ingombro-x", nome: "Ingombro esterno orizzontale", correzioneCm: -SPESSORE_TRAMEZZO,
    da: { x: b.x0, y: b.y0 }, a: { x: b.x1, y: b.y0 },
  }];
  for (const [i, s] of stanze.entries()) {
    const r = limiti(s.punti);
    // Le campiture di topologia sono arretrate di 1 px rispetto all’asse.
    riferimenti.push({
      id: "larghezza-" + i, nome: s.nome + " · larghezza interna", scritto: s.larghezza, correzioneCm: SPESSORE_TRAMEZZO,
      da: { x: r.x0 - 1, y: (r.y0 + r.y1) / 2 }, a: { x: r.x1 + 1, y: (r.y0 + r.y1) / 2 },
    }, {
      id: "profondita-" + i, nome: s.nome + " · profondità interna", scritto: s.profondita, correzioneCm: SPESSORE_TRAMEZZO,
      da: { x: (r.x0 + r.x1) / 2, y: r.y0 - 1 }, a: { x: (r.x0 + r.x1) / 2, y: r.y1 + 1 },
    });
  }
  const senzaContorno = etichette.filter(e => !collegate.has(e.id));
  const altreVerifiche: LetturaSchizzo["altreVerifiche"] = [
    ...senzaContorno.slice(0, 12).map(e => ({
      tipo: "geometria" as const,
      descrizione: `Il nome «${e.nome}» è leggibile. Traccia o verifica il contorno corrispondente.`,
      zoneFoto: [e.zona],
    })),
    ...muri.filter(m => !usati.has(m.id) && lunghezza(m) >= misuraImmagine * .08).slice(0, 8).map(m => ({
      tipo: "geometria" as const,
      descrizione: "Tratto fuori dai contorni ricostruiti. Controlla se è un muro di un ambiente rimasto aperto oppure un segno di quota.",
      zoneFoto: [rettangoloFoto(punto(m, m.inizio), punto(m, m.fine), w, h)],
    })),
    ...testo.filter(r => !scritteUsate.has(r) && SIGLA_VANO.test(r.text.trim())).slice(0, 12).map(r => ({
      tipo: "aperture" as const, descrizione: "Sigla «" + r.text.trim() + "» da collegare a un vano sul disegno.",
      zoneFoto: [zonaTesto(r, w, h)],
    })),
    ...testo.filter(r => r.confidence >= .5 && QUOTA_SINGOLA.test(r.text.trim())).slice(0, 12).map(r => ({
      tipo: "nota" as const, descrizione: "Misura «" + r.text.trim() + "» senza estremi riconosciuti. Controlla a quale tratto si riferisce.",
      zoneFoto: [zonaTesto(r, w, h)],
    })),
  ];
  return { larghezza: w, altezza: h, rilievoLetto: etichetteLette, muri: chiusi, stanze, aperture, riferimenti, altreVerifiche,
    nonRicostruiti: senzaContorno.map(e => e.nome!) };
}

export async function leggiSchizzo(file: File, signal: AbortSignal) {
  return interpretazioneSchizzo(await leggiImmagineTavola(file, signal, true));
}

const asseQuota = (r: ScalaSchizzo) => Math.abs(r.a.x - r.da.x) >= Math.abs(r.a.y - r.da.y) ? "x" : "y";
const fattoreQuota = (r: ScalaSchizzo, cm: number) => (cm + r.correzioneCm) / dist(r.da, r.a);

/**
 * La quota scelta fissa un asse. Per calibrare l'altro occorrono almeno due scritte
 * concordanti e una maggioranza univoca. Sullo stesso asse le altre scritte sono
 * riscontri, così una correzione digitata dall'utente mantiene sempre la precedenza.
 */
export function calibraScalaSchizzo(riferimenti: ScalaSchizzo[], riferimento: ScalaSchizzo, cm: number, piuQuote: boolean) {
  const fattore = fattoreQuota(riferimento, cm);
  const asse = asseQuota(riferimento);
  const scala = { x: fattore, y: fattore };
  let calibrate = [riferimento];
  if (piuQuote) {
    const altroAsse = asse === "x" ? "y" : "x";
    const candidati = riferimenti.flatMap(r => {
      if (!r.scritto || asseQuota(r) !== altroAsse) return [];
      const valore = fattoreQuota(r, r.scritto.cm);
      return Number.isFinite(valore) && valore >= fattore * .65 && valore <= fattore * 1.55 ? [{ r, valore }] : [];
    }).sort((a, b) => a.valore - b.valore);
    const gruppi = candidati.map((r, i) => candidati.slice(i).filter(c => c.valore <= r.valore * 1.05));
    const gruppo = gruppi.reduce<(typeof candidati)>((a, b) => b.length > a.length ? b : a, []);
    if (gruppo.length >= 2 && gruppo.length * 2 > candidati.length && gruppi.filter(g => g.length === gruppo.length).length === 1) {
      const centro = Math.floor(gruppo.length / 2);
      const mediana = (gruppo[centro].valore + gruppo[Math.floor((gruppo.length - 1) / 2)].valore) / 2;
      const concordanti = gruppo.filter(({ r }) =>
        esitoQuota(r.scritto!.cm, mediana * dist(r.da, r.a) - r.correzioneCm) === "compatibile");
      if (concordanti.length >= 2 && concordanti.length * 2 > candidati.length) {
        scala[altroAsse] = mediana;
        calibrate = [riferimento, ...concordanti.map(c => c.r)];
      }
    }
  }
  return { ...scala, calibrate };
}

function esitoQuota(scrittoCm: number | undefined, misuraCm: number): NonNullable<VerificaLettura["esitoQuota"]> {
  if (scrittoCm === undefined) return "senza_quota";
  return Math.abs(scrittoCm - misuraCm) <= Math.max(3, scrittoCm * .02) ? "compatibile" : "discordante";
}

const esitoTesto = { compatibile: "compatibile", discordante: "discordante", senza_quota: "da verificare" } as const;

export function generaDaSchizzo(base: Pianta, rilievo: LetturaSchizzo, riferimento: ScalaSchizzo, cm: number, livelloId: string, piuQuote = false) {
  if (!Number.isFinite(cm) || cm < 50 || cm > 30000) throw new Error("Inserisci una misura reale tra 0,50 e 300 m.");
  const scala = calibraScalaSchizzo(rilievo.riferimenti, riferimento, cm, piuQuote);
  const larghezzaCm = scala.x * rilievo.larghezza, altezzaCm = scala.y * rilievo.altezza;
  if (![larghezzaCm, altezzaCm].every(n => Number.isFinite(n) && n > 0 && n <= 100000)) throw new Error("La misura non permette di impostare la scala del disegno.");
  const idLettura = "sk-" + crypto.randomUUID();
  const cmDa = (p: Punto) => ({ x: arrotonda(p.x * scala.x), y: arrotonda(p.y * scala.y) });
  const pixelDa = (p: Punto) => ({ x: p.x / scala.x, y: p.y / scala.y });
  const muri: Pianta["muri"] = rilievo.muri.map(m => ({
    id: idLettura + "-" + m.id, p1: cmDa(punto(m, m.inizio)), p2: cmDa(punto(m, m.fine)),
    spessore: SPESSORE_TRAMEZZO, altezza: ALTEZZA_PIANO, tipo: m.tipo, stato: "esistente", origine: "stimata",
  }));
  if (muri.some(m => dist(m.p1, m.p2) < 5)) throw new Error("Con questa scala alcuni tratti risultano troppo corti. Ricontrolla la misura di riferimento.");
  const conMuri: Pianta = { ...base, muri };
  const piantaLocali = chiudiStanze(conMuri);
  if (!piantaLocali.locali.length) throw new Error("Con questa scala i muri non racchiudono un locale utilizzabile. Controlla la misura di riferimento.");
  const verifiche: VerificaLettura[] = [{
    id: idLettura + "-scala", tipo: "nota",
    descrizione: scala.calibrate.length > 1
      ? "Scala sui due assi · " + riferimento.nome + " a " + metri(cm) + ", con " + (scala.calibrate.length - 1) + " quote concordanti sull’altro asse."
      : "Scala da un riferimento · " + riferimento.nome + " a " + metri(cm) + ". Conferma gli estremi sul rilievo. Le altre proporzioni vanno controllate.",
    valoriLettiCm: [cm, ...scala.calibrate.slice(1, 8).map(r => r.scritto!.cm)],
    zoneFoto: scala.calibrate.slice(0, 8).map(r => r.scritto?.zona ?? rettangoloFoto(r.da, r.a, rilievo.larghezza, rilievo.altezza)),
  }];
  const locali = piantaLocali.locali.map((l, i) => {
    const interno = contornoInterno(piantaLocali, l);
    const s = rilievo.stanze.find(s => interno.filter(p => puntoNelPoligono(pixelDa(p), s.punti)).length > interno.length / 2);
    const nome = s?.nome ?? "Locale " + (i + 1);
    const r = limiti(interno);
    const zona = rettangoloFoto(pixelDa({ x: r.x0, y: r.y0 }), pixelDa({ x: r.x1, y: r.y1 }), rilievo.larghezza, rilievo.altezza, 1);
    for (const campo of ["larghezza", "profondita"] as const) {
      const quota = s?.[campo];
      const misura = campo === "larghezza" ? r.x1 - r.x0 : r.y1 - r.y0;
      const confronto = esitoQuota(quota?.cm, misura);
      const lato = campo === "larghezza" ? "larghezza" : "profondità";
      const rettangolare = Math.abs(areaPoligono(interno) - (r.x1 - r.x0) * (r.y1 - r.y0)) < 5;
      verifiche.push({
        id: idLettura + "-q" + i + campo, tipo: "quota", esitoQuota: confronto,
        descrizione: nome + " · " + lato + " " + esitoTesto[confronto] + ". "
          + (quota ? "Sullo schizzo " + metri(quota.cm) + ", nella bozza " + metri(misura) + " (scarto " + metri(Math.abs(quota.cm - misura)) + ")."
            : "Nella bozza " + metri(misura) + ", quota scritta da cercare."),
        riferimento: { livelloId, tipo: "locale", oggettoId: l.id, campo: rettangolare ? campo : "contorno" },
        ...(quota ? { valoriLettiCm: [quota.cm] } : {}), zoneFoto: [quota?.zona ?? zona],
      });
    }
    return { ...l, nome, destinazione: destinazioneDa(null, nome), origine: "stimata" as const };
  });
  const conLocali = { ...piantaLocali, locali };
  let completa: Pianta = conLocali;
  for (const [i, vano] of rilievo.aperture.entries()) {
    const muro = muri.find(m => m.id === idLettura + "-" + vano.muroId)!;
    const inizio = proiettaSuMuro(cmDa(punto(vano, vano.inizio)), muro).t;
    const fine = proiettaSuMuro(cmDa(punto(vano, vano.fine)), muro).t;
    const larghezza = arrotonda(fine - inizio);
    const nome = vano.tipo === "porta" ? "Porta" : vano.tipo === "finestra" ? "Finestra" : "Vano da identificare";
    const zoneFoto = vano.scritto ? [vano.zona, vano.scritto.zona] : [vano.zona];
    const sovrapposto = completa.aperture.some(a => a.muroId === muro.id && Math.min(fine, a.posizione + a.larghezza / 2) > Math.max(inizio, a.posizione - a.larghezza / 2));
    if (larghezza < 35 || larghezza > 450 || sovrapposto || inizio < 1 || fine > dist(muro.p1, muro.p2) - 1) {
      verifiche.push({ id: idLettura + "-a" + i, tipo: "aperture", descrizione: nome + " · controlla sullo schizzo posizione e luce prima di aggiungere il vano.", zoneFoto });
      continue;
    }
    const esito = aggiungiApertura(completa, muro.id, vano.tipo, (inizio + fine) / 2, { origine: "stimata" });
    if (!esito.id) continue;
    completa = modificaApertura(esito.pianta, esito.id, { larghezza });
    const riferimentoApertura = { livelloId, tipo: "apertura" as const, oggettoId: esito.id };
    const confronto = esitoQuota(vano.scritto?.cm, larghezza);
    verifiche.push({
      id: idLettura + "-a" + i, tipo: "aperture",
      descrizione: nome + " · " + (vano.discordante ? "sigla e simbolo discordanti. Controlla il tipo e la posizione." :
        vano.tipo === "varco" ? "controlla se è una porta, una finestra o una semplice interruzione." :
        vano.tipo === "porta" ? "controlla posizione, altezza e verso di apertura sul foglio." : "controlla posizione, altezza e davanzale sul foglio."),
      riferimento: { ...riferimentoApertura, campo: vano.tipo === "porta" ? "verso" : "posizione" }, zoneFoto,
    }, {
      id: idLettura + "-luce" + i, tipo: "quota", esitoQuota: confronto,
      descrizione: nome + " · luce " + esitoTesto[confronto] + ". Nella bozza "
        + metri(larghezza) + (vano.scritto ? ", sullo schizzo " + metri(vano.scritto.cm) + " (scarto " + metri(Math.abs(vano.scritto.cm - larghezza)) + ")" : "") + ".",
      riferimento: { ...riferimentoApertura, campo: "larghezza" }, ...(vano.scritto ? { valoriLettiCm: [vano.scritto.cm] } : {}), zoneFoto,
    });
  }
  verifiche.push(...rilievo.altreVerifiche.map((v, i) => ({ ...v, id: idLettura + "-nota" + i })));
  const avvisiIniziali = [
    "Le quote compatibili rientrano nello scarto di confronto, 3 cm o 2% se superiore. Conferma sul rilievo le misure e gli spessori prima di usarli.",
    "Altezza iniziale dei locali " + metri(ALTEZZA_PIANO) + " da confrontare con il sopralluogo.",
    ...(!rilievo.rilievoLetto ? ["Scritte non lette. Controlla nomi e quote sullo schizzo."] : []),
  ];
  const letturaDocumento: LetturaDocumento = { protocolloVerifica: 1, avvisiIniziali, superficiScritteMq: {}, verifiche };
  completa = { ...completa, letturaDocumento };
  return { conMuri, conLocali, completa, larghezzaCm, altezzaCm, quoteDiScala: scala.calibrate.length };
}
