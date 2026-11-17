/**
 * Le rese di partenza del gestionale (17/11/2026): quante ore-persona serve un'unità di lavoro,
 * quando la voce non ha ore scritte, l'azienda non ha una sua resa, la voce non ha un costo di
 * manodopera e il prezzario non dà un'incidenza. Sono valori medi di cantiere, larghi: ogni voce
 * stimata così lo dice («resa di partenza»), e la resa dell'azienda (salvata dalla voce in «Calcola
 * come finire») vince sempre.
 *
 * Tarate su un computo vero di riqualificazione (182 voci) contro un'analisi operativa fatta a mano:
 * cappotto e cicli di facciata 30-45 m²/giorno con 6-8 persone → circa 1 ora-persona per m² di ciclo
 * completo (pannello + rasatura + rivestimento + pittura); serramenti 4-6 vani/giorno con 4 posatori;
 * copertura 10-15 m²/giorno con 4-5 persone.
 *
 * `squadra` è la squadra tipica di quella lavorazione: serve a dare i giorni di una fase quando
 * nessuno ha scritto quante persone ci lavorano.
 *
 * Funzioni pure, compatibili con Deno.
 */

export interface ResaPartenza {
  nome: string;
  /** Chi la fa: mestieri diversi lavorano in parallelo nella stessa fase. */
  mestiere: string;
  /** Ore-persona per unità della voce. */
  ore: number;
  squadra: number;
}

type Unita = "mq" | "m" | "pz" | "mc" | "kg" | "kwh";
interface Riga { nome: string; parole: RegExp; unita: Unita; ore: number; mestiere: string; squadra: number }

