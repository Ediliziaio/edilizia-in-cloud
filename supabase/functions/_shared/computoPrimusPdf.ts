/**
 * Lettore deterministico del computo metrico stampato da PriMus (ACCA).
 *
 * Lavora sui pezzi di testo con la loro posizione (come li dà pdfjs), perché
 * le colonne par.ug. / lung. / larg. / H/peso / Quantità si distinguono solo
 * dalla posizione: con il testo semplice «3,00 7,50» non si sa se 3 sono le
 * parti uguali o la lunghezza. Le colonne si leggono dall'intestazione di
 * ogni pagina, quindi un PDF con margini diversi funziona lo stesso.
 *
 * Niente AI: se il PDF non è un PriMus, `eComputoPrimus` dice di no e la edge
 * function passa al lettore AI.
 */
import {
  arrotonda, controllaTotali, eSicurezza, estraiFormule, numeroComputo,
  type ComputoLivello, type ComputoMisura, type ComputoRigaRiepilogo, type ComputoStrutturato, type ComputoVoceStrutturata,
} from "./computoStrutturato.ts";

export interface PdfPezzoTesto { x: number; right?: number; y: number; text: string }
export interface PdfPaginaPosizionata { page: number; items: PdfPezzoTesto[] }

type ColonnaNumero = "parti_uguali" | "lunghezza" | "larghezza" | "altezza_peso" | "quantita" | "prezzo" | "importo";

interface Colonne {
  /** Oltre questa x finisce la colonna «Num.Ord. / TARIFFA». */
  codiceFine: number;
  /** Da questa x in poi un numero è un dato di colonna, non parte del testo. */
  numeriInizio: number;
  destre: Record<ColonnaNumero, number>;
}

interface Riga {
  page: number;
  y: number;
  codici: string[];
  testo: string;
  /** Destra dell'ultimo pezzo di testo descrittivo: serve a capire se la riga va a capo. */
  testoDestra: number;
  numeri: Partial<Record<ColonnaNumero, number>>;
  grezzi: Partial<Record<ColonnaNumero, string>>;
  numeriInOrdine: number[];
  tutto: string;
}

const INTESTAZIONI: Record<string, ColonnaNumero> = {
  "par.ug.": "parti_uguali", "lung.": "lunghezza", "larg.": "larghezza", "h/peso": "altezza_peso",
  "quantità": "quantita", "unitario": "prezzo", "totale": "importo",
};

const destraDi = (p: PdfPezzoTesto) => p.right ?? p.x + p.text.length * 4.4;

