/**
 * Planimetrie — quantità per il computo metrico.
 *
 * Ogni quantità ha una CHIAVE STABILE che il computo salva nelle righe di misura
 * (`computo_voci_misure.planimetria_chiavi`) e rilegge quando la pianta cambia:
 *
 *   <ambito>:<soggetto>.<misura>
 *   ambito   = fatto | progetto:<id proposta>
 *   soggetto = locale:<id> | destinazione:<destinazione> | pianta | muro:<id>
 *            | demolizioni | costruzioni | aperture:<stato>:<tipo>[:<L>x<H>]
 *
 * Elenco completo e regole in docs/planimetrie/modello.md. Non cambiare il nome di
 * una chiave esistente: i computi già salvati la cercano.
 *
 * Regole di misura (prassi del computo, configurabili dove indicato):
 * - superfici e lunghezze dei locali al filo interno delle pareti;
 * - pareti lorde = perimetro × altezza del locale;
 * - pareti nette = lorde meno i vuoti di superficie SUPERIORE alla soglia (4 mq),
 *   per intero («vuoto per pieno» sotto soglia). Del vuoto conta solo la parte che
 *   cade nella superficie misurata (fino all'altezza del locale o del rivestimento).
 *   `deduzione: "eccedenza"` detrae solo la parte oltre la soglia;
 * - battiscopa = perimetro meno la larghezza delle aperture a filo pavimento
 *   (davanzale 0: porte, portefinestre, varchi);
 * - pareti (muri) misurate sull'asse: lunghezza × altezza, meno i vuoti oltre soglia;
 *   volume = superficie × spessore;
 * - valori arrotondati a 4 decimali (come le righe di misura del computo).
 * Ogni quantità porta l'origine peggiore delle misure usate: se ne usa una stimata,
 * è stimata.
 */
import {
  ambitiDi,
  NOMI_AREA,
  originePeggiore,
  origineMisura,
  statoDelLivello,
  type Ambito,
  type Apertura,
  type Locale,
  type Muro,
  type Origine,
  type Planimetria,
  type StatoPianta,
  type TipoArea,
} from "./modello.ts";
import { TOLLERANZA_LOCALE_CM, apertureDelLocale, areaPoligono, lunghezzaMuro, perimetroPoligono } from "./geometria.ts";
import { metriConSfrido, percorsiImpianti, type LineaImpianto } from "./impianti.ts";
import { facceTetto, fotovoltaicoSulTetto, rettangoloTetto, superficieFalde } from "./tetto.ts";
import { puntiTerreno, scaviERiporti } from "./terreno.ts";

export type UnitaQuantita = "mq" | "ml" | "mc" | "n";

export interface Quantita {
  chiave: string;
  valore: number;
  unita: UnitaQuantita;
  origine: Origine;
  /** Pronta per la descrizione della riga di misura: «Pavimento — Bagno». */
  descrizione: string;
  ambito: string;
  livelloId?: string;
  /** Locale o parete a cui si riferisce, se è di un oggetto solo. */
  oggettoId?: string;
}

export type MappaQuantita = Record<string, Quantita>;

export interface OpzioniQuantita {
  /** Vuoti fino a questa superficie (mq) non si detraggono. Default 4. */
  sogliaDeduzioneMq?: number;
  /** «intera»: oltre soglia si detrae tutto il vuoto (default); «eccedenza»: solo la parte oltre soglia. */
  deduzione?: "intera" | "eccedenza";
  /** Distanza massima fra il lato di un'apertura e il contorno del locale, in cm. */
  tolleranzaCm?: number;
}

export const OPZIONI_QUANTITA_PREDEFINITE: Required<OpzioniQuantita> = {
  sogliaDeduzioneMq: 4,
  deduzione: "intera",
  tolleranzaCm: TOLLERANZA_LOCALE_CM,
};

export type MisuraLocale =
  | "pavimento_mq"
  | "perimetro_ml"
  | "pareti_lorde_mq"
  | "pareti_nette_mq"
  | "soffitto_mq"
  | "volume_mc"
  | "battiscopa_ml"
  | "rivestimento_mq";

export const ETICHETTE_MISURE_LOCALE: Record<MisuraLocale, string> = {
  pavimento_mq: "Pavimento",
  perimetro_ml: "Perimetro",
  pareti_lorde_mq: "Pareti (lorde)",
  pareti_nette_mq: "Pareti al netto delle aperture",
  soffitto_mq: "Soffitto",
  volume_mc: "Volume",
  battiscopa_ml: "Battiscopa",
  rivestimento_mq: "Rivestimento",
};

