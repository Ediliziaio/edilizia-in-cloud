/**
 * Arrivo della merce su misura, posizione per posizione: le regole senza interfaccia.
 * I conti veri li fa il database (`arrivo_registra`): qui si decide solo cosa mostrare e proporre.
 */

export type EsitoArrivo = "arrivata" | "danneggiata" | "sbagliata" | "mancante";

export const ESITI: Array<{ key: EsitoArrivo; etichetta: string }> = [
  { key: "arrivata", etichetta: "Arrivata" },
  { key: "danneggiata", etichetta: "Danneggiata" },
  { key: "sbagliata", etichetta: "Sbagliata" },
  { key: "mancante", etichetta: "Mancante" },
];

export interface ProblemaArrivo {
  id: string;
  esito: Exclude<EsitoArrivo, "arrivata">;
  quantita: number;
  stato: "aperto" | "riordinato";
  foto: string[];
  nota: string | null;
  creato_il: string;
  chi: string | null;
  riordino_po_id: string | null;
  riordino_numero: string | null;
}

export interface PosizioneArrivo {
  poi_id: string;
  order_item_id: string;
  nome: string;
  descrizione: string | null;
  riferimento: string | null;
  gruppo_id: string | null;
  misure: Record<string, unknown> | null;
  misura_tipo: string | null;
  componente: string | null;
  unita: string | null;
  sku: string | null;
  quantita: number;
  ricevuta: number;
  riordino: boolean;
  riordino_motivo: string | null;
  problemi: ProblemaArrivo[];
}

export interface RigaBolla {
  id: string;
  posizione: number;
  codice: string | null;
  descrizione: string;
  quantita: number | null;
  unita: string | null;
  order_item_id: string | null;
  origine: string | null;
}

export interface ElencoArrivo {
  ordine: {
    id: string;
    numero: string;
    stato: string;
    order_id: string | null;
    fornitore: string | null;
    email_fornitore: string | null;
    commessa: string | null;
    cliente: string | null;
  };
  puo_riordinare: boolean;
  articoli_normali: number;
  posizioni: PosizioneArrivo[];
  righe_bolla: RigaBolla[];
}

export interface RigaCommessaArrivo {
  id: string;
  nome: string;
  riferimento: string | null;
  stato: "arrivata" | "da_sostituire" | "parziale" | "non_ordinata" | "non_arrivata";
  quantita: number;
  buoni: number;
  danneggiati: number;
  sbagliati: number;
  in_riordino: number;
  non_arrivati: number;
  ordini: Array<{ id: string; numero: string }>;
}

export interface RiepilogoCommessaArrivo {
  posizioni: number;
  arrivate: number;
  da_sostituire: number;
  parziali: number;
  non_arrivate: number;
  non_ordinate: number;
  pezzi_posabili: number;
  pezzi_totali: number;
  righe: RigaCommessaArrivo[];
}

export interface OrdineDaSpuntare {
  id: string;
  numero: string;
  fornitore: string | null;
  previsto: string | null;
  commessa: string | null;
  cliente: string | null;
  posizioni: number;
  pezzi_da_ricevere: number;
}

const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Le misure scritte come le legge chi ha la finestra davanti. */
export function descriviMisure(misure: Record<string, unknown> | null | undefined, tipo?: string | null): string | null {
  if (!misure || typeof misure !== "object") return null;
  const l = numero(misure.larghezza_mm) ?? numero(misure.larghezza) ?? numero(misure.L) ?? numero(misure.l);
  const h = numero(misure.altezza_mm) ?? numero(misure.altezza) ?? numero(misure.H) ?? numero(misure.h);
  if (l == null && h == null) return null;
  const testo = [l != null ? `L ${l}` : null, h != null ? `H ${h}` : null].filter(Boolean).join(" × ");
  return tipo ? `${testo} — misura ${tipo}` : testo;
}

const fmt = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 3 });