/** In ordine: conta la prima riga che combacia con la parola E con l'unità. */
const TABELLA: readonly Riga[] = [
  // Opere provvisionali
  { nome: "Ponteggio (montaggio e smontaggio)", parole: /ponteg/, unita: "mq", ore: 0.25, mestiere: "cantiere", squadra: 4 },
  // Rimozioni
  { nome: "Rimozione di serramenti", parole: /(rimozion|smontagg|smuratur).*(infiss|serrament|finestr|avvolgibil|persian)/, unita: "mq", ore: 1, mestiere: "demolizioni", squadra: 3 },
  { nome: "Rimozione di serramenti", parole: /(rimozion|smontagg|smuratur).*(infiss|serrament|finestr|avvolgibil|persian)/, unita: "pz", ore: 2, mestiere: "demolizioni", squadra: 3 },
  { nome: "Rimozioni e demolizioni", parole: /(rimozion|demoli|smontagg|scrostatur|asportazion)/, unita: "mq", ore: 0.4, mestiere: "demolizioni", squadra: 3 },
  { nome: "Rimozioni e demolizioni", parole: /(rimozion|demoli|smontagg)/, unita: "m", ore: 0.2, mestiere: "demolizioni", squadra: 3 },
  { nome: "Rimozioni e demolizioni", parole: /(rimozion|demoli|smontagg)/, unita: "pz", ore: 1.5, mestiere: "demolizioni", squadra: 3 },
  // Facciate e cappotto
  { nome: "Spallette isolate", parole: /spallett/, unita: "m", ore: 0.35, mestiere: "facciata", squadra: 6 },
  { nome: "Rinforzi e armature agli angoli", parole: /(armatura aggiuntiva|rinforz).*(angol|apertur)/, unita: "pz", ore: 0.1, mestiere: "facciata", squadra: 6 },
  { nome: "Cappotto (pannelli, collante, tasselli)", parole: /cappott/, unita: "mq", ore: 0.55, mestiere: "facciata", squadra: 6 },
  { nome: "Fondo e primer", parole: /(fondo|primer|fissativ|impregnant)/, unita: "mq", ore: 0.06, mestiere: "facciata", squadra: 6 },
  { nome: "Rasatura e rivestimento", parole: /(rasatur|rasant|rivestimento (acril|silossan|minerale|plastico)|intonachino)/, unita: "mq", ore: 0.25, mestiere: "facciata", squadra: 6 },
  { nome: "Tinteggiatura", parole: /(pittur|tinteggi|verniciat)/, unita: "mq", ore: 0.15, mestiere: "facciata", squadra: 4 },
  { nome: "Soglie e controsoglie", parole: /(soglia|soglie|davanzal)/, unita: "mq", ore: 2, mestiere: "facciata", squadra: 2 },
  { nome: "Soglie e controsoglie", parole: /(soglia|soglie|davanzal)/, unita: "m", ore: 0.6, mestiere: "facciata", squadra: 2 },
  { nome: "Intonaco", parole: /intonac/, unita: "mq", ore: 0.5, mestiere: "facciata", squadra: 3 },
  // Coperture e lattonerie
  { nome: "Lattonerie", parole: /(gronda|grondai|pluvial|discendent|scossalin|convers|lattoner|canal[ie])/, unita: "m", ore: 0.5, mestiere: "copertura", squadra: 3 },
  { nome: "Accessori di lattoneria", parole: /(cicogn|collar|staff)/, unita: "pz", ore: 0.15, mestiere: "copertura", squadra: 3 },
  { nome: "Orditura in legno", parole: /(orditur|listell|travett|abete)/, unita: "mc", ore: 25, mestiere: "copertura", squadra: 4 },
  { nome: "Orditura in legno", parole: /(orditur|listell|travett)/, unita: "mq", ore: 0.4, mestiere: "copertura", squadra: 4 },
  { nome: "Manto di copertura", parole: /(manto|copp[oi]|tegol|canale e coppo)/, unita: "mq", ore: 1.2, mestiere: "copertura", squadra: 4 },
  { nome: "Guaine e barriere al vapore", parole: /(guaina|membran|barriera al vapore|impermeabilizz)/, unita: "mq", ore: 0.25, mestiere: "copertura", squadra: 3 },
  { nome: "Isolamento di coperture e sottotetti", parole: /(isolament|isolant|polistiren|lana di roccia|xps|eps)/, unita: "mq", ore: 0.3, mestiere: "copertura", squadra: 3 },
  { nome: "Massetto", parole: /(massett|sottofond)/, unita: "mq", ore: 0.25, mestiere: "copertura", squadra: 3 },
  // Serramenti e schermature
  { nome: "Posa di serramenti", parole: /(serrament|finestr|portafinestr|infiss|vetrat)/, unita: "mq", ore: 2.5, mestiere: "serramentista", squadra: 4 },
  { nome: "Posa di serramenti", parole: /(serrament|finestr|portafinestr|infiss|vetrat|maniglion)/, unita: "pz", ore: 5, mestiere: "serramentista", squadra: 4 },
  { nome: "Controtelai", parole: /controtelai/, unita: "mq", ore: 1, mestiere: "serramentista", squadra: 4 },
  { nome: "Avvolgibili e oscuranti", parole: /(avvolgibil|tapparell|oscurant|persian|scuri)/, unita: "mq", ore: 1.5, mestiere: "serramentista", squadra: 4 },
  { nome: "Avvolgibili e oscuranti", parole: /(avvolgibil|tapparell|oscurant|persian|motorizzaz)/, unita: "pz", ore: 2, mestiere: "serramentista", squadra: 4 },
  { nome: "Cassonetti", parole: /cassonett/, unita: "pz", ore: 3, mestiere: "serramentista", squadra: 4 },
  { nome: "Cassonetti", parole: /cassonett/, unita: "mq", ore: 3, mestiere: "serramentista", squadra: 4 },
  { nome: "Coprifili e finiture del serramento", parole: /(coprifil|profil)/, unita: "m", ore: 0.15, mestiere: "serramentista", squadra: 4 },
  // Finiture interne
  { nome: "Controsoffitti e cartongesso", parole: /(controsoff|cartongess|velett|lastr)/, unita: "mq", ore: 0.8, mestiere: "finiture", squadra: 3 },
  { nome: "Controsoffitti e cartongesso", parole: /(controsoff|cartongess|velett|profil)/, unita: "m", ore: 0.3, mestiere: "finiture", squadra: 3 },
  { nome: "Pavimenti e rivestimenti", parole: /(paviment|piastrell|gres|parquet)/, unita: "mq", ore: 0.9, mestiere: "finiture", squadra: 2 },
  // Impianti termici
  { nome: "Pompe di calore e generatori", parole: /(pompa di calore|pompe di calore|caldai|generator|chiller)/, unita: "pz", ore: 16, mestiere: "termoidraulico", squadra: 3 },
  { nome: "Bollitori e accumuli", parole: /(bollitor|accumulo|serbatoi|puffer)/, unita: "pz", ore: 8, mestiere: "termoidraulico", squadra: 3 },
  { nome: "Ventilconvettori e cassette", parole: /(ventilconvett|fancoil|fan coil|cassett)/, unita: "pz", ore: 4, mestiere: "termoidraulico", squadra: 3 },
  { nome: "Radiatori e scaldasalviette", parole: /(radiator|scaldasalviett|termosifon)/, unita: "pz", ore: 3, mestiere: "termoidraulico", squadra: 3 },
  { nome: "Pannelli radianti", parole: /(radiant|pannell[io] (riscald|radiant))/, unita: "mq", ore: 0.8, mestiere: "termoidraulico", squadra: 3 },
  { nome: "Componenti di centrale", parole: /(valvol|defangator|separator|gruppo|collettor|circolator|vaso di espansion|sonda|scheda|gateway|regolator|comand|termostat)/, unita: "pz", ore: 2, mestiere: "termoidraulico", squadra: 3 },
  { nome: "Tubazioni", parole: /(tub[io]|tubazion|multistrato|pp-?r|polietilen|pe100|climatherm|manicott|raccord)/, unita: "m", ore: 0.5, mestiere: "termoidraulico", squadra: 3 },
  { nome: "Raccordi e manicotti", parole: /(manicott|raccord|curv[ae]|riduzion)/, unita: "pz", ore: 0.3, mestiere: "termoidraulico", squadra: 3 },
  // Impianti elettrici e fotovoltaico
  { nome: "Moduli fotovoltaici", parole: /(modul[io] fotovolt|pannell[io] fotovolt)/, unita: "pz", ore: 0.8, mestiere: "elettricista", squadra: 3 },
  { nome: "Strutture del fotovoltaico", parole: /(fotovolt|graff|giunt|staff|sistema di montaggio)/, unita: "pz", ore: 0.15, mestiere: "elettricista", squadra: 3 },
  { nome: "Inverter e quadri", parole: /(inverter|quadr[oi])/, unita: "pz", ore: 8, mestiere: "elettricista", squadra: 3 },
  { nome: "Accumulo elettrico", parole: /(batteri|accumul)/, unita: "kwh", ore: 0.5, mestiere: "elettricista", squadra: 3 },
  { nome: "Colonnina di ricarica", parole: /(colonnin|wallbox|ricarica)/, unita: "pz", ore: 6, mestiere: "elettricista", squadra: 2 },
  { nome: "Cavi e linee", parole: /(cav[io]|line[ae] elettric|condutt)/, unita: "m", ore: 0.08, mestiere: "elettricista", squadra: 3 },
  { nome: "Cavidotti e canaline", parole: /(cavidott|canalin|corrugat|tubo protettiv)/, unita: "m", ore: 0.15, mestiere: "elettricista", squadra: 3 },
];

