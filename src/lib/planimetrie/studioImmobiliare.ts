import { areaPoligono, assiDelMuro, interniSovrapposti, lunghezzaMuro, puntoNelPoligono } from "../../../shared/planimetrie/geometria.ts";
import { eAmbienteInterno, funzionePareteDaVerificare, origineMisura, scalaModelloDaVerificare, type Livello, type Locale, type Muro, type Planimetria, type PrezzoVocePlanimetria, type Proposta } from "../../../shared/planimetrie/modello.ts";
import { calcolaQuantita, OPZIONI_QUANTITA_PREDEFINITE, type MappaQuantita } from "../../../shared/planimetrie/quantita.ts";
import { percorsiImpianti, type LineaImpianto } from "../../../shared/planimetrie/impianti.ts";
import { zoneRadianti } from "../../../shared/planimetrie/pavimentoRadiante.ts";
import { circuitiRadianti, nomeCircuito } from "../../../shared/planimetrie/circuitiRadianti.ts";
import { firmaRiscontroTecnico, muriPortantiModificati } from "../../../shared/planimetrie/urbanistica.ts";
import { bozzaVuota, calcolaVoce, misuraVuota, voceVuota, type BozzaComputo } from "@/lib/computo/editorNativo";
import { unitaDellEdificio } from "./unita";
import { NOMI_SANITARI, sanitariNelLocale } from "./spostamentoBagno";
import { percorsiPlanimetrie } from "./render/percorsi";
import { capitoloRigaStudio, eNuovaCostruzione, righeNuovaCostruzione } from "./nuovaCostruzione";

const COMUNI = "Parti comuni";
const SCALA_DA_RISCONTRARE = "Scala del modello da riscontrare";
const STRUTTURA_DA_RISCONTRARE = "Quantità sospesa in attesa del riscontro strutturale nel fascicolo";
const FUNZIONE_DA_RISCONTRARE = "Quantità sospesa in attesa del riscontro della funzione della parete";
export const NOTA_QUANTITA_RIPRESA = "Quantità ripresa dalla revisione precedente. Confrontala con le misure aggiornate della variante.";
const nomeGruppo = (l?: Locale) => l?.unita?.trim() && !/comun|condominial|androne/i.test(l.unita) ? l.unita.trim() : COMUNI;
const etichettaGruppo = (g: string) => g === COMUNI ? g : `Unità ${g}`;
const area = (l: Locale) => areaPoligono(l.contorno) / 10_000;
const arrotonda = (n: number) => Math.round(n * 100) / 100;
const italiano = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 3 });

function gruppoParete(m: Muro, locali: Locale[]): string {
  const { normale } = assiDelMuro(m);
  const x = (m.p1.x + m.p2.x) / 2, y = (m.p1.y + m.p2.y) / 2;
  const d = m.spessore / 2 + 2;
  const lati = [1,-1].flatMap(s => {
    const l = locali.find(l => puntoNelPoligono({ x: x + s*d*normale.x, y: y + s*d*normale.y }, l.contorno));
    return l ? [nomeGruppo(l)] : [];
  });
  return lati.length && lati.every(g => g === lati[0]) ? lati[0] : COMUNI;
}

export interface RigaStudio {
  id: string;
  livelloId: string;
  piano: string;
  fase: string;
  descrizione: string;
  gruppo: string;
  /** «m³» solo per le voci della nuova costruzione (scavi, calcestruzzi). */
  unita: "m²" | "m³" | "cad" | "m" | "a corpo";
  quantita: number | null;
  criterio: string;
  chiave?: string;
  stimata: boolean;
  riferimento?: { tipo: "locale" | "muro" | "apertura"; id: string; fatto?: boolean };
  quantificazioneSospesa?: boolean;
  prezzo?: PrezzoVocePlanimetria;
  /** Nel computo va a parte: proposta al cliente, fuori dal totale dei lavori (le opere esterne di una sopraelevazione). */
  aParte?: boolean;
}

const VOCI_IMPIANTI = [
  { chiave: "impianti:elettrico.corrugato_ml", descrizione: "Corrugato elettrico", unita: "m", fase: "Impianti elettrici", linea: "elettrica" },
  { chiave: "impianti:elettrico.cavo_ml", descrizione: "Cavo unipolare", unita: "m", fase: "Impianti elettrici", linea: "elettrica" },
  { chiave: "impianti:acqua.tubo_ml", descrizione: "Tubi acqua sanitaria", unita: "m", fase: "Impianti idrico-sanitari", linea: "acqua" },
  { chiave: "impianti:scarico.tubo_ml", descrizione: "Tubi di scarico", unita: "m", fase: "Impianti idrico-sanitari", linea: "scarico" },
  { chiave: "impianti:clima.rame_ml", descrizione: "Tubi linea frigorifera", unita: "m", fase: "Impianti di climatizzazione", linea: "frigorifera" },
  { chiave: "impianti:clima.condensa_ml", descrizione: "Tubi di scarico condensa", unita: "m", fase: "Impianti di climatizzazione", linea: "condensa" },
  { chiave: "impianti:riscaldamento.tubo_ml", descrizione: "Mandata e ritorno riscaldamento", unita: "m", fase: "Impianti di riscaldamento", linea: "riscaldamento" },
  { chiave: "elementi:nuovo:quadro_elettrico.numero", descrizione: "Quadro elettrico", unita: "cad", fase: "Impianti elettrici" },
  { chiave: "elementi:nuovo:presa.numero", descrizione: "Punto presa", unita: "cad", fase: "Impianti elettrici" },
  { chiave: "elementi:nuovo:punto_luce.numero", descrizione: "Punto luce", unita: "cad", fase: "Impianti elettrici" },
  { chiave: "elementi:nuovo:interruttore.numero", descrizione: "Punto di comando", unita: "cad", fase: "Impianti elettrici" },
  { chiave: "elementi:nuovo:collettore.numero", descrizione: "Collettore acqua", unita: "cad", fase: "Impianti idrico-sanitari" },
  { chiave: "elementi:nuovo:colonna_scarico.numero", descrizione: "Colonna di scarico proposta", unita: "cad", fase: "Impianti idrico-sanitari" },
] as const;

