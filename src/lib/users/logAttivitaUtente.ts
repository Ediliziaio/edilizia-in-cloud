/**
 * Log attività di un utente: tutto quello che ha fatto, giorno per giorno.
 *
 * Il log mostrava solo gli eventi di sicurezza (login, ruoli, permessi). Chi
 * gestisce la squadra vuole vedere anche il lavoro: note scritte, fasi cambiate,
 * contatti creati o modificati, chiamate, email, appuntamenti, preventivi.
 * Qui la parte senza database: categorie, etichette, intervalli di date e
 * raggruppamento per giorno.
 */

export type CategoriaLog =
  | "sicurezza" | "note" | "pipeline" | "contatti" | "chiamate"
  | "email" | "appuntamenti" | "preventivi" | "attivita" | "documenti" | "altro";

export const CATEGORIE_LOG: { chiave: CategoriaLog; etichetta: string }[] = [
  { chiave: "note", etichetta: "Note" },
  { chiave: "pipeline", etichetta: "Pipeline e opportunità" },
  { chiave: "contatti", etichetta: "Contatti" },
  { chiave: "chiamate", etichetta: "Chiamate" },
  { chiave: "email", etichetta: "Email" },
  { chiave: "appuntamenti", etichetta: "Appuntamenti" },
  { chiave: "preventivi", etichetta: "Preventivi" },
  { chiave: "attivita", etichetta: "Attività e task" },
  { chiave: "documenti", etichetta: "Documenti" },
  { chiave: "sicurezza", etichetta: "Accessi e sicurezza" },
  { chiave: "altro", etichetta: "Altro" },
];

export interface VoceLog {
  id: string;
  quando: string; // ISO
  categoria: CategoriaLog;
  titolo: string;
  dettaglio?: string | null;
  contactId?: string | null;
  /** Dalla scheda «Accessi e sicurezza»: azione fatta tramite impersonazione. */
  impersonata?: boolean;
  /** Valore grezzo dell'azione (per il filtro per azione di sicurezza). */
  azione?: string | null;
}

/** Tipi di attività del registro contatti → categoria e nome italiano. */
const ATTIVITA_REGISTRO: Record<string, { categoria: CategoriaLog; titolo: string }> = {
  contact_created: { categoria: "contatti", titolo: "Contatto creato" },
  created: { categoria: "contatti", titolo: "Contatto creato" },
  updated: { categoria: "contatti", titolo: "Contatto aggiornato" },
  imported: { categoria: "contatti", titolo: "Contatto importato" },
  converted: { categoria: "contatti", titolo: "Convertito in cliente" },
  contact_assigned: { categoria: "contatti", titolo: "Contatto assegnato" },
  assigned: { categoria: "contatti", titolo: "Contatto assegnato" },
  tag_added: { categoria: "contatti", titolo: "Etichetta aggiunta" },
  tag_removed: { categoria: "contatti", titolo: "Etichetta rimossa" },
  opportunity_created: { categoria: "pipeline", titolo: "Opportunità creata" },
  opportunity_assigned: { categoria: "pipeline", titolo: "Opportunità assegnata" },
  opportunity_deleted: { categoria: "pipeline", titolo: "Opportunità eliminata" },
  opportunity_restored: { categoria: "pipeline", titolo: "Opportunità ripristinata" },
  stage_changed: { categoria: "pipeline", titolo: "Fase cambiata" },
  stage_change: { categoria: "pipeline", titolo: "Fase cambiata" },
  status_changed: { categoria: "pipeline", titolo: "Stato cambiato" },
  status_change: { categoria: "pipeline", titolo: "Stato cambiato" },
  document_uploaded: { categoria: "documenti", titolo: "Documento caricato" },
  quote_sent: { categoria: "preventivi", titolo: "Preventivo inviato" },
  quote_accepted: { categoria: "preventivi", titolo: "Preventivo accettato" },
  email_sent: { categoria: "email", titolo: "Email inviata" },
  message_sent: { categoria: "contatti", titolo: "Messaggio inviato" },
};

export function vocedaAttivitaRegistro(tipo: string | null | undefined): { categoria: CategoriaLog; titolo: string } {
  const t = (tipo ?? "").trim();
  if (ATTIVITA_REGISTRO[t]) return ATTIVITA_REGISTRO[t];
  const leggibile = t.replace(/[_.-]+/g, " ");
  return { categoria: "altro", titolo: leggibile ? leggibile.charAt(0).toUpperCase() + leggibile.slice(1) : "Attività" };
}

