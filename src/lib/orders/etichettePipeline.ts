/**
 * Pipeline delle commesse: cosa dice ogni riga della card.
 *
 * Le card mostravano sigle senza etichetta — «199g in ritardo», «5/5 pronti»,
 * «Francesco Barbieri +1», «Sbloccare posa» — e non si capiva di cosa: in
 * ritardo rispetto a cosa? pronti chi? E il «Sbloccare posa» sembrava un avviso,
 * mentre è il prossimo passo da fare. Qui le frasi, con il motivo di ciascuna
 * (per il suggerimento al passaggio del mouse) e il tono.
 */

export type Tono = "critico" | "attenzione" | "ok" | "neutro";

export interface Etichetta {
  testo: string;
  tono: Tono;
  /** Frase intera, per il suggerimento. */
  dettaglio: string;
}

/** Giorni da oggi alla posa prevista: negativo = in ritardo, null = senza data. */
export type GiorniAllaPosa = number | null;

export function statoPosa(giorni: GiorniAllaPosa, dataBreve: string | null): Etichetta {
  if (giorni === null) {
    return { testo: "Da fissare", tono: "attenzione", dettaglio: "La data di posa non è ancora stata indicata sulla commessa." };
  }
  if (giorni < 0) {
    const n = Math.abs(giorni);
    return {
      testo: `${n} ${n === 1 ? "giorno" : "giorni"} di ritardo`,
      tono: "critico",
      dettaglio: `La posa era prevista il ${dataBreve ?? "—"}: la data è passata da ${n} ${n === 1 ? "giorno" : "giorni"} e la commessa non è ancora completata.`,
    };
  }
  if (giorni === 0) return { testo: "Oggi", tono: "attenzione", dettaglio: "La posa è prevista per oggi." };
  if (giorni <= 14) {
    return { testo: `Tra ${giorni} ${giorni === 1 ? "giorno" : "giorni"}`, tono: "attenzione", dettaglio: `Posa prevista il ${dataBreve ?? "—"}.` };
  }
  return { testo: dataBreve ?? "—", tono: "neutro", dettaglio: `Posa prevista il ${dataBreve ?? "—"}.` };
}

export function statoMateriali(totale: number, pronti: number, daOrdinare: number): Etichetta {
  if (totale === 0) {
    return { testo: "Nessun articolo", tono: "neutro", dettaglio: "Alla commessa non sono stati aggiunti articoli o materiali." };
  }
  const base = `${pronti} su ${totale} articoli sono pronti (in magazzino, prenotati o già installati).`;
  if (pronti >= totale) return { testo: `${pronti}/${totale} pronti`, tono: "ok", dettaglio: base };
  return {
    testo: `${pronti}/${totale} pronti`,
    tono: pronti === 0 ? "critico" : "attenzione",
    dettaglio: `${base}${daOrdinare > 0 ? ` ${daOrdinare} ${daOrdinare === 1 ? "è ancora da ordinare" : "sono ancora da ordinare"}.` : " Gli altri non sono ancora arrivati."}`,
  };
}

export function statoIncasso(totale: number, incassato: number, daIncassare: number): Etichetta {
  if (totale > 0 && daIncassare === 0 && incassato > 0) {
    return { testo: "Pagata", tono: "ok", dettaglio: "La commessa è stata incassata per intero." };
  }
  if (incassato <= 0) {
    return { testo: "Nessun incasso", tono: "attenzione", dettaglio: "Non è stato ancora incassato nulla su questa commessa." };
  }
  const pct = totale > 0 ? Math.min(100, Math.round((incassato / totale) * 100)) : 0;
  return { testo: `Incassato ${pct}%`, tono: "neutro", dettaglio: `Incassato il ${pct}% del valore: restano da incassare ${daIncassare.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}.` };
}

export function statoSquadra(nomi: string[], interna: boolean, subappalto: boolean): Etichetta {
  if (nomi.length === 0) {
    return { testo: "Da assegnare", tono: "attenzione", dettaglio: "Nessuna squadra (interna o in subappalto) è assegnata alla commessa." };
  }
  const principale = nomi[0];
  const tipo = subappalto && !interna ? "in subappalto" : "interna";
  return {
    testo: `${principale}${nomi.length > 1 ? ` +${nomi.length - 1}` : ""}`,
    tono: "neutro",
    dettaglio: `Squadra ${tipo}: ${nomi.join(", ")}.`,
  };
}

export interface DatiPassaggio {
  giorniAllaPosa: GiorniAllaPosa;
  daIncassare: number;
  incassato: number;
  articoli: number;
  pronti: number;
  daOrdinare: number;
}

export interface Passaggio {
  testo: string;
  motivo: string;
  /** «pronto» = niente da sbloccare, si può procedere. */
  tipo: "azione" | "pronto";
}

/** Il prossimo passo da fare, con la ragione. Stesso ordine di priorità di prima. */
export function prossimoPasso(d: DatiPassaggio): Passaggio {
  if (d.daIncassare > 0 && d.incassato === 0) {
    return { testo: "Incassare l'acconto", motivo: "Non è stato incassato ancora nulla.", tipo: "azione" };
  }
  if (d.giorniAllaPosa !== null && d.giorniAllaPosa < 0) {
    return { testo: "Sbloccare la posa", motivo: "La data di posa è passata: serve una nuova data o capire cosa blocca.", tipo: "azione" };
  }
  if (d.articoli > 0 && d.daOrdinare > 0) {
    return { testo: "Ordinare i materiali", motivo: `${d.daOrdinare} ${d.daOrdinare === 1 ? "articolo è" : "articoli sono"} ancora da ordinare.`, tipo: "azione" };
  }
  if (d.articoli > 0 && d.pronti < d.articoli) {
    return { testo: "Verificare gli arrivi", motivo: "I materiali sono ordinati ma non tutti sono arrivati.", tipo: "azione" };
  }
  if (d.articoli > 0 && d.pronti === d.articoli) {
    return { testo: "Preparare la posa", motivo: "Tutti i materiali sono pronti.", tipo: "pronto" };
  }
  return { testo: "Aprire la scheda", motivo: "Mancano dati (articoli o date) per dire cosa fare.", tipo: "azione" };
}

/** Quante commesse hanno la posa oltre la data prevista. */
export function contaInRitardo(giorni: GiorniAllaPosa[]): number {
  return giorni.filter((g) => g !== null && g < 0).length;
}