function impiantiNelComputo(doc: Planimetria, piano: Livello, proposta: Proposta, scalaIncerta: boolean, mappaEdificio: MappaQuantita): RigaStudio[] {
  const ambito = `progetto:${proposta.id}`;
  const mappa = doc.livelli.length === 1 ? mappaEdificio
    : calcolaQuantita({ ...doc, livelli: [{ ...piano, proposte: [proposta] }] });
  const disegnati = new Map<LineaImpianto, number>();
  if (proposta.tracciatiImpianti?.length) for (const p of percorsiImpianti(proposta).percorsi) {
    if (p.vertici) disegnati.set(p.linea, (disegnati.get(p.linea) ?? 0) + 1);
  }
  return VOCI_IMPIANTI.flatMap(voce => {
    const dopo = mappa[`${ambito}:${voce.chiave}`]?.valore ?? 0;
    const prima = voce.unita === "m" ? mappa[`fatto:${voce.chiave}`]?.valore ?? 0 : 0;
    if (dopo <= prima) return [];
    const sospesa = voce.unita === "m" && scalaIncerta;
    const quanti = "linea" in voce ? disegnati.get(voce.linea) ?? 0 : 0;
    return [{
      id: `impianto-${piano.id}-${voce.chiave}`, livelloId: piano.id, piano: piano.nome, fase: voce.fase,
      descrizione: voce.descrizione, gruppo: "Impianti del piano", unita: voce.unita,
      quantita: sospesa ? null : arrotonda(dopo - prima),
      criterio: sospesa ? SCALA_DA_RISCONTRARE : quanti
        ? `Incremento dalla tavola con ${quanti} ${quanti === 1 ? "tratto disegnato" : "tratti disegnati"}. Calate e raccordi da riscontrare.` : voce.unita === "m"
        ? "Incremento stimato dalla tavola rispetto allo stato di fatto. Conferma percorso e dimensioni."
        : "Elementi nuovi nella variante. Conferma tipo e posizione.",
      stimata: true, quantificazioneSospesa: sospesa,
    }];
  });
}

function radianteNelComputo(piano: Livello, proposta: Proposta, scalaIncerta: boolean): RigaStudio[] {
  const precedenti = new Map(zoneRadianti(piano.fatto).map(z => [z.locale.id, z]));
  const circuiti = circuitiRadianti(proposta);
  const retiUguali = JSON.stringify(piano.fatto.collettoreRadiante) === JSON.stringify(proposta.collettoreRadiante);
  const numero = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
  const righe = zoneRadianti(proposta).flatMap(({ locale, zona, superficieMq, tuboM }): RigaStudio[] => {
    const prima = precedenti.get(locale.id);
    const zonaUguale = prima && prima.zona.passoCm === zona.passoCm && prima.zona.superficieEsclusaMq === zona.superficieEsclusaMq &&
      prima.locale.contorno.length === locale.contorno.length &&
      locale.contorno.every(p => prima.locale.contorno.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 0.1));
    if (zonaUguale && retiUguali) return [];
    const base: Pick<RigaStudio, "livelloId" | "piano" | "fase" | "gruppo" | "criterio" | "stimata" | "quantificazioneSospesa" | "riferimento"> = {
      livelloId: piano.id, piano: piano.nome, fase: "Impianti di riscaldamento", gruppo: etichettaGruppo(nomeGruppo(locale)),
      criterio: scalaIncerta ? SCALA_DA_RISCONTRARE :
        `Passo ${zona.passoCm.toLocaleString("it-IT")} cm. Dimensiona circuiti, collegamenti al collettore e posa.`,
      stimata: true, quantificazioneSospesa: scalaIncerta, riferimento: { tipo: "locale", id: locale.id },
    };
    const chiave = `progetto:${proposta.id}:locale:${locale.id}`;
    const delLocale = circuiti.filter(c => c.localeId === locale.id);
    const locali: RigaStudio[] = [
      ...(!zonaUguale ? [{ ...base, id: `${locale.id}-radiante-pannelli`, descrizione: `Pannelli per pavimento radiante · ${locale.nome}`,
        chiave: `${chiave}.radiante_mq`, unita: "m²" as const, quantita: scalaIncerta ? null : arrotonda(superficieMq) }] : []),
      ...delLocale.map(c => ({ ...base, id: `${locale.id}-radiante-circuito-${c.numero}`, descrizione: `Tubo radiante · ${nomeCircuito(c)}`,
        chiave: `${chiave}.radiante_circuito_${c.numero}_ml`, unita: "m" as const, quantita: scalaIncerta ? null : arrotonda(c.totaleM),
        criterio: scalaIncerta ? SCALA_DA_RISCONTRARE :
          `Passo ${numero(zona.passoCm)} cm. Mandata ${numero(c.mandataM)} m, serpentina ${numero(c.tuboAttivoM)} m, ritorno ${numero(c.ritornoM)} m.` })),
    ];
    if (!delLocale.length && !zonaUguale) locali.push({ ...base, id: `${locale.id}-radiante-tubo`, descrizione: `Tubo per pavimento radiante · ${locale.nome}`,
      chiave: `${chiave}.radiante_tubo_ml`, unita: "m", quantita: scalaIncerta ? null : arrotonda(tuboM) });
    return locali;
  });
  if (proposta.collettoreRadiante && !piano.fatto.collettoreRadiante) righe.push({
    id: `impianto-${piano.id}-radiante-collettore`, livelloId: piano.id, piano: piano.nome, fase: "Impianti di riscaldamento", gruppo: "Impianti del piano",
    descrizione: "Collettore per pavimento radiante", unita: "cad", quantita: 1, stimata: false,
    criterio: `${circuiti.length} circuiti stimati. Verifica numero di uscite e componenti di regolazione.`,
  });
  return righe;
}