const ORDINE_MISURE = Object.keys(ETICHETTE_MISURE_LOCALE) as MisuraLocale[];
const unitaDi = (misura: string): UnitaQuantita =>
  misura.endsWith("_mq") ? "mq" : misura.endsWith("_mc") ? "mc" : misura.endsWith("_ml") ? "ml" : "n";

export const arrotonda = (v: number) => Math.round(v * 10_000) / 10_000 + 0;

/** Scompone una chiave; null se non è una chiave di quantità. */
export function leggiChiave(chiave: string): { ambito: string; propostaId: string | null; soggetto: string; misura: string } | null {
  const m = /^(fatto|progetto:([A-Za-z0-9_-]+)):(.+)\.([a-z_]+)$/.exec(chiave);
  if (!m) return null;
  return { ambito: m[1], propostaId: m[2] ?? null, soggetto: m[3], misura: m[4] };
}

interface Accumulo { valore: number; origini: Origine[] }

/** Tutte le quantità della pianta, per il fatto e per ogni proposta. */
export function calcolaQuantita(p: Planimetria, opzioni: OpzioniQuantita = {}): MappaQuantita {
  const opz = { ...OPZIONI_QUANTITA_PREDEFINITE, ...opzioni };
  const out: MappaQuantita = {};
  for (const ambito of ambitiDi(p)) calcolaAmbito(p, ambito, opz, out);
  return out;
}