/** Quello che ancora si può spuntare su questa riga. Stessi conti di `arrivo_registra`. */
export function contiPosizione(p: PosizioneArrivo) {
  const aperti = p.problemi.filter(x => x.stato === "aperto");
  const mancanti = aperti.filter(x => x.esito === "mancante").reduce((s, x) => s + Number(x.quantita), 0);
  const problemi = aperti.filter(x => x.esito !== "mancante").reduce((s, x) => s + Number(x.quantita), 0);
  const riordinati = p.problemi.filter(x => x.stato === "riordinato").reduce((s, x) => s + Number(x.quantita), 0);
  const libero = Math.max(Number(p.quantita) - Number(p.ricevuta) - mancanti - problemi - riordinati, 0);
  return {
    libero, mancanti, problemi, riordinati,
    arrivabili: libero + mancanti,
    completa: Number(p.ricevuta) >= Number(p.quantita),
  };
}

export function statoPosizione(p: PosizioneArrivo): { testo: string; tono: "ok" | "attenzione" | "attesa" | "neutro" } {
  const c = contiPosizione(p);
  if (c.completa) return { testo: "Arrivata giusta", tono: "ok" };
  if (c.riordinati > 0) return { testo: `${fmt(c.riordinati)} in riordino`, tono: "attesa" };
  if (c.problemi > 0) {
    const e = p.problemi.find(x => x.stato === "aperto" && x.esito !== "mancante")?.esito;
    return { testo: e === "sbagliata" ? "Sbagliata" : "Danneggiata", tono: "attenzione" };
  }
  if (c.mancanti > 0) return { testo: "Mancante", tono: "attenzione" };
  if (Number(p.ricevuta) > 0) return { testo: `Arrivati ${fmt(Number(p.ricevuta))} su ${fmt(Number(p.quantita))}`, tono: "attesa" };
  return { testo: "Da spuntare", tono: "neutro" };
}

