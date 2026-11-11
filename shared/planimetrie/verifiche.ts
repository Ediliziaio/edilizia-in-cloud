/**
 * Verifiche igienico-sanitarie della pianta (DM 5 luglio 1975 e regolamenti edilizi tipici):
 * il controllo che un tecnico fa prima di una CILA o di una SCIA.
 *
 * - Rapporto aeroilluminante: nei locali abitabili (soggiorno, cucina, camere, studio) la
 *   superficie finestrata deve essere almeno 1/8 di quella del pavimento.
 * - Altezze: locali abitabili almeno 2,70 m; bagni, corridoi, disimpegni e ripostigli 2,40 m.
 * - Superfici: camera singola almeno 9 m², doppia 14 m²; soggiorno almeno 14 m².
 * - Bagni: con finestra, oppure con aerazione meccanica (la VMC disegnata); in ogni alloggio
 *   almeno un bagno con WC, lavabo e doccia o vasca (il bidet si segnala se manca).
 * - Alloggio: almeno 28 m² (monolocale per una persona), 38 m² per due.
 *
 * I valori vengono dalla norma nazionale; i regolamenti comunali possono chiedere di più (o
 * ammettere deroghe: montagna, centri storici, sottotetti). È un controllo di massima: la
 * verifica vera la firma il tecnico. Contano le finestre e le portafinestre (luce netta =
 * larghezza × altezza del vano), non le porte né i varchi.
 */
import { apertureDelLocale, areaPoligono } from "./geometria.ts";
import { ALTEZZA_MEDIA_ABITABILI, ALTEZZA_MEDIA_SERVIZI, ALTEZZA_UTILE_MINIMA, altezzeLocale, falde } from "./sottotetto.ts";
import { verificheDiProgetto } from "./interferenze.ts";
import { ambitiDi, statoDelLivello, type Destinazione, type Locale, type Planimetria, type StatoPianta } from "./modello.ts";

export type EsitoVerifica = "ok" | "attenzione" | "non_conforme";

export interface Verifica {
  /** Codice breve per raggruppare: «rai», «altezza», «superficie», «bagno», «alloggio». */
  codice: "rai" | "altezza" | "superficie" | "bagno" | "alloggio" | "interferenza" | "scala" | "contenimento" | "serramento" | "tetto";
  esito: EsitoVerifica;
  livello: string;
  /** Il locale (o l'alloggio) a cui si riferisce. */
  oggetto: string;
  messaggio: string;
  /** Valore misurato e minimo richiesto, per la tabella. */
  valore?: string;
  richiesto?: string;
}

const ABITABILI = new Set<Destinazione>(["soggiorno", "cucina", "camera", "studio"]);
const SERVIZI = new Set<Destinazione>(["bagno", "disimpegno", "corridoio", "ripostiglio", "lavanderia", "ingresso"]);
const ESCLUSI = new Set<Destinazione>(["balcone", "terrazzo", "garage", "cantina", "giardino"]);
const mq = (v: number) => `${v.toLocaleString("it-IT", { maximumFractionDigits: 2 })} m²`;
const m = (cm: number) => `${(cm / 100).toLocaleString("it-IT", { maximumFractionDigits: 2 })} m`;

/**
 * Superficie finestrata del locale (m²): finestre e portafinestre che lo toccano, più i
 * lucernari (finestre a tetto) dentro la stanza, con la loro luce intera.
 */
export function superficieFinestrata(locale: Locale, stato: StatoPianta): number {
  const pareti = apertureDelLocale(locale, stato)
    .filter((a) => a.tipo === "finestra" || a.tipo === "portafinestra")
    .reduce((t, a) => t + (a.larghezza * a.altezza) / 10_000, 0);
  const tetto = stato.elementi
    .filter((e) => e.tipo === "lucernario" && e.stato !== "da_demolire" && insideLocale(e.posizione, locale))
    .reduce((t, e) => t + ((e.larghezza ?? 78) * (e.profondita ?? 118)) / 10_000, 0);
  return pareti + tetto;
}