function calcolaAmbito(p: Planimetria, ambito: Ambito, opz: Required<OpzioniQuantita>, out: MappaQuantita) {
  const suffisso = ambito.propostaId ? ` (${ambito.nome})` : "";
  const metti = (soggetto: string, misura: string, acc: Accumulo, descrizione: string, extra: Partial<Quantita> = {}) => {
    const chiave = `${ambito.chiave}:${soggetto}.${misura}`;
    out[chiave] = {
      chiave, valore: arrotonda(acc.valore), unita: unitaDi(misura), origine: originePeggiore(...acc.origini),
      descrizione: descrizione + suffisso, ambito: ambito.chiave, ...extra,
    };
  };
  const somma = (mappa: Map<string, Accumulo>, chiave: string, acc: Accumulo) => {
    const prec = mappa.get(chiave) ?? { valore: 0, origini: [] };
    mappa.set(chiave, { valore: prec.valore + acc.valore, origini: [...prec.origini, ...acc.origini] });
  };

  const totaliPianta = new Map<string, Accumulo>();
  const totaliDestinazione = new Map<string, Map<string, Accumulo>>();
  // Per appartamento (condomini, bifamiliari): «unita:<sigla>.pavimento_mq».
  const totaliUnita = new Map<string, { nome: string; mappa: Map<string, Accumulo> }>();
  const demolizioni = new Map<string, Accumulo>();
  const costruzioni = new Map<string, Accumulo>();
  const aperture = new Map<string, { acc: Accumulo; descrizione: string }>();
  // Arredi, sanitari e punti impianto per tipo (1/11/2026): «elementi:<stato>:<tipo>.numero».
  const elementi = new Map<string, { acc: Accumulo; descrizione: string }>();
  // Un ascensore è un vano che attraversa i piani: lo stesso vano su più piani si conta una volta, con le sue fermate.
  const ascensori: Array<{ st: string; x: number; y: number; fermate: number }> = [];
  // Linee stimate degli impianti (shared/planimetrie/impianti.ts), in cm senza sfrido.
  const linee = new Map<LineaImpianto, number>();
  // Lotto e aree esterne: «esterni:<tipo>.superficie_mq», recinzione del lotto in metri.
  const esterni = new Map<string, Accumulo>();
  let recinzioneCm = 0;
  // Tetti: superficie delle falde e fotovoltaico (shared/planimetrie/tetto.ts)
  let coperturaMq = 0, pannelliFv = 0, kWp = 0;

  for (const livello of p.livelli) {
    const stato = statoDelLivello(livello, ambito);
    if (!stato) continue;
    // una proposta fatta prima delle aree esterne non le ha: valgono quelle di oggi
    if (livello.tetto) {
      const muri = stato.muri.filter((m) => m.stato !== "da_demolire");
      // la geometria del tetto lavora con y in giù (sud in basso, come sul foglio)
      const r = rettangoloTetto(muri.map((m) => ({ a: { x: m.p1.x, y: -m.p1.y }, b: { x: m.p2.x, y: -m.p2.y }, spessore: m.spessore })), livello.tetto.sporto);
      if (r) {
        const facce = facceTetto(r, Math.max(...muri.map((m) => m.altezza)), livello.tetto);
        coperturaMq += superficieFalde(facce);
        if (livello.tetto.fotovoltaico) {
          const fv = fotovoltaicoSulTetto(facce, livello.tetto.fotovoltaico);
          pannelliFv += fv.numero;
          kWp += fv.kWp;
        }
      }
    }
    for (const a of stato.aree ?? livello.fatto.aree ?? []) {
      if (a.stato === "da_demolire" || a.contorno.length < 3) continue;
      somma(esterni, a.tipo, { valore: areaPoligono(a.contorno) / 10_000, origini: ["rilevata"] });
      if (a.tipo === "lotto" && a.recinzione !== false) recinzioneCm += perimetroPoligono(a.contorno);
    }

    // ─── Locali ───
    for (const l of stato.locali) {
      const misure = misureLocale(l, stato, opz);
      for (const misura of ORDINE_MISURE) {
        const acc = misure[misura];
        if (!acc) continue;
        metti(`locale:${l.id}`, misura, acc, `${ETICHETTE_MISURE_LOCALE[misura]} — ${l.nome}`, { livelloId: livello.id, oggettoId: l.id });
        somma(totaliPianta, misura, acc);
        const perDest = totaliDestinazione.get(l.destinazione) ?? new Map<string, Accumulo>();
        somma(perDest, misura, acc);
        totaliDestinazione.set(l.destinazione, perDest);
        if (l.unita?.trim()) {
          const sigla = siglaUnita(l.unita);
          const perUnita = totaliUnita.get(sigla) ?? { nome: l.unita.trim(), mappa: new Map<string, Accumulo>() };
          somma(perUnita.mappa, misura, acc);
          totaliUnita.set(sigla, perUnita);
        }
      }
    }

    // ─── Pareti ───
    for (const m of stato.muri) {
      const misure = misureMuro(m, stato, opz);
      metti(`muro:${m.id}`, "lunghezza_ml", misure.lunghezza, "Lunghezza parete", { livelloId: livello.id, oggettoId: m.id });
      metti(`muro:${m.id}`, "superficie_mq", misure.superficie, "Superficie parete", { livelloId: livello.id, oggettoId: m.id });
      metti(`muro:${m.id}`, "volume_mc", misure.volume, "Volume parete", { livelloId: livello.id, oggettoId: m.id });
      if (ambito.propostaId === null || m.stato === "esistente") continue;
      const dest = m.stato === "da_demolire" ? demolizioni : costruzioni;
      somma(dest, "muri_ml", misure.lunghezza);
      somma(dest, "muri_mq", misure.superficie);
      somma(dest, "muri_mc", misure.volume);
    }

    // ─── Aperture ───
    for (const a of stato.aperture) {
      const origini = [origineMisura(a, "larghezza"), origineMisura(a, "altezza")];
      const nomeTipo = { porta: "Porte", finestra: "Finestre", portafinestra: "Portefinestre", varco: "Varchi" }[a.tipo];
      const nomeStato = { esistente: "esistenti", da_demolire: "da demolire", nuovo: "nuove" }[a.stato];
      const misura = `${Math.round(a.larghezza)}x${Math.round(a.altezza)}`;
      for (const [soggetto, descrizione] of [
        [`aperture:${a.stato}:${a.tipo}`, `${nomeTipo} ${nomeStato}`],
        [`aperture:${a.stato}:${a.tipo}:${misura}`, `${nomeTipo} ${nomeStato} ${misura.replace("x", "×")} cm`],
      ]) {
        const prec = aperture.get(soggetto)?.acc ?? { valore: 0, origini: [] };
        aperture.set(soggetto, { acc: { valore: prec.valore + 1, origini: [...prec.origini, ...origini] }, descrizione });
      }
    }

    // ─── Linee degli impianti (stimate) ───
    for (const p of percorsiImpianti(stato).percorsi) linee.set(p.linea, (linee.get(p.linea) ?? 0) + p.lunghezzaCm);

    // ─── Arredi, sanitari, punti impianto ───
    for (const e of stato.elementi) {
      // i punti quotati del terreno sono misure, non cose da comprare o posare
      if (!/^[a-z0-9_]+$/.test(e.tipo) || e.tipo === "quota_terreno") continue;
      const st = e.stato ?? "esistente";
      if (e.tipo === "ascensore") {
        const stesso = ascensori.find((a) => a.st === st && Math.hypot(a.x - e.posizione.x, a.y - e.posizione.y) < 60);
        if (stesso) { stesso.fermate += 1; continue; }
        ascensori.push({ st, x: e.posizione.x, y: e.posizione.y, fermate: 1 });
      }
      const soggetto = `elementi:${st}:${e.tipo}`;
      const nomeStato = { esistente: "esistenti", da_demolire: "da togliere", nuovo: "nuovi" }[st];
      const nome = NOMI_ELEMENTI[e.tipo] ?? e.tipo.replace(/_/g, " ");
      const prec = elementi.get(soggetto)?.acc ?? { valore: 0, origini: [] };
      elementi.set(soggetto, { acc: { valore: prec.valore + 1, origini: [...prec.origini, e.origine] }, descrizione: `${nome} ${nomeStato}` });
    }
  }

  // Impianti: «impianti:<impianto>.<misura>», stimati, con lo sfrido.
  const stimata = (cm: number, per = 1): Accumulo => ({ valore: metriConSfrido(cm) * per, origini: ["stimata"] });
  const lin = (l: LineaImpianto) => linee.get(l) ?? 0;
  if (lin("elettrica")) {
    metti("impianti:elettrico", "corrugato_ml", stimata(lin("elettrica")), "Corrugato impianto elettrico (stima dal quadro ai punti)");
    metti("impianti:elettrico", "cavo_ml", stimata(lin("elettrica"), 3), "Cavo unipolare (fase, neutro, terra; stima)");
  }
  if (lin("acqua")) metti("impianti:acqua", "tubo_ml", stimata(lin("acqua"), 2), "Tubo acqua fredda e calda (stima dal collettore)");
  if (lin("scarico")) metti("impianti:scarico", "tubo_ml", stimata(lin("scarico")), "Tubo di scarico (stima fino alla colonna)");
  if (lin("frigorifera")) metti("impianti:clima", "rame_ml", stimata(lin("frigorifera"), 2), "Linea frigorifera in rame, due tubi (stima)");
  if (lin("riscaldamento")) metti("impianti:riscaldamento", "tubo_ml", stimata(lin("riscaldamento"), 2), "Tubo riscaldamento, mandata e ritorno (stima dal generatore ai termosifoni)");
  if (lin("condensa")) metti("impianti:clima", "condensa_ml", stimata(lin("condensa")), "Scarico condensa split (stima)");

  for (const [tipo, acc] of esterni) metti(`esterni:${tipo}`, "superficie_mq", acc, tipo === "lotto" ? "Superficie del lotto" : `Area esterna «${NOMI_AREA[tipo as TipoArea] ?? tipo}»`);
  // Terreno in pendenza o rilievo: scavi e riporti sotto il piano più basso
  const punti = puntiTerreno(p);
  if (punti.length) {
    const basso = [...p.livelli].sort((a, b) => a.quota - b.quota)[0];
    const stato = basso ? statoDelLivello(basso, ambito) ?? basso.fatto : null;
    if (basso && stato?.locali.length) {
      const sr = scaviERiporti(punti, stato.locali.map((l) => l.contorno), basso.quota);
      if (sr.scavoMc > 0.05) metti("terreno:scavo", "volume_mc", { valore: sr.scavoMc, origini: ["stimata"] }, `Scavo sotto «${basso.nome}» fino al pavimento (stima dal terreno)`);
      if (sr.riportoMc > 0.05) metti("terreno:riporto", "volume_mc", { valore: sr.riportoMc, origini: ["stimata"] }, `Riporto sotto «${basso.nome}» fino al pavimento (stima dal terreno)`);
    }
  }
  if (coperturaMq > 0) metti("tetto:copertura", "superficie_mq", { valore: coperturaMq, origini: ["stimata"] }, "Copertura: superficie delle falde (o del tetto piano)");
  if (pannelliFv > 0) {
    metti("impianti:fotovoltaico", "pannelli", { valore: pannelliFv, origini: ["stimata"] }, "Fotovoltaico: pannelli sul tetto");
    metti("impianti:fotovoltaico", "kwp", { valore: kWp, origini: ["stimata"] }, "Fotovoltaico: potenza di picco (kWp)");
  }
  if (recinzioneCm > 0) metti("esterni:lotto", "recinzione_ml", { valore: recinzioneCm / 100, origini: ["rilevata"] }, "Recinzione lungo il confine del lotto");

  for (const [misura, acc] of totaliPianta) metti("pianta", misura, acc, `${ETICHETTE_MISURE_LOCALE[misura as MisuraLocale]} — tutti i locali`);
  for (const [dest, mappa] of totaliDestinazione) {
    for (const [misura, acc] of mappa) metti(`destinazione:${dest}`, misura, acc, `${ETICHETTE_MISURE_LOCALE[misura as MisuraLocale]} — locali «${dest}»`);
  }
  for (const [sigla, { nome, mappa }] of totaliUnita) {
    for (const [misura, acc] of mappa) metti(`unita:${sigla}`, misura, acc, `${ETICHETTE_MISURE_LOCALE[misura as MisuraLocale]} — ${nome}`);
  }
  const nomiMuri: Record<string, string> = { muri_ml: "lunghezza", muri_mq: "superficie", muri_mc: "volume" };
  for (const [misura, acc] of demolizioni) metti("demolizioni", misura, acc, `Pareti da demolire (${nomiMuri[misura]})`);
  for (const [misura, acc] of costruzioni) metti("costruzioni", misura, acc, `Pareti nuove (${nomiMuri[misura]})`);
  for (const [soggetto, { acc, descrizione }] of aperture) metti(soggetto, "numero", acc, descrizione);
  for (const [soggetto, { acc, descrizione }] of elementi) metti(soggetto, "numero", acc, descrizione);
  const fermatePerStato = new Map<string, number>();
  for (const a of ascensori) fermatePerStato.set(a.st, (fermatePerStato.get(a.st) ?? 0) + a.fermate);
  for (const [st, n] of fermatePerStato) {
    const nomeStato = { esistente: "esistenti", da_demolire: "da togliere", nuovo: "nuovi" }[st as "esistente"] ?? st;
    metti(`elementi:${st}:ascensore_fermate`, "numero", { valore: n, origini: ["rilevata"] }, `Fermate degli ascensori ${nomeStato} (piani serviti)`);
  }
}