function righeDellaPagina(items: PdfPezzoTesto[]): PdfPezzoTesto[][] {
  const pezzi = items.filter(i => i.text.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const righe: PdfPezzoTesto[][] = [];
  let y = Number.NaN;
  for (const p of pezzi) {
    if (!righe.length || Math.abs(p.y - y) > 2) { righe.push([p]); y = p.y; }
    else righe[righe.length - 1].push(p);
  }
  return righe.map(r => r.sort((a, b) => a.x - b.x));
}

function colonneDaIntestazione(righe: PdfPezzoTesto[][]): { colonne: Colonne; fineIntestazione: number } | null {
  let numOrd: PdfPezzoTesto | undefined;
  const destre: Partial<Record<ColonnaNumero, number>> = {};
  let parug: PdfPezzoTesto | undefined;
  let yMin = Infinity;
  for (const riga of righe.slice(0, 15)) {
    for (const p of riga) {
      const t = p.text.trim().toLowerCase();
      if (t === "num.ord.") { numOrd = p; yMin = Math.min(yMin, p.y); }
      const col = INTESTAZIONI[t];
      if (col && destre[col] === undefined) { destre[col] = destraDi(p); yMin = Math.min(yMin, p.y); if (col === "parti_uguali") parug = p; }
    }
  }
  const tutte = Object.keys(INTESTAZIONI).every(k => destre[INTESTAZIONI[k]] !== undefined);
  if (!numOrd || !parug || !tutte) return null;
  return {
    colonne: { codiceFine: destraDi(numOrd) + 4, numeriInizio: parug.x - 15, destre: destre as Record<ColonnaNumero, number> },
    fineIntestazione: yMin - 1,
  };
}

function colonnaPiuVicina(colonne: Colonne, destra: number): ColonnaNumero {
  let best: ColonnaNumero = "quantita"; let dist = Infinity;
  for (const [col, x] of Object.entries(colonne.destre) as Array<[ColonnaNumero, number]>) {
    const d = Math.abs(destra - x);
    if (d < dist) { dist = d; best = col; }
  }
  return best;
}

function costruisciRiga(page: number, pezzi: PdfPezzoTesto[], colonne: Colonne): Riga {
  const codici: string[] = []; const testo: string[] = [];
  const numeri: Partial<Record<ColonnaNumero, number>> = {}; const numeriInOrdine: number[] = [];
  const grezzi: Partial<Record<ColonnaNumero, string>> = {};
  let testoDestra = 0;
  for (const p of pezzi) {
    const t = p.text.replace(/\s+/g, " ").trim();
    if (p.x < colonne.codiceFine) {
      // Un pezzo nato nella colonna dei codici che sconfina nella descrizione:
      // «DSR526091d pulsante, valvola…» = codice + testo.
      if (destraDi(p) > colonne.codiceFine + 8 && t.includes(" ")) {
        const sp = t.indexOf(" ");
        codici.push(t.slice(0, sp)); testo.push(t.slice(sp + 1)); testoDestra = Math.max(testoDestra, destraDi(p));
      } else codici.push(t);
      continue;
    }
    const n = p.x >= colonne.numeriInizio ? numeroComputo(t) : null;
    if (n !== null) {
      const col = colonnaPiuVicina(colonne, destraDi(p));
      numeri[col] = n; grezzi[col] = t; numeriInOrdine.push(n);
      continue;
    }
    testo.push(t); testoDestra = Math.max(testoDestra, destraDi(p));
  }
  return {
    page, y: pezzi[0]?.y ?? 0, codici, testo: testo.join(" ").replace(/\s+/g, " ").trim(), testoDestra,
    numeri, grezzi, numeriInOrdine, tutto: pezzi.map(p => p.text.trim()).join(" ").replace(/\s+/g, " ").trim(),
  };
}

const compatto = (s: string) => s.replace(/\s+/g, "").toUpperCase();
const RE_LIVELLO = /^(.+?)\s*\((SpCat|Cat|SbCat)\s*(\d+)\)$/i;
const PAROLE_INTESTAZIONE = new Set(["IMPORTI", "NUM.ORD.", "INCID.", "DESIGNAZIONEDEILAVORI", "TARIFFA", "%", "TOTALE", "QUANTITÀ", "DIMENSIONI", "UNITARIO", "PAR.UG.", "LUNG.", "LARG.", "H/PESO"]);
const RE_SEZIONE =/^LAVORI\s+(A MISURA|A CORPO|IN ECONOMIA)$/i;

/** Il PDF è un computo PriMus? Serve l'intestazione delle colonne e almeno un «SOMMANO». */
export function eComputoPrimus(pagine: PdfPaginaPosizionata[]): boolean {
  let intestazione = false; let sommano = false;
  for (const p of pagine) {
    const righe = righeDellaPagina(p.items);
    if (!intestazione && colonneDaIntestazione(righe)) intestazione = true;
    if (!sommano && p.items.some(i => /^(SOMMANO|SI DETRAGGONO)\b/.test(i.text.trim()))) sommano = true;
    if (intestazione && sommano) return true;
  }
  return false;
}

function nuovaVoce(numero: string, page: number, stato: StatoGerarchia): VoceInCorso {
  return {
    voce: {
      numero_ordine: numero, codici: [], codice_tariffa: "", descrizione: "", descrizione_troncata: false,
      unita_misura: "", quantita: null, prezzo_unitario: null, importo: null,
      sezione: stato.sezione, super_categoria: stato.sp, categoria: stato.cat, sotto_categoria: stato.sb,
      is_sicurezza: eSicurezza(stato.sp?.nome, stato.cat?.nome, stato.sb?.nome),
      is_detrazione: false, a_corpo: /corpo/i.test(stato.sezione ?? ""), misure: [], pagina: page, avvisi: [],
    },
    descrizione: [], descrizioneAperta: true, ultimaRigaPiena: true, testoMisura: [], chiusa: false, rigaMisuraPrecedente: null,
  };
}

interface StatoGerarchia { sezione: string | null; sp: ComputoLivello | null; cat: ComputoLivello | null; sb: ComputoLivello | null }
interface VoceInCorso {
  voce: ComputoVoceStrutturata;
  descrizione: string[];
  descrizioneAperta: boolean;
  ultimaRigaPiena: boolean;
  testoMisura: string[];
  chiusa: boolean;
  rigaMisuraPrecedente: { numeri: Partial<Record<ColonnaNumero, number>>; grezzi: Partial<Record<ColonnaNumero, string>>; testo: string } | null;
}

function misuraDa(testo: string, numeri: Partial<Record<ColonnaNumero, number>>, avvisi: string[]): ComputoMisura {
  const { descrizione, formule } = estraiFormule(testo);
  const m: ComputoMisura = {
    descrizione, parti_uguali: numeri.parti_uguali ?? null, lunghezza: numeri.lunghezza ?? null,
    larghezza: numeri.larghezza ?? null, altezza_peso: numeri.altezza_peso ?? null, quantita: numeri.quantita ?? null,
    formula: formule.length ? formule.map(f => `${f.campo}=${f.espressione}`).join("; ") : null,
  };
  const campi = { "par.ug.": "parti_uguali", "lung.": "lunghezza", "larg.": "larghezza", "h/peso": "altezza_peso" } as const;
  for (const f of formule) {
    const stampato = m[campi[f.campo]];
    if (f.valore === null) avvisi.push(`Formula non leggibile: ${f.campo}=${f.espressione}`);
    else if (stampato !== null && Math.abs(arrotonda(f.valore, 3) - stampato) > Math.max(0.006, Math.abs(stampato) * 0.001)) {
      avvisi.push(`Formula ${f.campo}=${f.espressione} fa ${arrotonda(f.valore, 3)}, stampato ${stampato}.`);
    }
  }
  return m;
}

function chiudiDescrizione(v: VoceInCorso) {
  if (!v.descrizione.length) return;
  v.voce.descrizione = v.descrizione.join(" ").replace(/\s+/g, " ").trim();
  v.voce.descrizione_troncata = /\s\.\.\.\s/.test(v.voce.descrizione);
}

function finalizza(v: VoceInCorso): ComputoVoceStrutturata {
  chiudiDescrizione(v);
  if (v.testoMisura.length) {
    // Righe di solo testo alla fine (note, commenti di misura senza numeri).
    v.voce.misure.push(misuraDa(v.testoMisura.join(" "), {}, v.voce.avvisi)); v.testoMisura = [];
  }
  v.voce.codice_tariffa = v.voce.codici.join(" ").trim();
  if (!v.chiusa) v.voce.avvisi.push("Voce senza riga «SOMMANO»: quantità e importo non letti.");
  return v.voce;
}

/**
 * Ricostruisce il computo dalle pagine. Le pagine prima della prima intestazione
 * (copertina) danno solo oggetto, committente e data.
 */
export function leggiComputoPrimus(pagine: PdfPaginaPosizionata[]): ComputoStrutturato {
  const voci: ComputoVoceStrutturata[] = [];
  const riepiloghi: ComputoRigaRiepilogo[] = [];
  const avvisi: string[] = [];
  const metadata: ComputoStrutturato["metadata"] = {};
  const stato: StatoGerarchia = { sezione: null, sp: null, cat: null, sb: null };
  let colonne: Colonne | null = null;
  let corrente: VoceInCorso | null = null;
  let totaleDichiarato: number | null = null;
  let riepilogo: ComputoLivelloRiepilogoInterno | null = null;
  const oggetto: string[] = [];
  let leggoOggetto = false;

  const chiudiCorrente = () => { if (corrente) { voci.push(finalizza(corrente)); corrente = null; } };

  for (const pagina of [...pagine].sort((a, b) => a.page - b.page)) {
    const righePezzi = righeDellaPagina(pagina.items);
    const intest = colonneDaIntestazione(righePezzi);
    if (intest) colonne = intest.colonne;
    const fineIntestazione = intest?.fineIntestazione ?? Infinity;
    for (const pezzi of righePezzi) {
      const tutto = pezzi.map(p => p.text.trim()).join(" ").replace(/\s+/g, " ").trim();
      if (!colonne) {
        // Copertina: oggetto, committente, data.
        const mOgg = /^OGGETTO:\s*(.*)$/i.exec(tutto);
        if (mOgg) { leggoOggetto = true; oggetto.push(mOgg[1]); continue; }
        const mComm = /^COMMITTENTE:\s*(.+)$/i.exec(tutto);
        if (mComm) { leggoOggetto = false; metadata.committente ??= mComm[1].trim(); continue; }
        if (leggoOggetto) oggetto.push(tutto);
        const mData = /,\s*(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(tutto);
        if (mData) metadata.data_computo ??= `${mData[3]}-${mData[2].padStart(2, "0")}-${mData[1].padStart(2, "0")}`;
        continue;
      }
      if (pezzi[0].y >= fineIntestazione) continue;
      if (/^pag\.\s*\d+$/i.test(tutto) || /^PriMus\b/i.test(tutto) || /^-{5,}$/.test(tutto)) continue;
      // Pagine senza la riga delle colonne (i riepiloghi): l'intestazione si riconosce dalle parole.
      if (!intest && pezzi.every(p => PAROLE_INTESTAZIONE.has(compatto(p.text)))) continue;
      const mComm = /^COMMITTENTE:\s*(.+)$/i.exec(tutto);
      if (mComm) { metadata.committente ??= mComm[1].trim(); continue; }
      const c = compatto(tutto);
      if (c === "RIPORTO" || c.startsWith("ARIPORTARE") || c.startsWith("RIPORTO")) continue;

      // ── Riepiloghi finali ──
      const mRiep = /^Riepilogo\s+(.+)$/i.exec(tutto);
      if (mRiep) {
        chiudiCorrente();
        const tipo = mRiep[1].toUpperCase();
        riepilogo = /STRUTTURALE/.test(tipo) ? "strutturale" : /SUPER/.test(tipo) ? "super_categoria" : /SUB/.test(tipo) ? "sotto_categoria" : /CATEGORIE/.test(tipo) ? "categoria" : "altro";
        continue;
      }
      if (riepilogo) {
        const numeri = pezzi.map(p => numeroComputo(p.text)).filter((n): n is number => n !== null);
        if (/^TOTALE\b/i.test(tutto)) { if (numeri.length >= 2) totaleDichiarato ??= numeri[numeri.length - 2]; continue; }
        const mRiga = /^(M|C|E|[A-Z](?=:)|\d{3})((?::\d{3})?(?:\.\d{3})*)\s+(.+)$/.exec(tutto);
        if (riepilogo !== "altro" && mRiga && numeri.length >= 2 && pezzi.length >= 3) {
          const testo = pezzi.slice(1).filter(p => numeroComputo(p.text) === null).map(p => p.text.trim()).join(" ");
          const codice = `${mRiga[1]}${mRiga[2]}`;
          const percorso = riepilogo === "strutturale" ? (mRiga[2] ? mRiga[2].slice(1).split(".").map(Number) : []) : undefined;
          riepiloghi.push({ livello: riepilogo, codice, nome: testo.replace(/\s+euro$/i, "").trim(), importo: numeri[numeri.length - 2], percorso });
        }
        continue;
      }

      const riga = costruisciRiga(pagina.page, pezzi, colonne);

      // ── Totali del corpo ──
      if (/^TOTALEEURO$/.test(compatto(riga.testo))) { totaleDichiarato = riga.numeri.importo ?? riga.numeriInOrdine.at(-1) ?? totaleDichiarato; continue; }
      if (/^Parziale\b/i.test(riga.testo) || /^Sommano\s+(positivi|negativi)\b/i.test(riga.testo)) continue;

      // ── Gerarchia ──
      const mSez = RE_SEZIONE.exec(tutto);
      if (mSez) { chiudiCorrente(); stato.sezione = `LAVORI ${mSez[1].toUpperCase()}`; stato.sp = stato.cat = stato.sb = null; continue; }
      const mLiv = RE_LIVELLO.exec(tutto);
      if (mLiv && !riga.numeriInOrdine.length) {
        chiudiCorrente();
        const liv: ComputoLivello = { numero: Number(mLiv[3]), nome: mLiv[1].trim() };
        const tipo = mLiv[2].toLowerCase();
        if (tipo === "spcat") { stato.sp = liv; stato.cat = null; stato.sb = null; }
        else if (tipo === "cat") { stato.cat = liv; stato.sb = null; }
        else stato.sb = liv;
        continue;
      }

      // ── Chiusura della voce ──
      const mChiude = /^(SOMMANO|SI DETRAGGONO)\b\s*(.*)$/.exec(riga.testo);
      if (mChiude) {
        if (!corrente || corrente.chiusa) { avvisi.push(`Pagina ${riga.page}: «${riga.testo}» senza voce aperta.`); continue; }
        const v: VoceInCorso = corrente;
        v.voce.codici.push(...riga.codici);
        chiudiDescrizione(v);
        if (v.testoMisura.length) { v.voce.misure.push(misuraDa(v.testoMisura.join(" "), {}, v.voce.avvisi)); v.testoMisura = []; }
        v.voce.unita_misura = mChiude[2].trim();
        v.voce.quantita = riga.numeri.quantita ?? null;
        v.voce.prezzo_unitario = riga.numeri.prezzo ?? null;
        v.voce.importo = riga.numeri.importo ?? null;
        v.voce.is_detrazione = mChiude[1] === "SI DETRAGGONO";
        if (/^a\s*corpo$/i.test(v.voce.unita_misura)) v.voce.a_corpo = true;
        v.chiusa = true;
        continue;
      }

      // ── Inizio di una nuova voce ──
      const primo = riga.codici[0];
      if (primo && /^\d+$/.test(primo)) {
        const n = Number(primo);
        const attesa = corrente ? Number(corrente.voce.numero_ordine) + 1 : null;
        const nuova = !corrente || corrente.chiusa || (n === attesa && !!riga.testo);
        if (nuova) {
          if (corrente && !corrente.chiusa) avvisi.push(`Voce ${corrente.voce.numero_ordine}: non chiusa prima della ${n}.`);
          chiudiCorrente();
          corrente = nuovaVoce(primo, riga.page, stato);
          riga.codici.shift();
        }
      }
      if (!corrente) {
        if (riga.testo || riga.codici.length) avvisi.push(`Pagina ${riga.page}: testo fuori da una voce: «${riga.tutto.slice(0, 80)}».`);
        continue;
      }
      const v: VoceInCorso = corrente;
      v.voce.codici.push(...riga.codici);
      if (v.chiusa) {
        if (riga.testo) v.voce.avvisi.push(`Testo dopo la chiusura della voce: «${riga.testo.slice(0, 80)}».`);
        continue;
      }
      const haMisure = (["parti_uguali", "lunghezza", "larghezza", "altezza_peso", "quantita"] as const).some(k => riga.numeri[k] !== undefined);
      if (haMisure) {
        v.descrizioneAperta = false; chiudiDescrizione(v);
        // Un numero troppo lungo per la colonna va a capo: «153873,5» + «5».
        const prec = v.rigaMisuraPrecedente;
        if (prec && riga.numeri.quantita !== undefined && prec.numeri.quantita === undefined && !v.testoMisura.length) {
          const colonneRiga = Object.keys(riga.numeri).filter(k => k !== "quantita") as ColonnaNumero[];
          const unite: Partial<Record<ColonnaNumero, number>> = { ...prec.numeri };
          let unibile = colonneRiga.length > 0 && colonneRiga.every(k => prec.grezzi[k] !== undefined && /^\d+$/.test(riga.grezzi[k] ?? ""));
          for (const k of colonneRiga) {
            const n = numeroComputo(`${prec.grezzi[k]}${riga.grezzi[k]}`);
            if (n === null) unibile = false; else unite[k] = n;
          }
          // Si uniscono solo se i fattori uniti danno proprio la quantità stampata.
          const fattori = (["parti_uguali", "lunghezza", "larghezza", "altezza_peso"] as const).map(k => unite[k]).filter((n): n is number => n !== undefined);
          const prodotto = fattori.reduce((a, b) => a * b, 1);
          if (unibile && fattori.length && Math.abs(prodotto - riga.numeri.quantita) <= Math.max(0.011, Math.abs(prodotto) * 0.002)) {
            unite.quantita = riga.numeri.quantita;
            v.voce.misure.pop();
            v.voce.misure.push(misuraDa([prec.testo, riga.testo].filter(Boolean).join(" "), unite, v.voce.avvisi));
            v.rigaMisuraPrecedente = null;
            continue;
          }
        }
        const testo = [...v.testoMisura, riga.testo].filter(Boolean).join(" ");
        v.testoMisura = [];
        v.voce.misure.push(misuraDa(testo, riga.numeri, v.voce.avvisi));
        v.rigaMisuraPrecedente = { numeri: riga.numeri, grezzi: riga.grezzi, testo };
        continue;
      }
      if (!riga.testo) continue;
      // La designazione è un paragrafo unico: finché le righe arrivano al margine
      // destro continua; una riga corta chiude il paragrafo e quel che segue sono
      // le descrizioni delle righe di misura.
      const conFormula = /\((par\.ug\.|lung\.|larg\.|H\/peso)\s*=/i.test(riga.testo);
      if (v.descrizioneAperta && !conFormula && (v.ultimaRigaPiena || !v.descrizione.length)) {
        v.descrizione.push(riga.testo);
        v.ultimaRigaPiena = riga.testoDestra >= colonne.numeriInizio - 30;
      } else {
        v.descrizioneAperta = false;
        v.testoMisura.push(riga.testo);
      }
    }
  }
  chiudiCorrente();
  if (oggetto.length) metadata.oggetto_lavori = oggetto.join(" ").replace(/\s+/g, " ").trim();
  return {
    formato: "primus_pdf", metadata, voci, totale_dichiarato: totaleDichiarato, riepiloghi, avvisi,
    prezzari: [],
  };
}

type ComputoLivelloRiepilogoInterno = ComputoRigaRiepilogo["livello"] | "altro";

/** Lettura + controllo in un colpo solo. */
export function leggiEControllaPrimus(pagine: PdfPaginaPosizionata[]) {
  const computo = leggiComputoPrimus(pagine);
  return { computo, controllo: controllaTotali(computo) };
}