/** Azioni del log aziendale (company_activity_log): «contact.updated», «task_created»… */
export function vocedaLogAzienda(azione: string | null | undefined): { categoria: CategoriaLog; titolo: string } {
  const a = (azione ?? "").trim();
  const [oggetto, verbo] = a.includes(".") ? a.split(".") : [a.split("_")[0], a.split("_").slice(1).join("_")];
  const VERBI: Record<string, string> = {
    created: "creato", updated: "modificato", deleted: "eliminato", status_updated: "stato cambiato",
    hired: "assunto", completed: "completato", status_changed: "stato cambiato",
  };
  const OGGETTI: Record<string, { categoria: CategoriaLog; nome: string }> = {
    contact: { categoria: "contatti", nome: "Contatto" },
    customer: { categoria: "contatti", nome: "Cliente" },
    quote: { categoria: "preventivi", nome: "Preventivo" },
    order: { categoria: "altro", nome: "Ordine" },
    task: { categoria: "attivita", nome: "Task" },
    employee: { categoria: "altro", nome: "Dipendente" },
  };
  const o = OGGETTI[oggetto];
  if (o) {
    const v = VERBI[verbo] ?? verbo.replace(/_/g, " ");
    return { categoria: o.categoria, titolo: `${o.nome} ${v}`.trim() };
  }
  const leggibile = a.replace(/[_.-]+/g, " ");
  return { categoria: "altro", titolo: leggibile ? leggibile.charAt(0).toUpperCase() + leggibile.slice(1) : "Azione" };
}

// ── Date ────────────────────────────────────────────────────────────────────

export type PresetPeriodo = "oggi" | "ieri" | "7" | "30" | "tutto" | "personalizzato";

export interface Intervallo {
  /** yyyy-MM-dd, incluso; null = senza limite */
  da: string | null;
  a: string | null;
}

function giornoLocale(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function intervalloPreset(preset: PresetPeriodo, adesso: Date = new Date()): Intervallo {
  const oggi = giornoLocale(adesso);
  const meno = (giorni: number) => {
    const d = new Date(adesso);
    d.setDate(d.getDate() - giorni);
    return giornoLocale(d);
  };
  switch (preset) {
    case "oggi": return { da: oggi, a: oggi };
    case "ieri": return { da: meno(1), a: meno(1) };
    case "7": return { da: meno(6), a: oggi };
    case "30": return { da: meno(29), a: oggi };
    default: return { da: null, a: null };
  }
}

/** Estremi ISO per le query: dal primo istante di «da» all'ultimo di «a», in ora locale. */
export function estremiIso(i: Intervallo): { da: string | null; a: string | null } {
  const inizio = i.da ? new Date(`${i.da}T00:00:00`) : null;
  const fine = i.a ? new Date(`${i.a}T23:59:59.999`) : null;
  return {
    da: inizio && !Number.isNaN(inizio.getTime()) ? inizio.toISOString() : null,
    a: fine && !Number.isNaN(fine.getTime()) ? fine.toISOString() : null,
  };
}

export function chiaveGiorno(iso: string): string {
  return giornoLocale(new Date(iso));
}

export function etichettaGiorno(chiave: string, adesso: Date = new Date()): string {
  const [y, m, d] = chiave.split("-").map(Number);
  const data = new Date(y, m - 1, d);
  const diff = Math.round((new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate()).getTime() - data.getTime()) / 86_400_000);
  const lungo = data.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (diff === 0) return `Oggi · ${lungo}`;
  if (diff === 1) return `Ieri · ${lungo}`;
  return lungo.charAt(0).toUpperCase() + lungo.slice(1);
}

/** Più recenti prima, poi raggruppate per giorno (ordine preservato). */
export function raggruppaPerGiorno(voci: VoceLog[]): { giorno: string; voci: VoceLog[] }[] {
  const ordinate = [...voci].sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());
  const gruppi: { giorno: string; voci: VoceLog[] }[] = [];
  for (const v of ordinate) {
    const g = chiaveGiorno(v.quando);
    const ultimo = gruppi[gruppi.length - 1];
    if (ultimo && ultimo.giorno === g) ultimo.voci.push(v);
    else gruppi.push({ giorno: g, voci: [v] });
  }
  return gruppi;
}

export function contaPerCategoria(voci: VoceLog[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of voci) out[v.categoria] = (out[v.categoria] ?? 0) + 1;
  return out;
}