/** La sigla di un appartamento dentro una chiave: «Int. 3» → «int_3». */
export const siglaUnita = (unita: string) =>
  unita.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "unita";

/** Nomi al plurale per le righe del computo («Prese nuove», «WC esistenti»). */
const NOMI_ELEMENTI: Record<string, string> = {
  wc: "WC", bidet: "Bidet", lavabo: "Lavabi", doccia: "Docce", vasca: "Vasche", lavatrice: "Lavatrici",
  cucina: "Cucine", frigorifero: "Frigoriferi", tavolo: "Tavoli", sedia: "Sedie",
  letto_matrimoniale: "Letti matrimoniali", letto_singolo: "Letti singoli", comodino: "Comodini", armadio: "Armadi",
  scrivania: "Scrivanie", divano: "Divani", caldaia: "Caldaie", pilastro: "Pilastri", scala: "Scale (rampe)", ascensore: "Ascensori",
  divano_angolare: "Divani angolari", poltrona: "Poltrone", mobile_tv: "Mobili TV", libreria: "Librerie", tavolo_rotondo: "Tavoli rotondi",
  cucina_angolare: "Cucine ad angolo", isola_cucina: "Isole cucina", lavastoviglie: "Lavastoviglie", auto: "Auto", scaffale: "Scaffalature", banco_lavoro: "Banchi da lavoro",
  piscina: "Piscine", idromassaggio: "Minipiscine idromassaggio", pergola: "Pergole", albero: "Alberi", siepe: "Siepi", aiuola: "Aiuole",
  ombrellone: "Ombrelloni", lettino: "Lettini", tavolo_esterno: "Tavoli da esterno", barbecue: "Barbecue",
  cancello_pedonale: "Cancelli pedonali", cancello_carrabile: "Cancelli carrabili", lampione: "Lampioni da giardino", faretto_giardino: "Faretti e segnapasso",
  irrigatore: "Irrigatori", pozzetto: "Pozzetti",
  campo_tennis: "Campi da tennis", campo_padel: "Campi da padel", campo_calcio5: "Campi da calcio a 5", campo_calcio7: "Campi da calcio a 7",
  campo_calcio11: "Campi da calcio a 11", campo_basket: "Campi da basket", campo_pallavolo: "Campi da pallavolo", campo_beach_volley: "Campi da beach volley",
  campo_pickleball: "Campi da pickleball", campo_bocce: "Campi da bocce",
  pompa_calore: "Pompe di calore", bollitore: "Bollitori", inverter: "Inverter fotovoltaici", batteria_accumulo: "Batterie di accumulo",
  wallbox: "Wallbox", termostato: "Termostati", vmc: "Macchine VMC", lucernario: "Lucernari",
  collettore: "Collettori", colonna_scarico: "Colonne di scarico", unita_esterna: "Unità esterne clima",
  presa: "Prese", interruttore: "Interruttori", punto_luce: "Punti luce", punto_acqua: "Punti acqua",
  scarico: "Scarichi", split: "Split clima", termosifone: "Termosifoni", quadro_elettrico: "Quadri elettrici",
};