/** Le verifiche di uno stato (com'è oggi o una proposta) su tutti i piani. */
export function verificaPianta(doc: Planimetria, ambitoChiave = "fatto"): Verifica[] {
  const ambito = ambitiDi(doc).find((a) => a.chiave === ambitoChiave) ?? ambitiDi(doc)[0];
  const out: Verifica[] = [];
  // per alloggio: superficie e bagni (senza unità, tutta la pianta è un alloggio)
  const alloggi = new Map<string, { mq: number; bagni: Array<{ nome: string; tipi: Set<string> }>; livello: string }>();
  for (const livello of doc.livelli) {
    const stato = statoDelLivello(livello, ambito) ?? livello.fatto;
    const sottoFalde = falde(livello, stato);
    // alzata e pedata si stimano sull'interpiano vero (quota del piano sopra meno questo), se c'è
    const sopra = [...doc.livelli].filter((x) => x.quota > livello.quota).sort((a, b) => a.quota - b.quota)[0];
    out.push(...verificheDiProgetto(livello, stato, sopra ? sopra.quota - livello.quota : undefined));
    for (const l of stato.locali) {
      if (ESCLUSI.has(l.destinazione) || /comun|androne/i.test(l.unita ?? "")) continue;
      const areaLorda = areaPoligono(l.contorno) / 10_000;
      // in mansarda contano l'altezza media e la superficie dove si sta in piedi (≥ 1,50 m)
      const sotto = sottoFalde ? altezzeLocale(l, sottoFalde) : null;
      const area = sotto ? sotto.superficieUtile : areaLorda;
      const chiave = l.unita?.trim() || "Alloggio";
      const a = alloggi.get(chiave) ?? { mq: 0, bagni: [], livello: livello.nome };
      if (ABITABILI.has(l.destinazione) || SERVIZI.has(l.destinazione) || l.destinazione === "altro") a.mq += area;
      alloggi.set(chiave, a);
      const v = (codice: Verifica["codice"], esito: EsitoVerifica, messaggio: string, valore?: string, richiesto?: string) =>
        out.push({ codice, esito, livello: livello.nome, oggetto: l.nome, messaggio, valore, richiesto });

      // altezza
      if (sotto && (ABITABILI.has(l.destinazione) || SERVIZI.has(l.destinazione))) {
        const minimo = ABITABILI.has(l.destinazione) ? ALTEZZA_MEDIA_ABITABILI : ALTEZZA_MEDIA_SERVIZI;
        const dettaglio = `media ${m(sotto.media)} (min ${m(sotto.minima)}, max ${m(sotto.massima)})`;
        if (sotto.media < minimo) v("altezza", "non_conforme", "Sottotetto: l'altezza media è troppo bassa per questo uso.", dettaglio, `media ${m(minimo)}`);
        else if (sotto.minima < ALTEZZA_UTILE_MINIMA && ABITABILI.has(l.destinazione)) v("altezza", "attenzione", `Sottotetto: ${mq(sotto.superficie - sotto.superficieUtile)} sotto 1,50 m non contano nella superficie (vanno chiusi con armadi o ripostigli).`, dettaglio, `media ${m(minimo)}, min 1,50 m`);
        else v("altezza", "ok", "Sottotetto: altezza media regolare.", dettaglio, `media ${m(minimo)}`);
      } else if (ABITABILI.has(l.destinazione)) {
        if (l.altezza < 270) v("altezza", l.altezza >= 240 ? "attenzione" : "non_conforme", l.altezza >= 240 ? "Sotto i 2,70 m: ammesso solo con deroga (montagna, sottotetto recuperato, centro storico)." : "Troppo basso per un locale abitabile.", m(l.altezza), "2,70 m");
        else v("altezza", "ok", "Altezza regolare.", m(l.altezza), "2,70 m");
      } else if (SERVIZI.has(l.destinazione) && l.altezza < 240) {
        v("altezza", "non_conforme", "Troppo basso anche per un servizio.", m(l.altezza), "2,40 m");
      }

      // rapporto aeroilluminante
      if (ABITABILI.has(l.destinazione) && areaLorda > 0) {
        const fin = superficieFinestrata(l, stato);
        const serve = areaLorda / 8;
        const rapporto = fin > 0 ? `1/${(areaLorda / fin).toLocaleString("it-IT", { maximumFractionDigits: 1 })}` : "nessuna finestra";
        if (fin >= serve) v("rai", "ok", "Finestre sufficienti.", `${mq(fin)} (${rapporto})`, `${mq(serve)} (1/8)`);
        else v("rai", fin >= serve * 0.85 ? "attenzione" : "non_conforme", fin > 0 ? `Mancano ${mq(serve - fin)} di finestre.` : "Il locale non ha finestre.", `${mq(fin)} (${rapporto})`, `${mq(serve)} (1/8)`);
      }

      // superfici minime
      if (l.destinazione === "camera") {
        const doppia = stato.elementi.some((e) => e.tipo === "letto_matrimoniale" && insideLocale(e.posizione, l)) || area >= 14;
        if (area < 9) v("superficie", "non_conforme", "Troppo piccola anche come camera singola.", mq(area), "9 m²");
        else if (doppia && area < 14) v("superficie", "non_conforme", "Con il letto matrimoniale serve una camera doppia.", mq(area), "14 m²");
        else v("superficie", "ok", doppia ? "Camera doppia regolare." : "Camera singola regolare.", mq(area), doppia ? "14 m²" : "9 m²");
      }
      if (l.destinazione === "soggiorno") {
        if (area < 14) v("superficie", "non_conforme", "Il soggiorno deve avere almeno 14 m².", mq(area), "14 m²");
        else v("superficie", "ok", "Superficie regolare.", mq(area), "14 m²");
      }

      // bagni: finestra o VMC
      if (l.destinazione === "bagno") {
        const tipi = new Set(stato.elementi.filter((e) => insideLocale(e.posizione, l)).map((e) => e.tipo));
        a.bagni.push({ nome: l.nome, tipi });
        const finestra = superficieFinestrata(l, stato) > 0;
        if (finestra) v("bagno", "ok", "Bagno finestrato.");
        else if (tipi.has("vmc") || stato.elementi.some((e) => e.tipo === "vmc")) v("bagno", "ok", "Bagno cieco con aerazione meccanica (VMC).");
        else v("bagno", "non_conforme", "Bagno cieco: serve l'aerazione meccanica (aspiratore o VMC).");
      }
    }
  }
  for (const [nome, a] of alloggi) {
    if (doc.ambitoDocumento === "ambiente") continue;
    if (a.mq <= 0) continue;
    const v = (esito: EsitoVerifica, messaggio: string, valore?: string, richiesto?: string) => out.push({ codice: "alloggio", esito, livello: a.livello, oggetto: nome, messaggio, valore, richiesto });
    if (a.mq < 28) v("non_conforme", "Sotto i 28 m² non è un alloggio abitabile.", mq(a.mq), "28 m²");
    else if (a.mq < 38) v("attenzione", "Va bene per una persona; per due ne servono 38.", mq(a.mq), "28–38 m²");
    else v("ok", "Superficie dell'alloggio regolare.", mq(a.mq), "38 m²");
    if (!a.bagni.length) v("non_conforme", "L'alloggio non ha un bagno.");
    else {
      const completo = a.bagni.find((b) => b.tipi.has("wc") && b.tipi.has("lavabo") && (b.tipi.has("doccia") || b.tipi.has("vasca")));
      if (!completo) v("attenzione", "Nessun bagno ha WC, lavabo e doccia o vasca disegnati.");
      else if (!completo.tipi.has("bidet") && !a.bagni.some((b) => b.tipi.has("bidet"))) v("attenzione", "Manca il bidet (obbligatorio in quasi tutti i regolamenti per il primo bagno).");
      else v("ok", `Bagno completo: ${completo.nome}.`);
    }
  }
  return out;
}

function insideLocale(p: { x: number; y: number }, l: Locale): boolean {
  let s = false;
  const c = l.contorno;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    if ((c[i].y > p.y) !== (c[j].y > p.y) && p.x < ((c[j].x - c[i].x) * (p.y - c[i].y)) / (c[j].y - c[i].y) + c[i].x) s = !s;
  }
  return s;
}

export const riepilogoVerifiche = (v: Verifica[]) => ({
  ok: v.filter((x) => x.esito === "ok").length,
  attenzione: v.filter((x) => x.esito === "attenzione").length,
  nonConformi: v.filter((x) => x.esito === "non_conforme").length,
});
