// Timbrature: stato di presenza, filtri, riepilogo ore e raggruppamenti (01/10/2026).
//
// Prima la scheda mostrava 23 riquadri tutti «Non timbrato» e l'unico dato scaricabile
// era niente. Qui la parte senza interfaccia e senza database, provata a parte: dallo
// stato di chi è in azienda, ai filtri per reparto e ruolo, alle ore nette del giorno.

export type StatoPresenza = "in_azienda" | "in_pausa" | "uscito" | "non_timbrato";

export const ETICHETTA_STATO: Record<StatoPresenza, string> = {
  in_azienda: "In azienda",
  in_pausa: "In pausa",
  uscito: "Uscito",
  non_timbrato: "Non ha timbrato",
};

const INIZIO_PAUSA = new Set(["pausa_inizio", "inizio_pausa"]);
const FINE_PAUSA = new Set(["pausa_fine", "fine_pausa"]);

/** Lo stato dall'ultima timbratura del giorno. */
export function statoPresenza(ultimoTipo: string | null | undefined): StatoPresenza {
  if (!ultimoTipo) return "non_timbrato";
  if (ultimoTipo === "entrata" || FINE_PAUSA.has(ultimoTipo)) return "in_azienda";
  if (INIZIO_PAUSA.has(ultimoTipo)) return "in_pausa";
  if (ultimoTipo === "uscita") return "uscito";
  return "non_timbrato";
}

export interface RigaTimbratura {
  id: string;
  data_evento: string;
  ora_evento: string | null;
  timestamp?: string | null;
  tipo: string;
  fonte?: string | null;
  note?: string | null;
  lat?: number | null;
  lng?: number | null;
  profilo_id: string;
  profilo_nome: string | null;
  profilo_cognome: string | null;
  reparto?: string | null;
  mansione?: string | null;
  cantiere_codice?: string | null;
  cantiere_descrizione?: string | null;
}

export interface FiltriTimbrature {
  testo?: string;
  reparto?: string;
  mansione?: string;
  tipo?: string;
}

const t = (v: unknown): string => String(v ?? "").trim();
const NESSUNO = "(non indicato)";

export function nomePersona(r: Pick<RigaTimbratura, "profilo_nome" | "profilo_cognome">): string {
  return [t(r.profilo_nome), t(r.profilo_cognome)].filter(Boolean).join(" ") || "Senza nome";
}

/** Il tipo normalizzato: le due grafie della pausa diventano una. */
export function tipoNormalizzato(tipo: string): string {
  if (INIZIO_PAUSA.has(tipo)) return "pausa_inizio";
  if (FINE_PAUSA.has(tipo)) return "pausa_fine";
  return tipo;
}

export function filtraTimbrature(righe: RigaTimbratura[], f: FiltriTimbrature): RigaTimbratura[] {
  const testo = t(f.testo).toLowerCase();
  return righe.filter((r) => {
    if (f.reparto && (t(r.reparto) || NESSUNO) !== f.reparto) return false;
    if (f.mansione && (t(r.mansione) || NESSUNO) !== f.mansione) return false;
    if (f.tipo && tipoNormalizzato(r.tipo) !== tipoNormalizzato(f.tipo)) return false;
    if (testo) {
      const pagliaio = `${nomePersona(r)} ${t(r.cantiere_codice)} ${t(r.cantiere_descrizione)}`.toLowerCase();
      if (!pagliaio.includes(testo)) return false;
    }
    return true;
  });
}

/** I valori distinti per un filtro a tendina, in ordine alfabetico. */
export function valoriDistinti(righe: Array<{ reparto?: string | null; mansione?: string | null }>, chiave: "reparto" | "mansione"): string[] {
  return Array.from(new Set(righe.map((r) => t(r[chiave]) || NESSUNO))).sort((a, b) => a.localeCompare(b, "it"));
}

// ─── Ore del giorno ──────────────────────────────────────────────────────────

export interface RigaRiepilogoGiorno {
  profilo_id: string;
  persona: string;
  reparto: string;
  mansione: string;
  data: string;
  entrata: string | null;
  uscita: string | null;
  /** Minuti di pausa. */
  pausaMin: number;
  /** Minuti lavorati al netto della pausa; null se la giornata è incompleta. */
  lavoratiMin: number | null;
  timbrature: number;
  /** Cosa non torna («Uscita mancante», «Due entrate di fila»…); vuoto = regolare. */
  anomalia: string;
}

function minuti(ora: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t(ora));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const hhmm = (ora: string | null | undefined) => (t(ora) ? t(ora).slice(0, 5) : null);