/** Parte del vano che cade fra quota 0 e `fino` (cm), in cm². */
function vuotoFino(a: Apertura, fino: number): number {
  const h = Math.max(0, Math.min(a.davanzale + a.altezza, fino) - a.davanzale);
  return a.larghezza * h;
}

/** Quanto si detrae di un vuoto (mq) secondo soglia e modo. */
function detrazione(vuotoMq: number, opz: Required<OpzioniQuantita>): number {
  if (vuotoMq <= opz.sogliaDeduzioneMq + 1e-9) return 0;
  return opz.deduzione === "intera" ? vuotoMq : vuotoMq - opz.sogliaDeduzioneMq;
}

const originiApertura = (a: Apertura) => [origineMisura(a, "larghezza"), origineMisura(a, "altezza"), origineMisura(a, "davanzale")];

function misureLocale(l: Locale, stato: StatoPianta, opz: Required<OpzioniQuantita>): Partial<Record<MisuraLocale, Accumulo>> {
  const oContorno = origineMisura(l, "contorno");
  const oAltezza = origineMisura(l, "altezza");
  const areaMq = areaPoligono(l.contorno) / 10_000;
  const perimetroM = perimetroPoligono(l.contorno) / 100;
  const altezzaM = l.altezza / 100;
  const vani = apertureDelLocale(l, stato, opz.tolleranzaCm);
  const oVani = vani.flatMap(originiApertura);

  const lorde = perimetroM * altezzaM;
  const detratto = vani.reduce((s, a) => s + detrazione(vuotoFino(a, l.altezza) / 10_000, opz), 0);
  const aTerra = vani.filter(a => a.davanzale <= 0);

  const misure: Partial<Record<MisuraLocale, Accumulo>> = {
    pavimento_mq: { valore: areaMq, origini: [oContorno] },
    perimetro_ml: { valore: perimetroM, origini: [oContorno] },
    pareti_lorde_mq: { valore: lorde, origini: [oContorno, oAltezza] },
    pareti_nette_mq: { valore: Math.max(0, lorde - detratto), origini: [oContorno, oAltezza, ...oVani] },
    soffitto_mq: { valore: areaMq, origini: [oContorno] },
    volume_mc: { valore: areaMq * altezzaM, origini: [oContorno, oAltezza] },
    battiscopa_ml: {
      valore: Math.max(0, perimetroM - aTerra.reduce((s, a) => s + a.larghezza, 0) / 100),
      origini: [oContorno, ...aTerra.map(a => origineMisura(a, "larghezza"))],
    },
  };
  const riv = l.finiture?.rivestimento;
  if (riv) {
    const lordo = perimetroM * (riv.altezza / 100);
    const det = vani.reduce((s, a) => s + detrazione(vuotoFino(a, riv.altezza) / 10_000, opz), 0);
    misure.rivestimento_mq = { valore: Math.max(0, lordo - det), origini: [oContorno, l.origine, ...oVani] };
  }
  return misure;
}

function misureMuro(m: Muro, stato: StatoPianta, opz: Required<OpzioniQuantita>) {
  const lunghezzaM = lunghezzaMuro(m) / 100;
  const oBase = [origineMisura(m, "lunghezza"), origineMisura(m, "altezza")];
  const vani = stato.aperture.filter(a => a.muroId === m.id);
  const lorda = lunghezzaM * (m.altezza / 100);
  const det = vani.reduce((s, a) => s + detrazione(vuotoFino(a, m.altezza) / 10_000, opz), 0);
  const origini = [...oBase, ...vani.flatMap(originiApertura)];
  const superficie = Math.max(0, lorda - det);
  return {
    lunghezza: { valore: lunghezzaM, origini: [origineMisura(m, "lunghezza")] },
    superficie: { valore: superficie, origini },
    volume: { valore: superficie * (m.spessore / 100), origini: [...origini, origineMisura(m, "spessore")] },
  };
}
