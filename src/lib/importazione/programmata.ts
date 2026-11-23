/**
 * Importazione a scaglioni (23/11/2026): le righe del file aspettano sul server e
 * entrano un gruppo alla volta, per esempio 10 ogni 10 minuti, solo nei giorni e
 * nella fascia oraria scelti. Il giro lo fa il database ogni minuto
 * (importazioni_programmate_esegui), anche a computer spento.
 */
import { aLotti } from "@/lib/lottiDiId";

export interface Programmazione {
  perGiro: number;
  ogniMinuti: number;
  /** Da quando: data e ora locali. */
  inizio: Date;
  /** «09:00»: senza, a ogni ora. */
  fasciaDa?: string;
  fasciaA?: string;
  /** Giorni della settimana, 1 = lunedì … 7 = domenica. */
  giorni: number[];
}

export const PROGRAMMAZIONE_PREDEFINITA = (): Programmazione => ({
  perGiro: 10,
  ogniMinuti: 10,
  inizio: new Date(),
  fasciaDa: "09:00",
  fasciaA: "18:00",
  giorni: [1, 2, 3, 4, 5],
});

const minuti = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const giornoIso = (d: Date) => ((d.getDay() + 6) % 7) + 1;

/** Si può salvare? Il database rifiuta nessun giorno o una fascia che finisce prima di iniziare. */
export function programmazioneValida(p: Programmazione): boolean {
  if (p.giorni.length === 0 || p.perGiro < 1 || p.perGiro > 500 || p.ogniMinuti < 1) return false;
  if (!!p.fasciaDa !== !!p.fasciaA) return false;
  return !p.fasciaDa || !p.fasciaA || p.fasciaDa < p.fasciaA;
}

/** Il momento è dentro i giorni e la fascia oraria scelti? */
export function dentroFascia(d: Date, p: Programmazione): boolean {
  if (!p.giorni.includes(giornoIso(d))) return false;
  if (!p.fasciaDa || !p.fasciaA) return true;
  const ora = d.getHours() * 60 + d.getMinutes();
  return ora >= minuti(p.fasciaDa) && ora < minuti(p.fasciaA);
}

/** Il primo momento utile da `d` in poi (al massimo due settimane avanti). */
export function prossimoMomentoUtile(d: Date, p: Programmazione): Date | null {
  if (dentroFascia(d, p)) return d;
  for (let giorno = 0; giorno < 15; giorno++) {
    const base = new Date(d);
    base.setDate(base.getDate() + giorno);
    const apertura = new Date(base);
    if (p.fasciaDa) apertura.setHours(Math.floor(minuti(p.fasciaDa) / 60), minuti(p.fasciaDa) % 60, 0, 0);
    else apertura.setHours(0, 0, 0, 0);
    const candidato = giorno === 0 && apertura < d ? d : apertura;
    if (candidato >= d && dentroFascia(candidato, p)) return candidato;
  }
  return null;
}

/** Quando finisce, più o meno: ogni giro fa entrare `perGiro` righe. */
export function fineStimata(totale: number, p: Programmazione): Date | null {
  if (totale <= 0 || p.perGiro <= 0 || p.ogniMinuti <= 0 || p.giorni.length === 0) return null;
  let restanti = totale;
  let t = prossimoMomentoUtile(p.inizio, p);
  for (let giri = 0; t && giri < 200000; giri++) {
    restanti -= p.perGiro;
    if (restanti <= 0) return t;
    t = prossimoMomentoUtile(new Date(t.getTime() + p.ogniMinuti * 60_000), p);
  }
  return null;
}

export function descriviProgrammazione(p: Programmazione): string {
  const nomi = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
  const giorni = p.giorni.length === 7 ? "tutti i giorni"
    : p.giorni.length === 5 && [1, 2, 3, 4, 5].every((g) => p.giorni.includes(g)) ? "dal lunedì al venerdì"
    : [...p.giorni].sort().map((g) => nomi[g - 1]).join(", ");
  const fascia = p.fasciaDa && p.fasciaA ? `, dalle ${p.fasciaDa} alle ${p.fasciaA}` : "";
  return `${p.perGiro} ogni ${p.ogniMinuti} minuti, ${giorni}${fascia}`;
}

export const formatoData = (d: Date) =>
  d.toLocaleString("it-IT", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

interface ClientDb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (tabella: string) => any;
}

/** Salva l'importazione e le sue righe in attesa. Se le righe non entrano tutte, non lascia niente a metà. */
export async function creaImportazioneProgrammata(db: ClientDb, dati: {
  companyId: string;
  oggetto: "contatti" | "opportunita";
  nomeFile?: string;
  modalita: "create" | "update" | "upsert";
  pipelineId?: string;
  faseId?: string;
  automazioni: { id: string; nome: string }[];
  programmazione: Programmazione;
  righe: Record<string, unknown>[];
}): Promise<{ id: string; annullabile: boolean }> {
  const p = dati.programmazione;
  const { data: job, error } = await db.from("importazioni_programmate").insert({
    company_id: dati.companyId,
    oggetto: dati.oggetto,
    nome_file: dati.nomeFile ?? null,
    modalita: dati.modalita,
    pipeline_id: dati.pipelineId ?? null,
    fase_id: dati.faseId ?? null,
    automazioni: dati.automazioni,
    per_giro: p.perGiro,
    ogni_minuti: p.ogniMinuti,
    inizio: p.inizio.toISOString(),
    prossimo_giro: p.inizio.toISOString(),
    fascia_da: p.fasciaDa || null,
    fascia_a: p.fasciaA || null,
    giorni: p.giorni,
    totale: dati.righe.length,
    // Le righe si caricano prima di partire: il giro non deve trovarne solo una parte.
    stato: "in_pausa",
  }).select("id").single();
  if (error) throw error;
  // Il registro ha lo stesso id: serve ad annullarla. Se non si riesce a scriverlo, si importa lo stesso.
  const registro = await (async () => {
    try {
      const { error: errRegistro } = await db.from("importazioni_registro").insert({
        id: job.id, company_id: dati.companyId, oggetto: dati.oggetto, nome_file: dati.nomeFile ?? null, programmata: true,
      });
      return !errRegistro;
    } catch {
      return false;
    }
  })();
  try {
    let ordine = 0;
    for (const lotto of aLotti(dati.righe, 500)) {
      const { error: errRighe } = await db.from("importazioni_programmate_righe")
        .insert(lotto.map((dati) => ({ importazione_id: job.id, ordine: ++ordine, dati })));
      if (errRighe) throw errRighe;
    }
    const { error: errAvvio } = await db.from("importazioni_programmate").update({ stato: "attiva" }).eq("id", job.id);
    if (errAvvio) throw errAvvio;
  } catch (e) {
    await db.from("importazioni_programmate").delete().eq("id", job.id);
    throw e;
  }
  return { id: job.id, annullabile: registro };
}
