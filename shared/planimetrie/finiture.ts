/** Campioni condivisi da editor, 3D e prompt. Nel documento restano descrizioni leggibili. */
export interface CampioneFinitura {
  id: string;
  nome: string;
  descrizione: string;
  colore: string;
  trama: "rovere" | "rovere_miele" | "rovere_spina" | "marmo" | "marmo_calacatta" | "marmo_marquinia" | "pietra" | "travertino" | "cemento" | "piastrelle" | "intonaco"
    | "gres_30x60" | "gres_120" | "cotto_30" | "mosaico" | "metro" | "resina";
  /** Formato reale del singolo pezzo in centimetri (lato corto, lato lungo). Serve al 3D e al computo. */
  formatoCm?: [number, number];
  /** Misura reale del campione ripetuto (larghezza e altezza, in metri). */
  metri: [number, number];
  ruvidita: number;
}

export const PAVIMENTI_STANZA: readonly CampioneFinitura[] = [
  { id: "rovere", nome: "Parquet rovere naturale", descrizione: "Parquet in rovere naturale, venature visibili, listoni opachi", colore: "#ffffff", trama: "rovere", metri: [1.2, 2.4], ruvidita: 0.65 },
  { id: "noce", nome: "Parquet legno scuro", descrizione: "Parquet in legno scuro noce, venature visibili, listoni opachi", colore: "#876548", trama: "rovere", metri: [1.2, 2.4], ruvidita: 0.65 },
  { id: "gres_legno", nome: "Gres effetto legno", descrizione: "Gres porcellanato effetto legno rovere, venature realistiche, listoni 20×120 cm con fughe sottili", colore: "#ffffff", trama: "rovere", metri: [0.8, 2.4], ruvidita: 0.5 },
  { id: "marmo", nome: "Marmo bianco venato", descrizione: "Marmo bianco Carrara con venature grigie naturali, lastre grandi, finitura levigata", colore: "#ffffff", trama: "marmo", metri: [2.4, 2.4], ruvidita: 0.28 },
  { id: "cemento", nome: "Gres effetto cemento", descrizione: "Gres porcellanato effetto cemento grigio chiaro, opaco, piastrelle 60×60 cm", colore: "#c5c6c3", trama: "cemento", metri: [1.2, 1.2], ruvidita: 0.85, formatoCm: [60, 60] },
  { id: "pietra", nome: "Pietra naturale sabbia", descrizione: "Pietra naturale calcarea color sabbia, pori e variazioni minerali visibili, finitura opaca", colore: "#ffffff", trama: "pietra", metri: [2.4, 2.4], ruvidita: 0.8 },
  { id: "piastrelle", nome: "Gres avorio", descrizione: "Gres porcellanato avorio opaco, piastrelle 60×60 cm, fughe sottili tono su tono", colore: "#e8dfce", trama: "piastrelle", metri: [1.2, 1.2], ruvidita: 0.55, formatoCm: [60, 60] },
  { id: "cotto", nome: "Cotto terracotta", descrizione: "Cotto terracotta naturale, piastrelle 30×30 cm opache con variazioni di tono", colore: "#b96f4c", trama: "cotto_30", metri: [1.2, 1.2], ruvidita: 0.9, formatoCm: [30, 30] },
  { id: "rovere_miele", nome: "Parquet rovere miele", descrizione: "Parquet in rovere miele a listoni sfalsati, con nodi sottili e finitura oliata", colore: "#ffffff", trama: "rovere_miele", metri: [1.2, 1.2], ruvidita: 0.54 },
  { id: "rovere_spina", nome: "Parquet rovere a spina", descrizione: "Parquet in rovere a spina di pesce, listelli a 90 gradi e finitura opaca", colore: "#ffffff", trama: "rovere_spina", metri: [1.4, 1.4], ruvidita: 0.65 },
  { id: "marmo_calacatta", nome: "Calacatta bianco e oro", descrizione: "Marmo Calacatta bianco con venature grigie e oro, grandi lastre levigate", colore: "#ffffff", trama: "marmo_calacatta", metri: [2, 2], ruvidita: 0.26 },
  { id: "marmo_marquinia", nome: "Nero Marquinia", descrizione: "Marmo Nero Marquinia con venature bianche sottili, superficie levigata", colore: "#ffffff", trama: "marmo_marquinia", metri: [1.8, 1.8], ruvidita: 0.28 },
  { id: "travertino", nome: "Travertino beige", descrizione: "Travertino beige levigato a bande naturali, con porosità fine", colore: "#ffffff", trama: "travertino", metri: [1.4, 1.4], ruvidita: 0.69 },
  // i nuovi campioni si aggiungono in fondo: l'ordine dei precedenti è usato dai test e dalle piante salvate
  { id: "gres_grande", nome: "Gres grande formato greige", descrizione: "Gres porcellanato grande formato 120×120 cm greige, superficie satinata, fughe minime", colore: "#cfc8bc", trama: "gres_120", metri: [2.4, 2.4], ruvidita: 0.36, formatoCm: [120, 120] },
  { id: "gres_antracite", nome: "Gres antracite 30×60", descrizione: "Gres porcellanato antracite effetto cemento, piastrelle 30×60 cm posate a correre", colore: "#63666a", trama: "gres_30x60", metri: [1.2, 1.2], ruvidita: 0.7, formatoCm: [30, 60] },
  { id: "resina", nome: "Resina grigio perla", descrizione: "Pavimento continuo in resina grigio perla, senza fughe, finitura satinata", colore: "#cbc9c4", trama: "resina", metri: [2.4, 2.4], ruvidita: 0.38 },
  { id: "mosaico_bianco", nome: "Mosaico bianco 5×5", descrizione: "Mosaico in ceramica bianca lucida 5×5 cm con fughe grigio chiaro", colore: "#f1f0ec", trama: "mosaico", metri: [0.6, 0.6], ruvidita: 0.22, formatoCm: [5, 5] },
];