function verificheBilocaliNelComputo(piano: Livello, proposta: Proposta): RigaStudio[] {
  if (!proposta.distribuzioneBilocali) return [];
  const righe: RigaStudio[] = [];
  const cucineSeparate = new Set(proposta.locali.filter(l => l.destinazione === "cucina").map(nomeGruppo));
  const riga = (l: Locale, tipo: string, fase: string, descrizione: string, criterio: string, unita: RigaStudio["unita"] = "a corpo"): RigaStudio => ({
    id: l.id + "-" + tipo, livelloId: piano.id, piano: piano.nome, fase, descrizione,
    gruppo: etichettaGruppo(nomeGruppo(l)), unita, quantita: null, criterio, stimata: true, riferimento:{tipo:"locale",id:l.id},
  });
  for (const l of proposta.locali) {
    if (l.destinazione === "bagno" && !proposta.spostamentiBagno?.some(s => s.destinazioneId === l.id)) {
      righe.push(
        riga(l, "reti-bagno", "Impianti idrico-sanitari", "Allacci acqua e scarichi del bagno", "Rileva colonna, pendenze, tracciato e attacchi"),
        riga(l, "aerazione-bagno", "Ventilazione", "Aerazione del bagno", "Verifica ventilazione disponibile e percorso di espulsione"),
      );
    }
    const gruppo = nomeGruppo(l);
    const zonaCottura = l.destinazione === "cucina" || (l.destinazione === "soggiorno" && !cucineSeparate.has(gruppo));
    if (gruppo !== COMUNI && zonaCottura && !proposta.spostamentiCucina?.some(s => s.destinazioneId === l.id)) {
      const zona = l.destinazione === "cucina" ? "della cucina" : "dell’angolo cottura";
      righe.push(riga(l, "reti-cottura", "Impianti idrico-sanitari", `Allacci e aspirazione ${zona}`, "Definisci apparecchi, scarico e percorso di estrazione"));
    }
    if (l.destinazione === "soggiorno" && gruppo !== COMUNI) {
      righe.push(riga(l, "elettrico-unita", "Impianti elettrici", "Quadro, punti e linee elettriche dell’unità", "Definisci dotazioni, punti e percorsi"));
    }
  }
  const parteRecuperata = proposta.locali.find(l => eAmbienteInterno(l) && !l.finiture?.pavimento);
  if (parteRecuperata && proposta.muri.some(m => m.stato === "da_demolire")) {
    righe.push({ ...riga(parteRecuperata, "ripristino-pavimento", "Finiture", "Ripristini localizzati dei pavimenti in recupero",
      "Rileva le fasce sotto i tramezzi e le tracce impiantistiche", "m²"), gruppo: COMUNI });
  }
  return righe;
}

function computoSpostamentiBagno(piano: Livello, proposta: Proposta, mappa: MappaQuantita) {
  const righe: RigaStudio[] = [];
  const pavimenti = new Set<string>(), rivestimenti = new Set<string>();
  const spostamenti = [], daRivedere: string[] = [];
  for (const s of proposta.spostamentiBagno ?? []) {
    const origine = piano.fatto.locali.find(l => l.id === s.origineId);
    const ex = proposta.locali.find(l => l.id === s.origineId);
    const nuovo = proposta.locali.find(l => l.id === s.destinazioneId);
    if (!origine || !ex || !nuovo || ex.destinazione === "bagno" || nuovo.destinazione !== "bagno") {
      daRivedere.push(piano.nome);
      continue;
    }
    const presenti = sanitariNelLocale(piano.fatto.elementi, origine);
    const tipiPosati = new Set(sanitariNelLocale(proposta.elementi, nuovo).map(e => e.tipo));
    const prima = piano.fatto.locali.find(l => l.id === nuovo.id);
    spostamenti.push({
      id: s.id, livelloId:piano.id, piano:piano.nome, origine, ex, prima, nuovo,
      daPosizionare: s.sanitari.filter(t => !tipiPosati.has(t)).map(t => NOMI_SANITARI[t]),
    });
    pavimenti.add(ex.id);
    pavimenti.add(nuovo.id);
    rivestimenti.add(nuovo.id);
    const riga = (locale: Locale, codice: string, fase: string, descrizione: string, unita: RigaStudio["unita"], criterio: string, quantita: number | null = null, stimata = false, chiave?: string): RigaStudio => ({
      id: `bagno-${s.id}-${codice}`, livelloId: piano.id, piano: piano.nome, gruppo: etichettaGruppo(nomeGruppo(locale)), fase, descrizione, unita, criterio, quantita, stimata, chiave,
      riferimento:{tipo:"locale",id:locale.id,fatto:chiave?.startsWith("fatto:")},
    });
    const mq = (locale: Locale, codice: string, fase: string, descrizione: string, criterio: string, campo: "pavimento_mq" | "rivestimento_mq" = "pavimento_mq", stato = `progetto:${proposta.id}`) => {
      const chiave = `${stato}:locale:${locale.id}.${campo}`;
      const q = mappa[chiave];
      const scalaMancante = scalaModelloDaVerificare(piano);
      return {...riga(locale, codice, fase, descrizione, "m²", scalaMancante ? SCALA_DA_RISCONTRARE : criterio,
        q && !scalaMancante ? arrotonda(q.valore) : null, q?.origine === "stimata", q ? chiave : undefined), quantificazioneSospesa:scalaMancante};
    };
    righe.push(
      riga(ex, "rimozione", "Demolizioni", "Rimozione sanitari esistenti", "cad",
        presenti.length ? "Apparecchi disegnati nel bagno attuale · verifica sul posto" : "Conta gli apparecchi presenti nel bagno attuale",
        presenti.length || null, presenti.some(e => e.origine === "stimata")),
      mq(nuovo, "demolizione-pavimento", "Demolizioni", "Rimozione pavimento nel nuovo bagno",
        "Intero contorno del nuovo bagno · verifica pavimento e sottofondo", "pavimento_mq", prima ? "fatto" : undefined),
      riga(ex, "smaltimento", "Demolizioni", "Trasporto e smaltimento dei materiali rimossi", "a corpo", "Da stimare in base ai materiali effettivamente rimossi"),
      riga(ex, "dismissione", "Impianti", "Dismissione allacci del vecchio bagno", "a corpo", "Verifica punti di intercettazione e collegamenti esistenti"),
      riga(nuovo, "adduzioni", "Impianti", "Nuove adduzioni acqua", "m", "Misura le linee dal collettore ai nuovi apparecchi"),
      riga(nuovo, "scarichi", "Impianti", "Nuovi scarichi", "m", "Rileva percorso, pendenza e punto di innesto alla colonna"),
      riga(nuovo, "ventilazione", "Impianti", "Ventilazione del nuovo bagno", "a corpo", "Verifica aerazione e necessità di estrazione meccanica"),
      riga(nuovo, "elettrico", "Impianti", "Adeguamento elettrico del nuovo bagno", "a corpo", "Da definire dopo il rilievo dei punti luce e delle alimentazioni"),
      mq(nuovo, "impermeabilizzazione", "Finiture", "Impermeabilizzazione a pavimento", "Superficie netta del nuovo bagno · risvolti da dettagliare"),
      mq(nuovo, "pavimento", "Finiture", "Posa pavimento nel nuovo bagno", "Superficie netta del nuovo bagno"),
      mq(nuovo, "rivestimento", "Finiture", "Rivestimento pareti del nuovo bagno", nuovo.finiture?.rivestimento
        ? `Perimetro × ${italiano(nuovo.finiture.rivestimento.altezza / 100)} m · detrazione dei vuoti oltre ${OPZIONI_QUANTITA_PREDEFINITE.sogliaDeduzioneMq} m²`
        : "Definisci altezza e pareti da rivestire", "rivestimento_mq"),
      mq(ex, "ripristino", "Finiture", "Ripristino pavimento dell’ex bagno", "Superficie netta del locale da ripristinare"),
      ...s.sanitari.map(tipo => riga(nuovo, tipo, "Sanitari", `Fornitura e posa · ${NOMI_SANITARI[tipo]}`, "cad",
        tipiPosati.has(tipo) ? "Apparecchio previsto nella variante" : "Apparecchio previsto · posizione da definire", 1)),
    );
  }
  return { righe, pavimenti, rivestimenti, spostamenti, daRivedere };
}