const senzaAccenti = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** L'unità della voce nella famiglia della tabella. */
function famiglia(unita: string | null | undefined): Unita | null {
  const u = senzaAccenti(String(unita ?? "")).replace(/\s+/g, "").replace(/\.$/, "");
  if (/^(m2|mq|m²|metriquadri)$/.test(u)) return "mq";
  if (/^(m|ml|mt|metri|metrolineare)$/.test(u)) return "m";
  if (/^(m3|mc|m³)$/.test(u)) return "mc";
  if (/^(cad|cadauno|cadauna|pz|pezzi?|n|nr|numero|cad\.)$/.test(u)) return "pz";
  if (/^kwh$/.test(u)) return "kwh";
  if (/^kg$/.test(u)) return "kg";
  return null;
}

export function resaDiPartenza(descrizione: string, unita: string | null | undefined): ResaPartenza | null {
  const u = famiglia(unita);
  if (!u) return null;
  const t = senzaAccenti(descrizione);
  // Un sovrapprezzo (anche «per ogni cm in più») paga uno spessore o una variante della voce principale:
  // la sua quantità (m²×cm) non è altra superficie da lavorare.
  if (/(sovrapprezz|maggiorazion|per ogni (cm|centimetro))/.test(t)) return null;
  // «Fornitura di…» senza posa: il materiale arriva, il lavoro no.
  if (/^\s*(sola\s+)?fornitura\b/.test(t) && !/\bpos[ae]\b|in opera/.test(t)) return null;
  // Vince la prima riga della tabella: le lavorazioni specifiche stanno prima di quelle generiche
  // («isolamento termico a cappotto» è cappotto, non isolamento di copertura).
  const scelta = TABELLA.find((r) => r.unita === u && r.parole.test(t));
  return scelta ? { nome: scelta.nome, ore: scelta.ore, mestiere: scelta.mestiere, squadra: scelta.squadra } : null;
}

/** Quanto è larga la stima: ±35%. */
export const MARGINE_PARTENZA = 0.35;
