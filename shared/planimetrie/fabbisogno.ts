/**
 * Fabbisogno di materiali dalla pianta (23/11/2026): dai m² delle stanze a quanto
 * comprare — litri di pittura, scatole di pavimento, sacchi di colla e stucco,
 * pezzi di battiscopa — con confezioni e ipotesi scritte in chiaro.
 *
 * Parte da `calcolaQuantita` (pareti nette, soffitto, pavimento, rivestimento,
 * battiscopa per stanza) e dalle finiture della stanza (o dal pavimento comune del
 * progetto). Le rese sono quelle tipiche di cantiere e si possono cambiare: è una
 * lista della spesa da confermare, non un ordine.
 */
import { calcolaQuantita, leggiChiave } from "./quantita.ts";
import { statoConMateriali, materialiDelProgetto } from "./materialiProgetto.ts";
import type { Planimetria, StatoPianta } from "./modello.ts";

export interface IpotesiFabbisogno {
  /** Mani di pittura su pareti e soffitti. */
  maniPittura: number;
  /** m² per litro per mano (idropittura lavabile). */
  resaPitturaMqL: number;
  secchioPitturaL: number;
  /** Fissativo/fondo: una mano, m² per litro. */
  resaFissativoMqL: number;
  confezioneFissativoL: number;
  /** Sfrido del pavimento posato dritto e a spina/diagonale. */
  sfridoPavimento: number;
  sfridoPavimentoSpina: number;
  sfridoRivestimento: number;
  /** m² per scatola, se il formato non lo dice. */
  mqScatola: number;
  collaPiastrelleKgMq: number;
  /** A parete la colla è meno: piastrelle più sottili, spalmatura singola. */
  collaRivestimentoKgMq: number;
  saccoCollaKg: number;
  stuccoKgMq: number;
  saccoStuccoKg: number;
  collaParquetKgMq: number;
  secchioCollaParquetKg: number;
  pezzoBattiscopaM: number;
  sfridoBattiscopa: number;
}

export const IPOTESI_FABBISOGNO: IpotesiFabbisogno = {
  maniPittura: 2, resaPitturaMqL: 10, secchioPitturaL: 14,
  resaFissativoMqL: 12, confezioneFissativoL: 5,
  sfridoPavimento: 0.1, sfridoPavimentoSpina: 0.15, sfridoRivestimento: 0.1,
  mqScatola: 1.44,
  collaPiastrelleKgMq: 4.5, collaRivestimentoKgMq: 3, saccoCollaKg: 25, stuccoKgMq: 0.4, saccoStuccoKg: 5,
  collaParquetKgMq: 1.2, secchioCollaParquetKg: 15,
  pezzoBattiscopaM: 2.4, sfridoBattiscopa: 0.1,
};

export type TipoPavimento = "legno" | "flottante" | "piastrelle";

export interface RigaFabbisogno {
  id: string;
  materiale: string;
  /** Quantità da comprare, già con sfrido e mani. */
  quantita: number;
  unita: "l" | "m²" | "m" | "kg";
  /** Confezioni intere: «3 secchi da 14 l». */
  confezioni: { numero: number; nome: string } | null;
  /** Come è stato calcolato, in una riga. */
  come: string;
  stanze: Array<{ nome: string; valore: number }>;
}

const arrotonda = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const fmt = (n: number, cifre = 1) => n.toLocaleString("it-IT", { maximumFractionDigits: cifre });

export function tipoPavimento(descrizione: string | undefined, destinazione: string): { tipo: TipoPavimento; spina: boolean; dedotto: boolean } {
  const d = (descrizione ?? "").toLowerCase();
  const spina = /spina|diagonal|ungherese/.test(d);
  if (/laminat|vinilic|spc\b|lvt|flottante/.test(d)) return { tipo: "flottante", spina, dedotto: false };
  if (/parquet|legno massello|listoni in legno|tavolato/.test(d) && !/gres|effetto legno/.test(d)) return { tipo: "legno", spina, dedotto: false };
  if (d) return { tipo: "piastrelle", spina, dedotto: false };
  // senza finitura scritta: dalla destinazione, come il 3D
  return { tipo: /bagno|lavanderia|cucina|balcon|terrazz|garage|cantina/.test(destinazione) ? "piastrelle" : "legno", spina: false, dedotto: true };
}