export const parole = (t: string | null | undefined) =>
  new Set((t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(p => p.length >= 3));

/** «1200 x 1400», «120x140» e «L 1200 H 1400»: la coppia di misure in millimetri, se c'è. */
export function misureNelTesto(testo: string | null | undefined): [number, number] | null {
  const t = (testo ?? "").toLowerCase();
  const m = t.match(/(\d{2,4})(?:[.,]\d+)?\s*(?:x|×|\*)\s*h?\s*(\d{2,4})/) ?? t.match(/l\s*[.:=]?\s*(\d{2,4})\D{1,12}h\s*[.:=]?\s*(\d{2,4})/);
  if (!m) return null;
  const inMm = (v: number) => (v < 500 ? v * 10 : v);
  return [inMm(Number(m[1])), inMm(Number(m[2]))];
}

export interface PropostaBolla { rigaId: string; punteggio: number }

/**
 * Propone quale riga della bolla parla di quale posizione. L'AI ha letto la bolla, questo la
 * confronta con regole fisse; chi riceve conferma. Una riga e una posizione si usano una volta.
 */
export function abbinaRigheBolla(righe: RigaBolla[], posizioni: PosizioneArrivo[]): Record<string, PropostaBolla> {
  const candidati: Array<{ poi: string; riga: string; punti: number }> = [];
  const esito: Record<string, PropostaBolla> = {};
  const righeUsate = new Set<string>();

  for (const p of posizioni) {
    const gia = righe.find(r => r.order_item_id === p.order_item_id);
    if (gia) { esito[p.poi_id] = { rigaId: gia.id, punteggio: 100 }; righeUsate.add(gia.id); }
  }
  for (const p of posizioni) {
    if (esito[p.poi_id]) continue;
    const nome = parole(`${p.nome} ${p.descrizione ?? ""}`);
    const misure = p.misure ? [numero(p.misure.larghezza_mm) ?? numero(p.misure.larghezza), numero(p.misure.altezza_mm) ?? numero(p.misure.altezza)] : [null, null];
    for (const r of righe) {
      if (righeUsate.has(r.id)) continue;
      let punti = 0;
      if (p.sku && r.codice && p.sku.trim().toLowerCase() === r.codice.trim().toLowerCase()) punti += 8;
      const rif = p.riferimento?.trim().toLowerCase();
      if (rif && rif.length >= 2 && new RegExp(`(^|[^a-z0-9])${rif.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(r.descrizione.toLowerCase())) punti += 5;
      const lette = misureNelTesto(r.descrizione);
      if (lette && misure[0] && misure[1]) {
        if (Math.abs(lette[0] - misure[0]) <= 5 && Math.abs(lette[1] - misure[1]) <= 5) punti += 6;
        else punti -= 4; // misure diverse: quasi certamente un'altra finestra
      }
      const comuni = [...parole(r.descrizione)].filter(x => nome.has(x)).length;
      punti += Math.min(comuni, 3);
      if (r.quantita != null && Number(r.quantita) === Number(p.quantita)) punti += 1;
      if (punti >= 5) candidati.push({ poi: p.poi_id, riga: r.id, punti });
    }
  }
  candidati.sort((a, b) => b.punti - a.punti);
  for (const c of candidati) {
    if (esito[c.poi] || righeUsate.has(c.riga)) continue;
    esito[c.poi] = { rigaId: c.riga, punteggio: c.punti };
    righeUsate.add(c.riga);
  }
  return esito;
}

const nomePosizione = (p: PosizioneArrivo) => [p.riferimento, p.nome].filter(Boolean).join(" — ");

/** Testo del reclamo: lo legge e lo spedisce una persona, il sistema non invia niente. */
export function testoReclamo(elenco: ElencoArrivo, problemiIds: string[]): { oggetto: string; corpo: string } {
  const scelti = new Set(problemiIds);
  const righe: string[] = [];
  for (const p of elenco.posizioni) {
    for (const x of p.problemi) {
      if (!scelti.has(x.id)) continue;
      const misure = descriviMisure(p.misure, p.misura_tipo);
      const cosa = x.esito === "danneggiata" ? "arrivata danneggiata" : x.esito === "sbagliata" ? "arrivata sbagliata" : "non arrivata";
      righe.push(`- ${nomePosizione(p)}${misure ? ` (${misure})` : ""}${p.sku ? `, codice ${p.sku}` : ""}: ${fmt(Number(x.quantita))} ${p.unita ?? "pz"} ${cosa}${x.nota ? `. ${x.nota}` : ""}`);
    }
  }
  const soloMancanti = elenco.posizioni.every(p => p.problemi.every(x => !scelti.has(x.id) || x.esito === "mancante"));
  return {
    oggetto: `Reclamo merce — ordine ${elenco.ordine.numero}`,
    corpo: [
      "Buongiorno,",
      "",
      `sull'ordine ${elenco.ordine.numero}${elenco.ordine.commessa ? ` (commessa ${elenco.ordine.commessa})` : ""} abbiamo riscontrato:`,
      "",
      ...righe,
      "",
      soloMancanti
        ? "Vi chiediamo di indicarci quando consegnerete questi pezzi."
        : "Vi chiediamo di sostituire questi pezzi senza addebito e di indicarci la data di consegna.",
      "",
      "Grazie",
    ].join("\n"),
  };
}

const plurale = (n: number, uno: string, tanti: string) => `${n} ${n === 1 ? uno : tanti}`;

/** «3 posizioni non arrivate», ecc.: la frase che si legge a colpo d'occhio. */
export function fraseCosaManca(r: Pick<RiepilogoCommessaArrivo, "non_arrivate" | "da_sostituire" | "parziali">): string | null {
  const pezzi = [
    r.non_arrivate > 0 ? `${plurale(r.non_arrivate, "posizione non arrivata", "posizioni non arrivate")}` : null,
    r.parziali > 0 ? `${plurale(r.parziali, "arrivata in parte", "arrivate in parte")}` : null,
    r.da_sostituire > 0 ? `${plurale(r.da_sostituire, "da sostituire", "da sostituire")}` : null,
  ].filter(Boolean);
  return pezzi.length > 0 ? pezzi.join(" · ") : null;
}