/** Ore lavorate per persona e per giorno: entrata → pausa → ripresa → uscita. */
export function riepilogoGiornaliero(righe: RigaTimbratura[]): RigaRiepilogoGiorno[] {
  const gruppi = new Map<string, RigaTimbratura[]>();
  for (const r of righe) {
    const chiave = `${r.profilo_id}|${r.data_evento}`;
    (gruppi.get(chiave) ?? gruppi.set(chiave, []).get(chiave)!).push(r);
  }
  const out: RigaRiepilogoGiorno[] = [];
  for (const eventi of gruppi.values()) {
    eventi.sort((a, b) => (minuti(a.ora_evento) ?? 0) - (minuti(b.ora_evento) ?? 0) || t(a.timestamp).localeCompare(t(b.timestamp)));
    let inizioLavoro: number | null = null;
    let inizioPausa: number | null = null;
    let lavoro = 0;
    let pausa = 0;
    let prima: string | null = null;
    let ultimaUscita: string | null = null;
    const anomalie: string[] = [];
    for (const e of eventi) {
      const ora = minuti(e.ora_evento);
      if (ora === null) continue;
      const tipo = tipoNormalizzato(e.tipo);
      if (tipo === "entrata") {
        if (prima === null) prima = hhmm(e.ora_evento);
        if (inizioLavoro !== null) anomalie.push("Due entrate di fila");
        else inizioLavoro = ora;
      } else if (tipo === "pausa_inizio") {
        if (inizioLavoro !== null) { lavoro += Math.max(0, ora - inizioLavoro); inizioLavoro = null; }
        inizioPausa = ora;
      } else if (tipo === "pausa_fine") {
        if (inizioPausa !== null) { pausa += Math.max(0, ora - inizioPausa); inizioPausa = null; }
        inizioLavoro = ora;
        if (prima === null) prima = hhmm(e.ora_evento);
      } else if (tipo === "uscita") {
        if (inizioPausa !== null) { pausa += Math.max(0, ora - inizioPausa); inizioPausa = null; }
        else if (inizioLavoro !== null) { lavoro += Math.max(0, ora - inizioLavoro); inizioLavoro = null; }
        else anomalie.push("Uscita senza entrata");
        ultimaUscita = hhmm(e.ora_evento);
      }
    }
    const aperta = inizioLavoro !== null || inizioPausa !== null;
    if (aperta) anomalie.push("Uscita mancante");
    if (prima === null && !anomalie.includes("Uscita senza entrata")) anomalie.push("Entrata mancante");
    const primo = eventi[0];
    out.push({
      profilo_id: primo.profilo_id,
      persona: nomePersona(primo),
      reparto: t(primo.reparto) || NESSUNO,
      mansione: t(primo.mansione) || NESSUNO,
      data: primo.data_evento,
      entrata: prima,
      uscita: ultimaUscita,
      pausaMin: pausa,
      lavoratiMin: anomalie.length === 0 ? lavoro : null,
      timbrature: eventi.length,
      anomalia: Array.from(new Set(anomalie)).join(", "),
    });
  }
  return out.sort((a, b) => a.data.localeCompare(b.data) || a.persona.localeCompare(b.persona, "it"));
}

/** 450 → «7:30». */
export function oreMinuti(min: number | null | undefined): string {
  if (min === null || min === undefined) return "";
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

// ─── Raggruppamenti per l'esportazione ──────────────────────────────────────

export type Raggruppa = "nessuno" | "reparto" | "mansione" | "dipendente";

export function chiaveGruppo(r: { reparto?: string | null; mansione?: string | null; profilo_nome?: string | null; profilo_cognome?: string | null; persona?: string }, come: Raggruppa): string {
  if (come === "reparto") return t(r.reparto) || NESSUNO;
  if (come === "mansione") return t(r.mansione) || NESSUNO;
  if (come === "dipendente") return r.persona ?? nomePersona({ profilo_nome: r.profilo_nome ?? null, profilo_cognome: r.profilo_cognome ?? null });
  return "Tutti";
}

/** Nome di foglio Excel valido: al massimo 31 caratteri, senza \ / * ? : [ ], unico nel file. */
export function nomeFoglio(base: string, usati: Set<string>): string {
  const pulito = (base.replace(/[\\/*?:[\]]/g, " ").replace(/\s+/g, " ").trim() || "Foglio").slice(0, 31);
  let nome = pulito;
  let n = 2;
  while (usati.has(nome.toLowerCase())) {
    const suffisso = ` (${n++})`;
    nome = pulito.slice(0, 31 - suffisso.length) + suffisso;
  }
  usati.add(nome.toLowerCase());
  return nome;
}