/** I m² di una scatola dal formato scritto nella finitura («60×60 cm», «20x120»). */
export function mqScatolaDa(descrizione: string | undefined, predefinito: number): number {
  const m = (descrizione ?? "").match(/(\d{2,3})\s*[x×]\s*(\d{2,3})/i);
  if (!m) return predefinito;
  const a = Number(m[1]) / 100, b = Number(m[2]) / 100;
  // scatole tipiche: 60×60 → 1,44 m² (4 pezzi); 20×120 → 1,44 m² (6); 30×30 → 0,99 m² (11)
  const pezzi = Math.max(1, Math.round(1.44 / (a * b)));
  return arrotonda(pezzi * a * b, 2);
}

type Stanza = { id: string; nome: string; destinazione: string; pavimento?: string; rivestimento?: boolean;
  m: { pareti: number; soffitto: number; pavimento: number; rivestimento: number; battiscopa: number } };

function stanzeDellAmbito(p: Planimetria, ambito: string): Stanza[] {
  const q = calcolaQuantita(p);
  const materiali = materialiDelProgetto(p, ambito);
  const propostaId = ambito.startsWith("progetto:") ? ambito.slice("progetto:".length) : null;
  const locali = new Map<string, { nome: string; destinazione: string; pavimento?: string; rivestimento?: boolean }>();
  for (const livello of p.livelli) {
    const stato: StatoPianta = (propostaId && livello.proposte.find((x) => x.id === propostaId)) || livello.fatto;
    for (const l of statoConMateriali(stato, materiali).locali) {
      locali.set(l.id, { nome: l.nome, destinazione: l.destinazione, pavimento: l.finiture?.pavimento, rivestimento: !!l.finiture?.rivestimento });
    }
  }
  const per = new Map<string, Stanza>();
  for (const v of Object.values(q)) {
    const k = leggiChiave(v.chiave);
    if (!k || v.ambito !== ambito || !k.soggetto.startsWith("locale:")) continue;
    const id = k.soggetto.slice("locale:".length);
    const info = locali.get(id);
    if (!info) continue;
    const s = per.get(id) ?? { id, ...info, m: { pareti: 0, soffitto: 0, pavimento: 0, rivestimento: 0, battiscopa: 0 } };
    if (k.misura === "pareti_nette_mq") s.m.pareti = v.valore;
    else if (k.misura === "soffitto_mq") s.m.soffitto = v.valore;
    else if (k.misura === "pavimento_mq") s.m.pavimento = v.valore;
    else if (k.misura === "rivestimento_mq") s.m.rivestimento = v.valore;
    else if (k.misura === "battiscopa_ml") s.m.battiscopa = v.valore;
    per.set(id, s);
  }
  return [...per.values()].filter((s) => !/balcon|terrazz|giardino/.test(s.destinazione));
}