function computoSpostamentiCucina(piano: Livello, proposta: Proposta, mappa: MappaQuantita) {
  const righe: RigaStudio[] = [];
  const pavimenti = new Set<string>(), spostamenti = [], daRivedere: string[] = [];
  const scalaMancante = scalaModelloDaVerificare(piano);
  for (const s of proposta.spostamentiCucina ?? []) {
    const origine = piano.fatto.locali.find(l => l.id === s.origineId);
    const ex = proposta.locali.find(l => l.id === s.origineId);
    const nuovo = proposta.locali.find(l => l.id === s.destinazioneId);
    if (!origine || !ex || !nuovo || ex.destinazione === "cucina" || nuovo.destinazione !== "cucina") {
      daRivedere.push(piano.nome);
      continue;
    }
    const prima = piano.fatto.locali.find(l => l.id === nuovo.id);
    const lineari = proposta.elementi.filter(e => e.tipo === "cucina" && e.stato !== "da_demolire" && puntoNelPoligono(e.posizione,nuovo.contorno));
    const lunghezza = arrotonda(lineari.reduce((l,e) => l+e.larghezza/100,0));
    spostamenti.push({ id:s.id, livelloId:piano.id, piano:piano.nome, origine, ex, prima, nuovo, lunghezza });
    pavimenti.add(nuovo.id);
    const riga = (locale: Locale, codice: string, fase: string, descrizione: string, unita: RigaStudio["unita"], criterio: string): RigaStudio => ({
      id:`cucina-${s.id}-${codice}`, livelloId:piano.id, piano:piano.nome, gruppo:etichettaGruppo(nomeGruppo(locale)), fase, descrizione, unita, criterio,
      quantita:null, stimata:false, riferimento:{tipo:"locale",id:locale.id},
    });
    const pavimento = (codice: string, fase: string, descrizione: string, ambito: string): RigaStudio => {
      const chiave = `${ambito}:locale:${nuovo.id}.pavimento_mq`, q = mappa[chiave];
      const r = riga(nuovo,codice,fase,descrizione,"m²",scalaMancante ? SCALA_DA_RISCONTRARE : "Superficie netta della nuova cucina");
      return { ...r, chiave:q ? chiave : undefined, quantita:q && !scalaMancante ? arrotonda(q.valore) : null, stimata:q?.origine === "stimata",
        riferimento:{tipo:"locale",id:nuovo.id,fatto:ambito==="fatto"}, quantificazioneSospesa:scalaMancante };
    };
    righe.push(
      riga(ex,"smontaggio","Demolizioni","Smontaggio della cucina esistente","a corpo","Definisci elementi da recuperare e materiali da smaltire"),
      pavimento("rimozione-pavimento","Demolizioni","Rimozione pavimento · nuova cucina",prima ? "fatto" : `progetto:${proposta.id}`),
      riga(ex,"dismissione","Impianti","Dismissione attacchi della vecchia cucina","a corpo","Verifica intercettazioni, alimentazioni e punti di chiusura"),
      riga(nuovo,"adduzione","Impianti","Adduzione acqua · nuova cucina","m","Misura il percorso fino al lavello"),
      riga(nuovo,"scarico","Impianti","Scarico lavello · nuova cucina","m","Rileva la lunghezza, il punto di innesto e la pendenza"),
      riga(nuovo,"elettrico","Impianti","Prese e alimentazioni · nuova cucina","a corpo","Verifica carichi e posizioni degli elettrodomestici"),
      riga(nuovo,"cappa","Impianti","Ventilazione · nuova cucina","a corpo","Scegli il tipo di cappa e verifica l’eventuale percorso di espulsione"),
      pavimento("posa-pavimento","Finiture","Posa pavimento · nuova cucina",`progetto:${proposta.id}`),
      riga(ex,"ripristino","Finiture","Ripristino finiture ex cucina","a corpo","Verifica le superfici dopo lo smontaggio e la chiusura delle tracce"),
      { ...riga(nuovo,"arredo","Cucina","Fornitura e montaggio cucina lineare","m",
        scalaMancante ? SCALA_DA_RISCONTRARE : lunghezza ? "Larghezza dei moduli disegnati · verifica dotazione e ingombri" : "Completa il disegno o misura la composizione"),
        quantita:!scalaMancante && lunghezza > 0 ? lunghezza : null, stimata:lineari.some(e => e.origine === "stimata"), quantificazioneSospesa:scalaMancante },
    );
  }
  return { righe, pavimenti, spostamenti, daRivedere };
}

