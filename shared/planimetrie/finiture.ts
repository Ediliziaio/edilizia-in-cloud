/** Campioni condivisi da editor, 3D e prompt. Nel documento restano descrizioni leggibili. */
export interface CampioneFinitura {
  id: string;
  nome: string;
  descrizione: string;
  colore: string;
  trama: "rovere" | "rovere_miele" | "rovere_spina" | "marmo" | "marmo_calacatta" | "marmo_marquinia" | "pietra" | "travertino" | "cemento" | "piastrelle" | "intonaco";
  /** Misura reale del campione ripetuto (larghezza e altezza, in metri). */
  metri: [number, number];
  ruvidita: number;
}

export const PAVIMENTI_STANZA: readonly CampioneFinitura[] = [
  { id: "rovere", nome: "Parquet rovere naturale", descrizione: "Parquet in rovere naturale, venature visibili, listoni opachi", colore: "#ffffff", trama: "rovere", metri: [1.2, 2.4], ruvidita: 0.65 },
  { id: "noce", nome: "Parquet legno scuro", descrizione: "Parquet in legno scuro noce, venature visibili, listoni opachi", colore: "#876548", trama: "rovere", metri: [1.2, 2.4], ruvidita: 0.65 },
  { id: "gres_legno", nome: "Gres effetto legno", descrizione: "Gres porcellanato effetto legno rovere, venature realistiche, listoni 20×120 cm con fughe sottili", colore: "#ffffff", trama: "rovere", metri: [0.8, 2.4], ruvidita: 0.5 },
  { id: "marmo", nome: "Marmo bianco venato", descrizione: "Marmo bianco Carrara con venature grigie naturali, lastre grandi, finitura levigata", colore: "#ffffff", trama: "marmo", metri: [2.4, 2.4], ruvidita: 0.28 },
  { id: "cemento", nome: "Gres effetto cemento", descrizione: "Gres porcellanato effetto cemento grigio chiaro, opaco, piastrelle 60×60 cm", colore: "#c5c6c3", trama: "cemento", metri: [1.2, 1.2], ruvidita: 0.85 },
  { id: "pietra", nome: "Pietra naturale sabbia", descrizione: "Pietra naturale calcarea color sabbia, pori e variazioni minerali visibili, finitura opaca", colore: "#ffffff", trama: "pietra", metri: [2.4, 2.4], ruvidita: 0.8 },
  { id: "piastrelle", nome: "Gres avorio", descrizione: "Gres porcellanato avorio opaco, piastrelle 60×60 cm, fughe sottili tono su tono", colore: "#e8dfce", trama: "piastrelle", metri: [1.2, 1.2], ruvidita: 0.55 },
  { id: "cotto", nome: "Cotto terracotta", descrizione: "Cotto terracotta naturale, piastrelle 30×30 cm opache con variazioni di tono", colore: "#b96f4c", trama: "piastrelle", metri: [0.6, 0.6], ruvidita: 0.9 },
  { id: "rovere_miele", nome: "Parquet rovere miele", descrizione: "Parquet in rovere miele a listoni sfalsati, con nodi sottili e finitura oliata", colore: "#ffffff", trama: "rovere_miele", metri: [1.2, 1.2], ruvidita: 0.54 },
  { id: "rovere_spina", nome: "Parquet rovere a spina", descrizione: "Parquet in rovere a spina di pesce, listelli a 90 gradi e finitura opaca", colore: "#ffffff", trama: "rovere_spina", metri: [1.4, 1.4], ruvidita: 0.65 },
  { id: "marmo_calacatta", nome: "Calacatta bianco e oro", descrizione: "Marmo Calacatta bianco con venature grigie e oro, grandi lastre levigate", colore: "#ffffff", trama: "marmo_calacatta", metri: [2, 2], ruvidita: 0.26 },
  { id: "marmo_marquinia", nome: "Nero Marquinia", descrizione: "Marmo Nero Marquinia con venature bianche sottili, superficie levigata", colore: "#ffffff", trama: "marmo_marquinia", metri: [1.8, 1.8], ruvidita: 0.28 },
  { id: "travertino", nome: "Travertino beige", descrizione: "Travertino beige levigato a bande naturali, con porosità fine", colore: "#ffffff", trama: "travertino", metri: [1.4, 1.4], ruvidita: 0.69 },
];

export const PARETI_STANZA: readonly CampioneFinitura[] = [
  { id: "bianco", nome: "Pittura bianco caldo", descrizione: "Pittura bianco caldo opaca su intonaco fine", colore: "#f5f1e9", trama: "intonaco", metri: [1, 1], ruvidita: 0.95 },
  { id: "sabbia", nome: "Pittura sabbia", descrizione: "Pittura color sabbia opaca su intonaco fine", colore: "#dbc6a6", trama: "intonaco", metri: [1, 1], ruvidita: 0.95 },
  { id: "salvia", nome: "Pittura verde salvia", descrizione: "Pittura verde salvia opaca su intonaco fine", colore: "#a6b49e", trama: "intonaco", metri: [1, 1], ruvidita: 0.95 },
  { id: "legno", nome: "Rivestimento in rovere", descrizione: "Rivestimento in legno rovere naturale con venature visibili e doghe verticali opache", colore: "#ffffff", trama: "rovere", metri: [1.2, 2.4], ruvidita: 0.65 },
  { id: "pietra", nome: "Rivestimento in pietra", descrizione: "Rivestimento in pietra naturale calcarea color sabbia, pori e giunti sottili visibili", colore: "#ffffff", trama: "pietra", metri: [2.4, 2.4], ruvidita: 0.85 },
  { id: "marmo", nome: "Rivestimento in marmo", descrizione: "Rivestimento in marmo bianco Carrara con venature grigie naturali", colore: "#ffffff", trama: "marmo", metri: [2.4, 2.4], ruvidita: 0.28 },
  ...PAVIMENTI_STANZA.filter(c => ["marmo_calacatta", "marmo_marquinia", "travertino"].includes(c.id)),
];

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