export function fabbisognoMateriali(p: Planimetria, ambito: string, ipotesi: Partial<IpotesiFabbisogno> = {}): RigaFabbisogno[] {
  const h = { ...IPOTESI_FABBISOGNO, ...ipotesi };
  const stanze = stanzeDellAmbito(p, ambito);
  if (!stanze.length) return [];
  const righe: RigaFabbisogno[] = [];
  const riga = (r: Omit<RigaFabbisogno, "quantita" | "stanze"> & { stanze: Array<{ nome: string; valore: number }> }) => {
    const quantita = arrotonda(r.stanze.reduce((t, s) => t + s.valore, 0));
    if (quantita > 0) righe.push({ ...r, quantita, stanze: r.stanze.filter((s) => s.valore > 0).map((s) => ({ ...s, valore: arrotonda(s.valore) })) });
  };
  const confezioni = (q: number, misura: number, nome: (n: number) => string) => {
    const numero = Math.ceil(q / misura - 1e-9);
    return numero > 0 ? { numero, nome: nome(numero) } : null;
  };

  // Pittura: pareti (senza la parte piastrellata) e soffitti, per le mani previste.
  const daPitturare = stanze.map((s) => ({ nome: s.nome, mq: Math.max(0, s.m.pareti - s.m.rivestimento) + s.m.soffitto }));
  const mqPittura = daPitturare.reduce((t, s) => t + s.mq, 0);
  const litriPittura = (mq: number) => mq * h.maniPittura / h.resaPitturaMqL;
  riga({ id: "pittura", materiale: "Idropittura lavabile (pareti e soffitti)", unita: "l",
    confezioni: confezioni(litriPittura(mqPittura), h.secchioPitturaL, (n) => `${n} ${n === 1 ? "secchio" : "secchi"} da ${h.secchioPitturaL} l`),
    come: `${fmt(mqPittura)} m² × ${h.maniPittura} mani ÷ ${fmt(h.resaPitturaMqL)} m²/l per mano`,
    stanze: daPitturare.map((s) => ({ nome: s.nome, valore: litriPittura(s.mq) })) });
  riga({ id: "fissativo", materiale: "Fissativo / fondo (una mano)", unita: "l",
    confezioni: confezioni(mqPittura / h.resaFissativoMqL, h.confezioneFissativoL, (n) => `${n} ${n === 1 ? "latta" : "latte"} da ${h.confezioneFissativoL} l`),
    come: `${fmt(mqPittura)} m² ÷ ${fmt(h.resaFissativoMqL)} m²/l`,
    stanze: daPitturare.map((s) => ({ nome: s.nome, valore: s.mq / h.resaFissativoMqL })) });

  // Pavimenti, divisi per tipo: ogni tipo ha la sua posa e i suoi collanti.
  const conTipo = stanze.map((s) => ({ s, ...tipoPavimento(s.pavimento, s.destinazione) }));
  const piastrelle = conTipo.filter((x) => x.tipo === "piastrelle");
  const legno = conTipo.filter((x) => x.tipo === "legno");
  const flottante = conTipo.filter((x) => x.tipo === "flottante");
  const conSfrido = (x: (typeof conTipo)[number]) => x.s.m.pavimento * (1 + (x.spina ? h.sfridoPavimentoSpina : h.sfridoPavimento));
  const mqScatola = (xs: typeof conTipo) => mqScatolaDa(xs.find((x) => x.s.pavimento)?.s.pavimento, h.mqScatola);
  const dedotti = (xs: typeof conTipo) => xs.some((x) => x.dedotto) ? " Tipo dedotto dalla stanza dove la finitura non è scritta." : "";

  if (piastrelle.length) {
    const mq = piastrelle.reduce((t, x) => t + conSfrido(x), 0), scatola = mqScatola(piastrelle);
    riga({ id: "pavimento_piastrelle", materiale: "Pavimento in piastrelle (gres, marmo, cotto…)", unita: "m²",
      confezioni: confezioni(mq, scatola, (n) => `${n} ${n === 1 ? "scatola" : "scatole"} da ${fmt(scatola, 2)} m²`),
      come: `m² posati + ${Math.round(h.sfridoPavimento * 100)}% di sfrido (${Math.round(h.sfridoPavimentoSpina * 100)}% a spina o in diagonale).${dedotti(piastrelle)}`,
      stanze: piastrelle.map((x) => ({ nome: x.s.nome, valore: conSfrido(x) })) });
  }
  if (legno.length) {
    const mq = legno.reduce((t, x) => t + conSfrido(x), 0), scatola = mqScatola(legno);
    riga({ id: "pavimento_legno", materiale: "Parquet", unita: "m²",
      confezioni: confezioni(mq, scatola, (n) => `${n} ${n === 1 ? "pacco" : "pacchi"} da ${fmt(scatola, 2)} m²`),
      come: `m² posati + ${Math.round(h.sfridoPavimento * 100)}% di sfrido (${Math.round(h.sfridoPavimentoSpina * 100)}% a spina).${dedotti(legno)}`,
      stanze: legno.map((x) => ({ nome: x.s.nome, valore: conSfrido(x) })) });
    const kg = legno.reduce((t, x) => t + x.s.m.pavimento * h.collaParquetKgMq, 0);
    riga({ id: "colla_parquet", materiale: "Colla per parquet", unita: "kg",
      confezioni: confezioni(kg, h.secchioCollaParquetKg, (n) => `${n} ${n === 1 ? "secchio" : "secchi"} da ${h.secchioCollaParquetKg} kg`),
      come: `${fmt(h.collaParquetKgMq)} kg/m² sui m² posati`,
      stanze: legno.map((x) => ({ nome: x.s.nome, valore: x.s.m.pavimento * h.collaParquetKgMq })) });
  }
  if (flottante.length) {
    const mq = flottante.reduce((t, x) => t + conSfrido(x), 0);
    riga({ id: "pavimento_flottante", materiale: "Pavimento flottante (laminato, vinilico)", unita: "m²",
      confezioni: confezioni(mq, h.mqScatola, (n) => `${n} ${n === 1 ? "pacco" : "pacchi"} da ${fmt(h.mqScatola, 2)} m²`),
      come: `m² posati + ${Math.round(h.sfridoPavimento * 100)}% di sfrido; aggiungi il materassino per gli stessi m²`,
      stanze: flottante.map((x) => ({ nome: x.s.nome, valore: conSfrido(x) })) });
  }

  // Rivestimenti (bagni, cucine) in piastrelle.
  const conRiv = stanze.filter((s) => s.m.rivestimento > 0);
  if (conRiv.length) riga({ id: "rivestimento", materiale: "Rivestimento in piastrelle", unita: "m²",
    confezioni: confezioni(conRiv.reduce((t, s) => t + s.m.rivestimento * (1 + h.sfridoRivestimento), 0), h.mqScatola,
      (n) => `${n} ${n === 1 ? "scatola" : "scatole"} da ${fmt(h.mqScatola, 2)} m²`),
    come: `m² di parete piastrellata + ${Math.round(h.sfridoRivestimento * 100)}% di sfrido`,
    stanze: conRiv.map((s) => ({ nome: s.nome, valore: s.m.rivestimento * (1 + h.sfridoRivestimento) })) });

  // Colla e stucco per tutto quello che è piastrellato (pavimenti e rivestimenti).
  const posa = [...piastrelle.map((x) => ({ nome: x.s.nome, mq: x.s.m.pavimento, kg: h.collaPiastrelleKgMq })),
    ...conRiv.map((s) => ({ nome: `${s.nome} (rivestimento)`, mq: s.m.rivestimento, kg: h.collaRivestimentoKgMq }))];
  if (posa.length) {
    const mq = posa.reduce((t, x) => t + x.mq, 0);
    const kgColla = posa.reduce((t, x) => t + x.mq * x.kg, 0);
    riga({ id: "colla_piastrelle", materiale: "Colla cementizia per piastrelle", unita: "kg",
      confezioni: confezioni(kgColla, h.saccoCollaKg, (n) => `${n} ${n === 1 ? "sacco" : "sacchi"} da ${h.saccoCollaKg} kg`),
      come: `${fmt(h.collaPiastrelleKgMq)} kg/m² a pavimento, ${fmt(h.collaRivestimentoKgMq)} kg/m² a parete`,
      stanze: posa.map((x) => ({ nome: x.nome, valore: x.mq * x.kg })) });
    riga({ id: "stucco", materiale: "Stucco per fughe", unita: "kg",
      confezioni: confezioni(mq * h.stuccoKgMq, h.saccoStuccoKg, (n) => `${n} ${n === 1 ? "sacco" : "sacchi"} da ${h.saccoStuccoKg} kg`),
      come: `${fmt(mq)} m² × ${fmt(h.stuccoKgMq)} kg/m² (fuga 2–3 mm)`,
      stanze: posa.map((x) => ({ nome: x.nome, valore: x.mq * h.stuccoKgMq })) });
  }

  // Battiscopa: dove c'è pavimento e non c'è rivestimento a terra.
  const conBattiscopa = stanze.filter((s) => s.m.rivestimento === 0 && s.m.battiscopa > 0);
  const m = conBattiscopa.reduce((t, s) => t + s.m.battiscopa * (1 + h.sfridoBattiscopa), 0);
  riga({ id: "battiscopa", materiale: "Battiscopa", unita: "m",
    confezioni: confezioni(m, h.pezzoBattiscopaM, (n) => `${n} ${n === 1 ? "pezzo" : "pezzi"} da ${fmt(h.pezzoBattiscopaM)} m`),
    come: `perimetro senza le porte + ${Math.round(h.sfridoBattiscopa * 100)}% per tagli e angoli`,
    stanze: conBattiscopa.map((s) => ({ nome: s.nome, valore: s.m.battiscopa * (1 + h.sfridoBattiscopa) })) });

  return righe;
}