export function studioVariante(doc: Planimetria, variante: string | null) {
  const ambito = variante ? `progetto:${variante}` : "fatto";
  const mappa = calcolaQuantita(doc);
  const righe: RigaStudio[] = [], sovrapposti: string[] = [];
  const bagni: ReturnType<typeof computoSpostamentiBagno>["spostamenti"] = [], bagniDaRivedere = new Set<string>();
  const cucine: ReturnType<typeof computoSpostamentiCucina>["spostamenti"] = [], cucineDaRivedere = new Set<string>();
  const paretiDaRiscontrare: { livelloId: string; muroId: string }[] = [];
  let comuni = 0, esterniComuni = 0, senzaUnita = 0, muriMq = 0, scalaIncerta = false;
  // In una nuova costruzione il disegno è il progetto: le sue misure sono di progetto, non un rilievo da verificare.
  const progetto = eNuovaCostruzione(doc);
  for (const piano of doc.livelli) {
    const p = piano.proposte.find(x => x.id === variante);
    const l = p?.locali ?? piano.fatto.locali;
    const scalaNonCalibrata = scalaModelloDaVerificare(piano);
    if (scalaNonCalibrata) scalaIncerta = true;
    for (let i=0; i<l.length; i++) {
      const mq = area(l[i]);
      const interno = eAmbienteInterno(l[i]);
      if (interno && !l[i].unita?.trim()) senzaUnita += mq;
      else if (l[i].unita?.trim() && nomeGruppo(l[i]) === COMUNI) {
        if (interno) comuni += mq;
        else esterniComuni += mq;
      }
      if (!progetto && origineMisura(l[i], "contorno") === "stimata") scalaIncerta = true;
      for (const altro of l.slice(i+1)) {
        if (interniSovrapposti(l[i].contorno, altro.contorno)) sovrapposti.push(`${piano.nome} · ${l[i].nome} / ${altro.nome}`);
      }
    }
    if (!p) continue;
    const struttureSospese = new Set(muriPortantiModificati(piano,p.id).filter(m=>!doc.urbanistica?.riscontriTecnici?.some(r=>
      r.varianteId===p.id && r.livelloId===piano.id && r.criterio==="struttura" && r.muroId===m.id && r.esito==="riscontrato"
      && r.firma===firmaRiscontroTecnico(doc,r))).map(m=>m.id));
    for (const muroId of struttureSospese) paretiDaRiscontrare.push({livelloId:piano.id,muroId});
    const spostamenti = computoSpostamentiBagno(piano, p, mappa);
    const spostamentiCucina = computoSpostamentiCucina(piano, p, mappa);
    righe.push(...spostamenti.righe, ...spostamentiCucina.righe);
    bagni.push(...spostamenti.spostamenti);
    cucine.push(...spostamentiCucina.spostamenti);
    spostamenti.daRivedere.forEach(nome => bagniDaRivedere.add(nome));
    spostamentiCucina.daRivedere.forEach(nome => cucineDaRivedere.add(nome));
    const paretiFrazionamento = new Set(p.frazionamenti?.flatMap(f => f.pareti));
    // In coda al piano, dopo pareti, aperture e finiture: l'ordine delle voci principali non cambia.
    const indotte: RigaStudio[] = [];
    for (const m of p.muri) {
      if (m.stato === "esistente") continue;
      const nuovo = m.stato === "nuovo";
      const prima = nuovo ? undefined : piano.fatto.muri.find(x=>x.id===m.id);
      const misurato = prima ?? m;
      const chiave = `${ambito}:muro:${m.id}.superficie_mq`;
      const q = mappa[chiave];
      const lunghezza = lunghezzaMuro(misurato) / 100, altezza = misurato.altezza / 100;
      const altezzaDaVerificare = !progetto && origineMisura(misurato, "altezza") === "stimata";
      const haVani = (prima ? piano.fatto : p).aperture.some(a => a.muroId === m.id && a.stato!=="da_demolire");
      const deduzione = q ? arrotonda(lunghezza*altezza-q.valore) : 0;
      const vuoti = deduzione > 0 ? ` − ${italiano(deduzione)} m² di vuoti detraibili`
        : haVani ? ` · vuoti fino a ${OPZIONI_QUANTITA_PREDEFINITE.sogliaDeduzioneMq} m² inclusi` : "";
      const funzioneIncerta = !nuovo && funzionePareteDaVerificare(misurato);
      const strutturaSospesa = funzioneIncerta || struttureSospese.has(m.id);
      if (nuovo && (p.distribuzioneBilocali || paretiFrazionamento.has(m.id))) muriMq += lunghezza * m.spessore / 100;
      righe.push({
        id: m.id, livelloId: piano.id, piano: piano.nome, fase: nuovo ? "Murature" : "Demolizioni",
        descrizione: nuovo ? (m.tipo === "tramezzo" ? "Nuovo tramezzo" : "Nuova muratura")
          : m.tipo === "tramezzo" && !funzioneIncerta ? "Demolizione tramezzo" : "Demolizione parete",
        gruppo: etichettaGruppo(gruppoParete(m,l)), unita: "m²", chiave,
        quantita: q && !altezzaDaVerificare && !scalaNonCalibrata && !strutturaSospesa ? arrotonda(q.valore) : null,
        criterio: funzioneIncerta ? FUNZIONE_DA_RISCONTRARE : strutturaSospesa ? STRUTTURA_DA_RISCONTRARE : scalaNonCalibrata ? SCALA_DA_RISCONTRARE : altezzaDaVerificare ? `Lunghezza ${italiano(lunghezza)} m · altezza da verificare` :
          `${italiano(lunghezza)} m × ${italiano(altezza)} m${vuoti}`,
        stimata: q?.origine === "stimata", riferimento:{tipo:"muro",id:m.id,fatto:!!prima}, quantificazioneSospesa:strutturaSospesa || scalaNonCalibrata,
      });
      // Le lavorazioni che una parete si porta dietro: chi demolisce porta via le macerie e
      // richiude la traccia nel pavimento; chi costruisce intonaca, tinteggia e mette il battiscopa
      // sulle due facce. Si calcolano solo quando la parete stessa ha una quantità certa.
      const principale = righe[righe.length - 1];
      if (principale.quantita !== null) {
        const indotta = (codice: string, fase: string, descrizione: string, unita: RigaStudio["unita"], quantita: number, criterio: string): RigaStudio => ({
          id: `${m.id}-${codice}`, livelloId: piano.id, piano: piano.nome, fase, descrizione, gruppo: principale.gruppo, unita,
          quantita: arrotonda(quantita), criterio, stimata: principale.stimata, riferimento: principale.riferimento,
        });
        const spessore = misurato.spessore / 100;
        if (nuovo) {
          const porte = p.aperture.filter(a => a.muroId === m.id && a.stato !== "da_demolire" && a.tipo !== "finestra")
            .reduce((s, a) => s + a.larghezza / 100, 0);
          indotte.push(
            indotta("intonaco", "Intonaci", "Intonaco sulle due facce della nuova parete", "m²", principale.quantita * 2, `2 facce × ${italiano(principale.quantita)} m²`),
            indotta("tinteggiatura", "Tinteggiature", "Tinteggiatura delle due facce della nuova parete", "m²", principale.quantita * 2, `2 facce × ${italiano(principale.quantita)} m²`),
            indotta("battiscopa", "Finiture", "Battiscopa ai piedi della nuova parete", "m", Math.max(0, (lunghezza - porte) * 2),
              `2 lati × (${italiano(lunghezza)} m${porte ? ` − ${italiano(porte)} m di porte` : ""})`),
          );
        } else {
          indotte.push(
            indotta("macerie", "Demolizioni", "Carico, trasporto e smaltimento delle macerie", "a corpo", 1,
              `${italiano(arrotonda(lunghezza * altezza * spessore))} m³ di macerie · ${italiano(lunghezza)} m × ${italiano(altezza)} m × ${italiano(misurato.spessore)} cm`),
            indotta("ripristino", "Finiture", "Ripristino del pavimento nella traccia della parete demolita", "m²", lunghezza * spessore,
              `${italiano(lunghezza)} m × ${italiano(misurato.spessore)} cm di traccia`),
          );
        }
      }
    }
    for (const a of p.aperture) {
      const prima = piano.fatto.aperture.find(x => x.id === a.id);
      const varia = prima && (prima.larghezza !== a.larghezza || prima.altezza !== a.altezza || prima.tipo !== a.tipo
        || prima.offset!==a.offset || prima.muroId!==a.muroId || prima.davanzale!==a.davanzale);
      if (a.stato === "esistente" && !varia) continue;
      const m = p.muri.find(m => m.id === a.muroId);
      const chiusura = a.stato==="da_demolire" && m?.stato!=="da_demolire";
      const misurata = a.stato==="da_demolire" ? prima ?? a : a;
      const chiave = chiusura ? `${prima ? "fatto" : ambito}:apertura:${a.id}.superficie_mq` : undefined;
      const q = chiave ? mappa[chiave] : undefined;
      const funzioneIncerta = a.stato !== "da_demolire" && m && m.stato !== "nuovo" && funzionePareteDaVerificare(m);
      const sospesa = funzioneIncerta || struttureSospese.has(a.muroId) || !!(prima && struttureSospese.has(prima.muroId));
      const nome = { porta:"porta", finestra:"finestra", portafinestra:"portafinestra", varco:"varco" }[a.tipo];
      righe.push({
        id: a.id, livelloId: piano.id, piano: piano.nome, fase: chiusura ? "Murature" : "Aperture", gruppo: etichettaGruppo(m ? gruppoParete(m,l) : COMUNI),
        descrizione: `${a.stato === "da_demolire" ? (chiusura ? "Chiusura" : "Rimozione")
          : a.stato === "nuovo" ? "Realizzazione" : "Modifica"} ${nome}`,
        unita: chiusura ? "m²" : "cad", chiave,
        quantita: sospesa || (chiusura && scalaNonCalibrata) ? null : chiusura ? q?.valore ?? null : 1,
        criterio: funzioneIncerta ? FUNZIONE_DA_RISCONTRARE : sospesa ? STRUTTURA_DA_RISCONTRARE : chiusura && scalaNonCalibrata ? SCALA_DA_RISCONTRARE
          : chiusura ? `${italiano(misurata.larghezza/100)} m × ${italiano(misurata.altezza/100)} m · superficie del vano da chiudere`
            : `${italiano(misurata.larghezza)} × ${italiano(misurata.altezza)} cm`,
        stimata: origineMisura(misurata,"larghezza") === "stimata" || origineMisura(misurata,"altezza") === "stimata",
        riferimento:{tipo:"apertura",id:a.id,fatto:a.stato==="da_demolire" && !!prima}, quantificazioneSospesa:sospesa || (chiusura && scalaNonCalibrata),
      });
    }
    for (const loc of l) {
      const origine = p.frazionamenti?.find(f => f.parti.includes(loc.id))?.localeId;
      const prima = piano.fatto.locali.find(x => x.id === (origine ?? loc.id));
      for (const campo of ["pavimento", "rivestimento"] as const) {
        if (campo === "pavimento" ? spostamenti.pavimenti.has(loc.id) || spostamentiCucina.pavimenti.has(loc.id)
          : spostamenti.rivestimenti.has(loc.id)) continue;
        const finitura = loc.finiture?.[campo];
        if (!finitura || JSON.stringify(finitura) === JSON.stringify(prima?.finiture?.[campo])) continue;
        const chiave = `${ambito}:locale:${loc.id}.${campo}_mq`, q = mappa[chiave];
        righe.push({
          id: `${loc.id}-${campo}`, livelloId: piano.id, piano: piano.nome, fase: "Finiture", gruppo: etichettaGruppo(nomeGruppo(loc)),
          descrizione: campo === "pavimento" ? `Posa pavimento · ${loc.nome}` : `Rivestimento · ${loc.nome}`,
          unita:"m²", quantita: q && !scalaNonCalibrata ? arrotonda(q.valore) : null, chiave,
          criterio: scalaNonCalibrata ? SCALA_DA_RISCONTRARE : campo === "pavimento" ? "Superficie netta del contorno interno" : "Perimetro × altezza, al netto dei vuoti",
          stimata: q?.origine === "stimata", riferimento:{tipo:"locale",id:loc.id}, quantificazioneSospesa:scalaNonCalibrata,
        });
      }
    }
    righe.push(...indotte, ...impiantiNelComputo(doc, piano, p, scalaNonCalibrata, mappa), ...radianteNelComputo(piano, p, scalaNonCalibrata),
      ...verificheBilocaliNelComputo(piano, p));
  }
  if (eNuovaCostruzione(doc)) aggiungiNuovaCostruzione(doc, variante, righe);
  const prezzi = new Map(doc.livelli.map(p => [p.id, p.proposte.find(pr => pr.id === variante)?.prezziLavorazioni]));
  const righeConPrezzi = righe.map(r => {
    const importi = prezzi.get(r.livelloId);
    const prezzo = importi && Object.hasOwn(importi, r.id) ? importi[r.id] : undefined;
    return prezzo?.unita === r.unita ? { ...r, prezzo } : r;
  });
  return { unita: unitaDellEdificio(doc,ambito), comuni:arrotonda(comuni), esterniComuni:arrotonda(esterniComuni), senzaUnita:arrotonda(senzaUnita), muriMq:arrotonda(muriMq),
    scalaIncerta, sovrapposti, righe: righeConPrezzi, bagni, cucine, paretiDaRiscontrare, bagniDaRivedere:[...bagniDaRivedere], cucineDaRivedere:[...cucineDaRivedere] };
}