/** Piastrelle da parete: si scelgono come rivestimento (bagno, cucina) o per tutta la parete. */
export const PIASTRELLE_PARETE: readonly CampioneFinitura[] = [
  { id: "metro_bianco", nome: "Piastrelle bianche lucide 7,5×15", descrizione: "Piastrelle bianche lucide formato metro 7,5×15 cm posate a correre, fughe grigio chiaro", colore: "#f6f5f1", trama: "metro", metri: [0.6, 0.6], ruvidita: 0.16, formatoCm: [7.5, 15] },
  { id: "metro_salvia", nome: "Piastrelle verde salvia 7,5×15", descrizione: "Piastrelle verde salvia lucide formato metro 7,5×15 cm posate a correre", colore: "#aebba5", trama: "metro", metri: [0.6, 0.6], ruvidita: 0.18, formatoCm: [7.5, 15] },
];

export const PARETI_STANZA: readonly CampioneFinitura[] = [
  { id: "bianco", nome: "Pittura bianco caldo", descrizione: "Pittura bianco caldo opaca su intonaco fine", colore: "#f5f1e9", trama: "intonaco", metri: [1, 1], ruvidita: 0.95 },
  { id: "sabbia", nome: "Pittura sabbia", descrizione: "Pittura color sabbia opaca su intonaco fine", colore: "#dbc6a6", trama: "intonaco", metri: [1, 1], ruvidita: 0.95 },
  { id: "salvia", nome: "Pittura verde salvia", descrizione: "Pittura verde salvia opaca su intonaco fine", colore: "#a6b49e", trama: "intonaco", metri: [1, 1], ruvidita: 0.95 },
  { id: "legno", nome: "Rivestimento in rovere", descrizione: "Rivestimento in legno rovere naturale con venature visibili e doghe verticali opache", colore: "#ffffff", trama: "rovere", metri: [1.2, 2.4], ruvidita: 0.65 },
  { id: "pietra", nome: "Rivestimento in pietra", descrizione: "Rivestimento in pietra naturale calcarea color sabbia, pori e giunti sottili visibili", colore: "#ffffff", trama: "pietra", metri: [2.4, 2.4], ruvidita: 0.85 },
  { id: "marmo", nome: "Rivestimento in marmo", descrizione: "Rivestimento in marmo bianco Carrara con venature grigie naturali", colore: "#ffffff", trama: "marmo", metri: [2.4, 2.4], ruvidita: 0.28 },
  ...PAVIMENTI_STANZA.filter(c => ["marmo_calacatta", "marmo_marquinia", "travertino"].includes(c.id)),
  ...PIASTRELLE_PARETE,
];

