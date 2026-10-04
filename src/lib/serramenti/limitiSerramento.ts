/**
 * I controlli sulle misure di un serramento: quello che si può costruire e quello
 * che il disegno non sa rappresentare.
 *
 * I limiti del produttore (larghezza e altezza massime di un'anta, superficie
 * massima, altezze di cassonetto offerte) vengono dalla scheda tecnica della
 * linea e si passano a parte: senza, si controlla solo ciò che non può funzionare
 * in nessun caso (misure troppo piccole, cassonetto che mangia la finestra,
 * traverso fuori dal vetro).
 */
import { larghezzeAnte, PROFILI_STANDARD, type SerramentoDisegno } from "./disegnoSerramento";

export interface LimitiProdotto {
  anta?: {
    larghezzaMinMm?: number;
    larghezzaMaxMm?: number;
    altezzaMinMm?: number;
    altezzaMaxMm?: number;
    superficieMaxM2?: number;
  };
  serramento?: { larghezzaMaxMm?: number; altezzaMaxMm?: number; superficieMaxM2?: number };
  /** Le altezze di cassonetto che il produttore offre. */
  cassonettiMm?: number[];
  anteMax?: number;
}

export interface Avviso {
  codice: string;
  /** «errore»: non si può fare così. «avviso»: si può, ma controlla. */
  gravita: "errore" | "avviso";
  testo: string;
}

const mm = (v: number) => `${Math.round(v)} mm`;

export function controllaMisure(d: SerramentoDisegno, limiti: LimitiProdotto = {}): Avviso[] {
  const out: Avviso[] = [];
  const err = (codice: string, testo: string) => out.push({ codice, gravita: "errore", testo });
  const avv = (codice: string, testo: string) => out.push({ codice, gravita: "avviso", testo });

  const W = d.larghezzaMm;
  const H = d.altezzaMm;
  if (W < 300 || H < 300) err("misura_minima", `La misura minima è 300 × 300 mm (qui ${mm(W)} × ${mm(H)}).`);

  const sagomato = !!d.forma && d.forma !== "rettangolare";
  if (sagomato && d.ante.length > 1) avv("sagoma_un_campo", "Arco e trapezio hanno un solo campo: le altre ante non si disegnano.");
  if (sagomato && d.monoblocco) avv("sagoma_monoblocco", "Il monoblocco non si disegna sulle sagome non rettangolari.");
  if (sagomato && d.sopraluce) avv("sagoma_sopraluce", "Il sopraluce non si disegna sulle sagome non rettangolari.");

  if (sagomato && d.forma !== "arco" && d.forma !== "trapezio" && d.ante[0] && d.ante[0].tipo !== "fisso") {
    avv("sagoma_fissa", "Questa sagoma si disegna come fisso: l'anta apribile non si vede.");
  }
  if (d.forma === "arco") {
    const f = d.frecciaMm ?? W / 2;
    if (f > W / 2) avv("freccia_alta", `L'arco non può salire oltre metà larghezza (${mm(W / 2)}): il disegno usa quel valore.`);
    if (f < W * 0.12) avv("freccia_bassa", `L'arco è troppo ribassato: il disegno usa almeno ${mm(W * 0.12)}.`);
    if (f > H * 0.6) avv("freccia_su_altezza", "L'arco occupa più del 60% dell'altezza: resta poco spazio per il lato dritto.");
  }
  if (d.forma === "trapezio") {
    const minore = d.altezzaMinoreMm ?? H * 0.6;
    if (minore >= H) err("trapezio_lati_uguali", "Nel trapezio il lato basso deve essere più basso del lato alto: altrimenti è un rettangolo.");
    if (minore < 150) avv("trapezio_lato_basso", "Il lato basso è sotto i 150 mm: il disegno lo porta a 150.");
  }

  // Monoblocco: il cassonetto deve lasciare spazio alla finestra.
  let altezzaFinestra = H;
  if (d.monoblocco && !sagomato) {
    const cass = d.monoblocco.cassonettoMm ?? 200;
    altezzaFinestra = H - cass;
    if (altezzaFinestra < 300) err("cassonetto_alto", `Con un cassonetto da ${mm(cass)} alla finestra restano ${mm(altezzaFinestra)}: ne servono almeno 300.`);
    if (limiti.cassonettiMm && !limiti.cassonettiMm.includes(cass)) {
      avv("cassonetto_non_offerto", `Il produttore offre cassonetti da ${limiti.cassonettiMm.map(mm).join(", ")}, non da ${mm(cass)}.`);
    }
  }

  for (const t of d.traversi ?? []) {
    if (t.daBassoMm < 120 || t.daBassoMm > H - 120) err("traverso_fuori", `Il traverso a ${mm(t.daBassoMm)} dal basso sta fuori dal vetro.`);
  }
  if (d.inglesine && (d.inglesine.colonne > 8 || d.inglesine.righe > 8)) avv("inglesine_molte", "Più di 8 riquadri per lato sono troppi per le inglesine.");

  if (limiti.anteMax && d.ante.length > limiti.anteMax) err("troppe_ante", `Questa linea arriva a ${limiti.anteMax} ante, non ${d.ante.length}.`);

  // Ante: misure e superficie, contro i limiti del produttore.
  const telaio = Math.min(PROFILI_STANDARD.telaioMm, Math.min(W, H) * 0.075);
  const larghezze = larghezzeAnte(d.ante, Math.max(100, W - 2 * telaio));
  const la = limiti.anta;
  const altezzaAnta = Math.max(0, altezzaFinestra - 2 * telaio);
  larghezze.forEach((l, i) => {
    const n = d.ante.length > 1 ? `Anta ${i + 1}: ` : "";
    const apribile = d.ante[i]?.tipo !== "fisso";
    if (!la || !apribile) return;
    if (la.larghezzaMaxMm && l > la.larghezzaMaxMm) err("anta_larga", `${n}larga ${mm(l)}, il massimo è ${mm(la.larghezzaMaxMm)}.`);
    if (la.larghezzaMinMm && l < la.larghezzaMinMm) err("anta_stretta", `${n}larga ${mm(l)}, il minimo è ${mm(la.larghezzaMinMm)}.`);
    if (la.altezzaMaxMm && altezzaAnta > la.altezzaMaxMm) err("anta_alta", `${n}alta ${mm(altezzaAnta)}, il massimo è ${mm(la.altezzaMaxMm)}.`);
    if (la.altezzaMinMm && altezzaAnta < la.altezzaMinMm) err("anta_bassa", `${n}alta ${mm(altezzaAnta)}, il minimo è ${mm(la.altezzaMinMm)}.`);
    const m2 = (l * altezzaAnta) / 1e6;
    if (la.superficieMaxM2 && m2 > la.superficieMaxM2) err("anta_pesante", `${n}${m2.toFixed(2)} m², il massimo è ${la.superficieMaxM2} m².`);
  });

  const ls = limiti.serramento;
  if (ls) {
    if (ls.larghezzaMaxMm && W > ls.larghezzaMaxMm) err("serramento_largo", `Largo ${mm(W)}, il massimo è ${mm(ls.larghezzaMaxMm)}.`);
    if (ls.altezzaMaxMm && H > ls.altezzaMaxMm) err("serramento_alto", `Alto ${mm(H)}, il massimo è ${mm(ls.altezzaMaxMm)}.`);
    const m2 = (W * H) / 1e6;
    if (ls.superficieMaxM2 && m2 > ls.superficieMaxM2) err("serramento_grande", `${m2.toFixed(2)} m², il massimo è ${ls.superficieMaxM2} m².`);
  }
  return out;
}