export function importiLavorazioni(righe: RigaStudio[]) {
  const valorizzate = righe.filter(r => r.quantita !== null && r.prezzo?.unita === r.unita);
  return {
    importo: valorizzate.length ? arrotonda(valorizzate.reduce((s, r) => s + arrotonda(r.quantita! * r.prezzo!.importo), 0)) : null,
    daQuotare: righe.filter(r => !r.prezzo).length,
    daMisurare: righe.filter(r => r.quantita === null).length,
  };
}

export interface FonteStudio { planimetriaId: string; versione: number; varianteId: string }

/** Lavorazione che discende da una parete (macerie, ripristino, intonaco, tinteggiatura, battiscopa). */
export const eLavorazioneIndotta = (r: Pick<RigaStudio, "id">) => /-(macerie|ripristino|intonaco|tinteggiatura|battiscopa)$/.test(r.id);

export function differenzeLavorazioni(prima: RigaStudio[], dopo: RigaStudio[]) {
  const chiave = (r: RigaStudio) => `${r.livelloId}:${r.id}`;
  const precedenti = new Map(prima.map(r=>[chiave(r),r]));
  const attuali = new Map(dopo.map(r=>[chiave(r),r]));
  return [...new Set([...attuali.keys(),...precedenti.keys()])].flatMap(id=>{
    const a = precedenti.get(id), b = attuali.get(id);
    if (a && b && a.quantita===b.quantita && a.unita===b.unita) return [];
    return [{prima:a,dopo:b,delta:a?.quantita!=null && b?.quantita!=null && a.unita===b.unita ? arrotonda(b.quantita-a.quantita) : null}];
  });
}