/** Cosa si può scegliere come rivestimento a mezza altezza: le piastrelle da parete, poi i pavimenti non in legno. */
export const RIVESTIMENTI_STANZA: readonly CampioneFinitura[] = [
  ...PIASTRELLE_PARETE,
  ...PAVIMENTI_STANZA.filter(c => !c.trama.startsWith("rovere")),
];

/** Il campione di un rivestimento e la superficie sotto cui è registrato il suo materiale 3D. */
export function campioneRivestimento(testo: string | undefined): { campione: CampioneFinitura; superficie: SuperficieFinitura } | undefined {
  const parete = campioneFinitura(testo, "pareti");
  if (parete && PIASTRELLE_PARETE.some(c => c.id === parete.id)) return { campione: parete, superficie: "pareti" };
  const pavimento = campioneFinitura(testo, "pavimento");
  return pavimento ? { campione: pavimento, superficie: "pavimento" } : undefined;
}

export const SOFFITTI_STANZA: readonly CampioneFinitura[] = [
  { ...PARETI_STANZA[0], nome: "Soffitto bianco opaco" },
  { ...PARETI_STANZA[3], nome: "Soffitto rivestito in legno" },
];

export type SuperficieFinitura = "pavimento" | "pareti" | "soffitto";
export const CAMPIONI_FINITURE = { pavimento: PAVIMENTI_STANZA, pareti: PARETI_STANZA, soffitto: SOFFITTI_STANZA };

/** Legge anche le descrizioni libere dei documenti precedenti, senza modificarle. */
export function campioneFinitura(testo: string | undefined, superficie: SuperficieFinitura): CampioneFinitura | undefined {
  if (typeof testo !== "string" || !testo.trim()) return undefined;
  const opzioni = CAMPIONI_FINITURE[superficie];
  const t = testo.trim().toLowerCase();
  const esatto = opzioni.find((c) => c.descrizione.toLowerCase() === t || c.nome.toLowerCase() === t || c.id === t);
  if (esatto) return esatto;
  const trova = (id: string) => opzioni.find((c) => c.id === id);
  if (/formato metro|7,5\s*[x×]\s*15|diamantat/.test(t)) return trova(/salvia|verde/.test(t) ? "metro_salvia" : "metro_bianco") ?? trova("piastrelle") ?? trova("bianco");
  if (/mosaico/.test(t)) return trova("mosaico_bianco") ?? trova("piastrelle");
  if (/resina|microcemento/.test(t) && !/gres|piastrell/.test(t)) return trova("resina") ?? trova("cemento");
  if (/antracite|30\s*[x×]\s*60/.test(t) && /gres|piastrell|ceramica/.test(t)) return trova("gres_antracite") ?? trova("piastrelle");
  if (/grande formato|120\s*[x×]\s*120/.test(t) && !/marmo|calacatta|marquinia|travertino|carrara/.test(t)) return trova("gres_grande") ?? trova("piastrelle");
  if (/calacatta/.test(t)) return trova("marmo_calacatta") ?? trova("marmo");
  if (/marquinia/.test(t)) return trova("marmo_marquinia") ?? trova("marmo");
  if (/travertino/.test(t)) return trova("travertino") ?? trova("pietra");
  if (/legno|parquet|rovere|noce/.test(t)) {
    if (superficie !== "pavimento") return trova("legno");
    if (!/gres|porcellan|effetto/.test(t) && /spina di pesce/.test(t)) return trova("rovere_spina");
    if (!/gres|porcellan|effetto/.test(t) && /miele/.test(t)) return trova("rovere_miele");
    return trova(/gres|porcellan|effetto/.test(t) ? "gres_legno" : /scur|noce|weng/.test(t) ? "noce" : "rovere");
  }
  if (/marmo|carrara/.test(t)) return trova("marmo");
  if (/pietra|travertino|calcarea/.test(t)) return trova("pietra");
  if (/cemento|resina/.test(t)) return trova("cemento");
  if (/cotto|terracotta/.test(t)) return trova("cotto");
  if (/gres|piastrell|ceramica/.test(t)) return trova("piastrelle");
  if (/salvia|verde/.test(t)) return trova("salvia");
  if (/sabbia|beige/.test(t)) return trova("sabbia");
  if (/bianc|pittura|intonaco/.test(t)) return trova("bianco");
  return undefined;
}