export function percorsoMisuraSullaPianta(f: FonteStudio, r: RigaStudio): string | undefined {
  if (!r.riferimento) return undefined;
  const {tipo,id,fatto} = r.riferimento;
  const params = new URLSearchParams({versione:String(f.versione),livello:r.livelloId,
    ambito:fatto ? "fatto" : `progetto:${f.varianteId}`,[tipo]:id});
  if (tipo==="apertura") params.set("sezione","verifica");
  return percorsiPlanimetrie.pianta(f.planimetriaId)+"?"+params;
}

export function fonteStudioDaArea(area: Record<string, unknown> | undefined): FonteStudio | null {
  const id=area?.planimetria_id, versione=area?.planimetria_versione, variante=area?.variante;
  return typeof id==="string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)
    && typeof versione==="number" && Number.isSafeInteger(versione) && versione>0
    && typeof variante==="string" && /^[-\w]{1,36}$/.test(variante) ? {planimetriaId:id,versione,varianteId:variante} : null;
}

/** Una bozza distinta per versione e variante, riapribile dal computo nativo. */
export async function idComputoStudio(f: FonteStudio) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`computo-planimetria:${f.planimetriaId}:${f.versione}:${f.varianteId}`)));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes.slice(0,16), b => b.toString(16).padStart(2,"0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

/** Quantità e riga di misura della variante, riutilizzabili senza cambiare i prezzi. */
export function misuraRigaStudio(r: RigaStudio) {
  return {
    unita: r.unita, quantita: r.quantita === null ? "" : String(r.quantita), daQuantificare: r.quantita === null,
    corpo: r.unita === "a corpo", chiavePlanimetria: r.quantita === null ? undefined : r.chiave,
    misure: r.quantita === null ? [] : [{ ...misuraVuota(), descrizione: r.criterio, parti: String(r.quantita) }],
  };
}

const NUMERO_CAPITOLO = /^(\d{2}) /;
/** Ordine stabile: prima i capitoli numerati, per numero; gli altri dopo, come sono arrivati. */
function inOrdineDiCapitolo(righe: RigaStudio[]): RigaStudio[] {
  if (!righe.some((r) => NUMERO_CAPITOLO.test(r.gruppo))) return righe;
  const numero = (r: RigaStudio) => Number(NUMERO_CAPITOLO.exec(r.gruppo)?.[1] ?? 100);
  return righe.map((r, i) => ({ r, i })).sort((a, b) => numero(a.r) - numero(b.r) || a.i - b.i).map(({ r }) => r);
}

export function computoStudio(fonte: FonteStudio, titolo: string, righe: RigaStudio[], verificheAperte = true): BozzaComputo {
  return {
    ...bozzaVuota(), titolo: titolo.slice(0,160), fontePlanimetria: fonte, mostraMisurePdf: true, mostraFontiPdf: true,
    oggetto: `Computo preliminare · variante ${fonte.varianteId} · planimetria v${fonte.versione}${verificheAperte ? " · verifiche urbanistiche aperte" : ""}`,
    // I capitoli numerati della nuova costruzione («01 Opere provvisionali» … «12 Sistemazioni
    // esterne») escono nell'ordine del cantiere, non in quello in cui le righe sono nate (25/11/2026).
    voci: inOrdineDiCapitolo(righe).map((r) => ({
      ...voceVuota(), id:r.id, capitolo:r.gruppo, categoria:r.fase,
      descrizione:`${r.descrizione}\n${r.piano} · ${r.criterio}`,
      ...misuraRigaStudio(r),
      ...(r.prezzo ? { prezzo: String(r.prezzo.importo), fonte: r.prezzo.fonte, tariffa: r.prezzo.tariffa } : {}),
      ...(r.aParte ? { opzionale: true } : {}),
      noteMisure:r.stimata ? "Quantità indicativa. Verifica le misure di riferimento." : "",
    })),
  };
}

/** Aggiorna la geometria della nuova revisione e riporta le modifiche esplicite dalla bozza di partenza. */
export function computoStudioRevisionato(nuovo: BozzaComputo, precedente: BozzaComputo, generatoPrima: BozzaComputo, sospese = new Set<string>()): BozzaComputo {
  const prima = new Map(precedente.voci.map(v=>[v.id,v]));
  const modello = new Map(generatoPrima.voci.map(v=>[v.id,v]));
  const ids = new Set(nuovo.voci.map(v=>v.id));
  return {...nuovo, voci:[
    ...nuovo.voci.map(v=>{
      const p=prima.get(v.id), base=modello.get(v.id);
      if (!p || !base || v.unita !== base.unita) return v;
      const quantitaManuale = !sospese.has(v.id) && (p.daQuantificare !== base.daQuantificare || p.unita !== base.unita
        || calcolaVoce(p).quantita !== calcolaVoce(base).quantita);
      const nota = quantitaManuale ? NOTA_QUANTITA_RIPRESA : "";
      const prezzoNuovo = !!v.prezzo && (v.prezzo !== base.prezzo || v.fonte !== base.fonte || v.tariffa !== base.tariffa);
      return {...v, ...(prezzoNuovo ? {} : { prezzo:p.prezzo, fonte:p.fonte, tariffa:p.tariffa }), costo:p.costo, sicurezza:p.sicurezza,
        detrazione:p.detrazione, corpo:p.corpo, opzionale:p.opzionale, descrizione:p.descrizione===base.descrizione ? v.descrizione : p.descrizione,
        capitolo:p.capitolo===base.capitolo ? v.capitolo : p.capitolo, categoria:p.categoria===base.categoria ? v.categoria : p.categoria,
        ...(quantitaManuale ? {unita:p.unita,quantita:p.quantita,misure:p.misure,daQuantificare:p.daQuantificare} : {}),
        noteMisure:[p.noteMisure===base.noteMisure ? v.noteMisure : p.noteMisure,nota].filter(Boolean).join(" ").slice(0,4000)};
    }),
    ...precedente.voci.filter(v=>!modello.has(v.id) && !ids.has(v.id)),
  ]};
}

/**
 * Nuova costruzione (nuovaCostruzione.ts): le pareti di perimetro diventano tamponature con
 * l'intonaco interno su una faccia sola (fuori c'è cappotto o intonaco esterno), ogni riga va
 * nel suo capitolo del computo e si aggiungono scavi, fondazioni, strutture, solai, impianti
 * ed esterni.
 */
function aggiungiNuovaCostruzione(doc: Planimetria, variante: string | null, righe: RigaStudio[]) {
  const muriMq = new Map(righe.filter(r => r.riferimento?.tipo === "muro" && r.id === r.riferimento.id && r.quantita !== null && r.fase === "Murature")
    .map(r => [`${r.livelloId}:${r.id}`, r.quantita!]));
  const { righe: aggiunte, perimetro } = righeNuovaCostruzione(doc, variante, muriMq);
  const portante = doc.costruzione?.struttura === "muratura_portante";
  for (let i = 0; i < righe.length; i++) {
    const r = righe[i];
    if (r.riferimento?.tipo === "muro" && perimetro.get(r.livelloId)?.has(r.riferimento.id)) {
      if (r.id === r.riferimento.id && r.fase === "Murature") {
        righe[i] = { ...r, descrizione: portante ? "Nuova muratura portante di perimetro" : "Tamponatura esterna" };
      } else if (/-(intonaco|tinteggiatura)$/.test(r.id) && r.quantita !== null) {
        const intonaco = r.id.endsWith("-intonaco");
        righe[i] = { ...r, quantita: arrotonda(r.quantita / 2), criterio: `Faccia interna: ${italiano(arrotonda(r.quantita / 2))} m²`,
          descrizione: intonaco ? "Intonaco interno della parete di perimetro" : "Tinteggiatura interna della parete di perimetro" };
      }
    }
    righe[i] = { ...righe[i], gruppo: capitoloRigaStudio(righe[i]) ?? righe[i].gruppo };
  }
  const esistenti = new Set(righe.map(r => r.id));
  righe.push(...aggiunte.filter(r => !esistenti.has(r.id)));
}
