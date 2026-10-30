// src/lib/orders/generali/documenti.ts
// Modulo «Documenti» della commessa generale (piano, tappa 6): i documenti che servono per
// un appalto, uno sviluppo immobiliare o una compravendita, con il loro stato.
//
// I file stanno nell'archivio della commessa (order_attachments), della generale o di una
// figlia: qui non si carica niente. Una voce è «presente» se sulla commessa giusta c'è un
// file segnato per quella voce (commesse_generali_documenti) oppure un file il cui nome la
// riconosce («DURC giugno.pdf» → DURC). L'elenco di partenza è in questo file; l'azienda lo
// cambia da Impostazioni → Cartelle documenti (commesse_generali_documenti_voci).
//
// Solo parole e conti, senza React né database.
// Import relativo con estensione: la edge function generali-avvisi (Deno) usa questo file, e Deno non conosce «@/».
import { DEFINIZIONI_MODELLI, type ModelloGenerale } from "../commesseGenerali.ts";

/** Sulla generale (una volta) o su ogni figlia (ogni ordine di lavoro, ogni unità). */
export type AmbitoVoce = "generale" | "figlia";

export interface VoceCatalogo {
  chiave: string;
  nome: string;
  ambito: AmbitoVoce;
  obbligatoria: boolean;
  conScadenza: boolean;
  /** Una riga che spiega a cosa serve, quando non è ovvio. */
  aiuto?: string;
  /** Validità tipica: la scadenza proposta quando si carica (DURC 120 giorni, APE 10 anni). */
  validitaGiorni?: number;
  /** Serve solo sulle figlie che hanno incassato qualcosa (acconti, caparre): la fideiussione 122/2005. */
  soloConIncassi?: boolean;
  /** Il nome del file (senza accenti, minuscolo, parole separate da spazi) che riconosce la voce. */
  riconosci?: RegExp;
  escludi?: RegExp;
}

// ── L'elenco di partenza ──────────────────────────────────────────────────────
// Una chiave = un concetto: la stessa voce in due modelli ha la stessa chiave.

const V = {
  contratto_firmato: {
    chiave: "contratto_firmato", nome: "Contratto firmato", ambito: "generale", obbligatoria: true, conScadenza: false,
    riconosci: /\bcontratt/, escludi: /\b(sub ?appalt|finanziament|mutu|prelimin|compromess|aggiuntiv|addendum|nolo|noleggi|fornitur)/,
  },
  atti_aggiuntivi: {
    chiave: "atti_aggiuntivi", nome: "Atti aggiuntivi", ambito: "generale", obbligatoria: false, conScadenza: false,
    aiuto: "Varianti e integrazioni al contratto, se ci sono.",
    riconosci: /\b(atto aggiuntivo|atti aggiuntivi|addendum|aggiuntiv)/,
  },
  cauzione_definitiva: {
    chiave: "cauzione_definitiva", nome: "Cauzione definitiva", ambito: "generale", obbligatoria: true, conScadenza: true,
    riconosci: /\b(cauzion|garanzia definitiva|fideiussione definitiva)/, escludi: /\banticipazion/,
  },
  garanzia_anticipazione: {
    chiave: "garanzia_anticipazione", nome: "Garanzia sull'anticipazione", ambito: "generale", obbligatoria: false, conScadenza: true,
    aiuto: "Serve se il committente versa l'anticipazione del prezzo.",
    riconosci: /\banticipazion/,
  },
  polizza_car: {
    chiave: "polizza_car", nome: "Polizza CAR", ambito: "generale", obbligatoria: true, conScadenza: true,
    aiuto: "Tutti i rischi del cantiere (Contractor's All Risks).",
    riconosci: /\b(car|all risks?|tutti i rischi|rischi del costruttore)\b/,
  },
  psc: {
    chiave: "psc", nome: "PSC — piano di sicurezza e coordinamento", ambito: "generale", obbligatoria: true, conScadenza: false,
    riconosci: /\b(psc|piano di sicurezza e (di )?coordinamento)\b/,
  },
  notifica_preliminare: {
    chiave: "notifica_preliminare", nome: "Notifica preliminare", ambito: "figlia", obbligatoria: false, conScadenza: false,
    aiuto: "Per i cantieri con più imprese o sopra i 200 uomini-giorno (art. 99 D.Lgs. 81/2008).",
    riconosci: /\bnotific\w* prelimin/,
  },
  nomina_cse: {
    chiave: "nomina_cse", nome: "Nomina del CSE", ambito: "generale", obbligatoria: true, conScadenza: false,
    riconosci: /\b(cse|coordinatore (della |per la )?sicurezza (in )?(fase )?(di )?esecuzione)\b/,
  },
  durc: {
    chiave: "durc", nome: "DURC", ambito: "generale", obbligatoria: true, conScadenza: true, validitaGiorni: 120,
    aiuto: "Vale 120 giorni dalla richiesta.",
    riconosci: /\b(durc|regolarita contributiva)\b/,
  },
  atto_acquisto: {
    chiave: "atto_acquisto", nome: "Atto di acquisto", ambito: "generale", obbligatoria: true, conScadenza: false,
    aiuto: "Il rogito con cui l'operazione ha comprato il terreno o l'immobile.",
    riconosci: /\b((atto|rogito) (notarile )?(di )?acquist|acquisto (del |dell |di )?(terreno|immobile|area|lotto|fabbricato))/,
  },
  visure_catastali: {
    chiave: "visure_catastali", nome: "Visure e catastali", ambito: "generale", obbligatoria: true, conScadenza: false,
    riconosci: /\b(visur|catast|mappal|estratto di mappa)/, escludi: /\b(docfa|accatastament|frazionament)/,
  },
  titolo_edilizio: {
    chiave: "titolo_edilizio", nome: "Titolo edilizio (PdC, SCIA, CILA)", ambito: "generale", obbligatoria: true, conScadenza: false,
    riconosci: /\b(permesso di costruire|pdc|scia|super ?scia|cila|cilas|titolo edilizio|pratica edilizia)\b/,
  },
  progetto_computo: {
    chiave: "progetto_computo", nome: "Progetto e computo metrico", ambito: "generale", obbligatoria: true, conScadenza: false,
    riconosci: /\b(progett|computo|tavol|elaborati grafici|relazione tecnica)/, escludi: /\bcatast/,
  },
  business_plan: {
    chiave: "business_plan", nome: "Business plan approvato", ambito: "generale", obbligatoria: true, conScadenza: false,
    riconosci: /\b(business ?plan|piano economico( finanziario)?|pef|bp)\b/,
  },
  contratti_finanziamento: {
    chiave: "contratti_finanziamento", nome: "Contratti di finanziamento", ambito: "generale", obbligatoria: false, conScadenza: false,
    aiuto: "Mutuo, finanziamenti dei soci o degli investitori.",
    riconosci: /\b(finanziament|mutu|fondiari|linea di credito)/,
  },
  preliminare: {
    chiave: "preliminare", nome: "Preliminare di vendita", ambito: "figlia", obbligatoria: false, conScadenza: false,
    riconosci: /\b(preliminar|compromess|proposta (d|di) acquisto)/,
  },
  fideiussione_122: {
    chiave: "fideiussione_122", nome: "Fideiussione D.Lgs. 122/2005", ambito: "figlia", obbligatoria: true, conScadenza: true,
    soloConIncassi: true,
    aiuto: "A garanzia di acconti e caparre versati prima del rogito: serve sulle unità che hanno incassato qualcosa.",
    riconosci: /\b(fideiussion|d ?lgs 122|122 2005)/,
  },
  polizza_decennale: {
    chiave: "polizza_decennale", nome: "Polizza decennale postuma", ambito: "generale", obbligatoria: true, conScadenza: true,
    aiuto: "Da consegnare agli acquirenti al rogito (D.Lgs. 122/2005, art. 4).",
    riconosci: /\b(decennal|postuma|indennitaria)/,
  },
  rogito: {
    chiave: "rogito", nome: "Rogito", ambito: "figlia", obbligatoria: false, conScadenza: false,
    riconosci: /\b(rogit|atto (notarile )?di (vendita|compravendita))/, escludi: /\bacquist/,
  },
  ape: {
    chiave: "ape", nome: "APE — attestato di prestazione energetica", ambito: "figlia", obbligatoria: true, conScadenza: true,
    validitaGiorni: 3650,
    aiuto: "Vale 10 anni; serve già negli annunci di vendita.",
    riconosci: /\b(ape|prestazione energetica|attestato energetico|certificazione energetica)\b/,
  },
  agibilita: {
    chiave: "agibilita", nome: "Agibilità (SCA)", ambito: "generale", obbligatoria: true, conScadenza: false,
    riconosci: /\b(agibilit|abitabilit|sca\b)/,
  },
  accatastamento: {
    chiave: "accatastamento", nome: "Frazionamento e accatastamento", ambito: "figlia", obbligatoria: true, conScadenza: false,
    riconosci: /\b(docfa|accatastament|frazionament|variazione catastale|tipo mappale)/,
  },
  // Il materiale per vendere l'unità: lo mostra il tabellone e lo mette la scheda vendita.
  planimetria: {
    chiave: "planimetria", nome: "Planimetria", ambito: "figlia", obbligatoria: false, conScadenza: false,
    aiuto: "La pianta dell'unità da far vedere a chi compra: compare nel tabellone e nella scheda vendita.",
    riconosci: /\b(planimetri|pianta)/,
  },
  capitolato_unita: {
    chiave: "capitolato_unita", nome: "Capitolato e finiture", ambito: "figlia", obbligatoria: false, conScadenza: false,
    riconosci: /\b(capitolat|finitur)/,
  },
  foto_render: {
    chiave: "foto_render", nome: "Foto o render", ambito: "figlia", obbligatoria: false, conScadenza: false,
    aiuto: "Le immagini dell'unità per la scheda vendita.",
    riconosci: /\b(render|rendering|foto|fotografi\w*|immagin\w*)\b/, escludi: /\b(fotocopi|identita|documento)/,
  },
} satisfies Record<string, VoceCatalogo>;

/** Le voci di partenza di ogni modello, nell'ordine in cui si leggono. */
export const VOCI_DI_PARTENZA: Record<ModelloGenerale, readonly VoceCatalogo[]> = {
  appalto: [
    V.contratto_firmato, V.atti_aggiuntivi, V.cauzione_definitiva, V.garanzia_anticipazione,
    V.polizza_car, V.psc, V.notifica_preliminare, V.nomina_cse, V.durc,
  ],
  sviluppo: [
    V.atto_acquisto, V.visure_catastali, V.titolo_edilizio, V.progetto_computo, V.business_plan,
    V.contratti_finanziamento, V.polizza_decennale, V.agibilita,
    V.preliminare, V.fideiussione_122, V.rogito, V.ape, V.accatastamento,
    V.planimetria, V.capitolato_unita, V.foto_render,
  ],
  // Compra, ristruttura, vendi: un immobile che c'è già, quasi sempre con una CILA o una SCIA.
  compravendita: [
    V.atto_acquisto, V.visure_catastali,
    { ...V.titolo_edilizio, nome: "Titolo edilizio (CILA, SCIA)" },
    { ...V.progetto_computo, nome: "Computo dei lavori", obbligatoria: false },
    V.preliminare, V.rogito, V.ape,
    { ...V.accatastamento, obbligatoria: false, aiuto: "Se l'immobile viene diviso o cambia la planimetria." },
    V.planimetria, V.capitolato_unita, V.foto_render,
  ],
};

// ── Le scelte dell'azienda ────────────────────────────────────────────────────

/** Una riga di commesse_generali_documenti_voci: un campo null vuol dire «come la voce di partenza». */
export interface RigaVoceAzienda {
  id: string;
  modello: string;
  chiave: string;
  nome: string | null;
  ambito: string | null;
  obbligatoria: boolean | null;
  con_scadenza: boolean | null;
  tolta: boolean;
  posizione: number;
}

export interface VoceDocumento extends Omit<VoceCatalogo, "chiave"> {
  /** La chiave: quella di partenza («durc») o una dell'azienda («az-…»). */
  id: string;
  /** Aggiunta dall'azienda. */
  personale: boolean;
  /** Tolta dall'azienda: non compare nelle generali, si può rimettere. */
  tolta: boolean;
  /** L'azienda ha cambiato dove va, se è obbligatoria o se scade. */
  cambiata: boolean;
}

export const PREFISSO_PERSONALE = "az-";
export const isChiavePersonale = (chiave: string) => chiave.startsWith(PREFISSO_PERSONALE);

const ambitoValido = (v: unknown): AmbitoVoce | null => (v === "generale" || v === "figlia" ? v : null);

/** Tutte le voci del modello, comprese quelle tolte (servono alle Impostazioni). */
export function vociDelModello(modello: ModelloGenerale, righe: readonly RigaVoceAzienda[] = []): VoceDocumento[] {
  const mie = righe.filter((r) => r.modello === modello);
  const perChiave = new Map(mie.map((r) => [r.chiave, r]));
  const diPartenza = VOCI_DI_PARTENZA[modello].map((v): VoceDocumento => {
    const r = perChiave.get(v.chiave);
    const ambito = ambitoValido(r?.ambito) ?? v.ambito;
    const obbligatoria = r?.obbligatoria ?? v.obbligatoria;
    const conScadenza = r?.con_scadenza ?? v.conScadenza;
    const { chiave, ...resto } = v;
    return {
      ...resto,
      id: chiave,
      nome: r?.nome?.trim() || v.nome,
      ambito,
      obbligatoria,
      conScadenza,
      personale: false,
      tolta: r?.tolta ?? false,
      cambiata: ambito !== v.ambito || obbligatoria !== v.obbligatoria || conScadenza !== v.conScadenza,
    };
  });
  const personali = mie
    .filter((r) => isChiavePersonale(r.chiave) && r.nome?.trim())
    .sort((a, b) => a.posizione - b.posizione || a.chiave.localeCompare(b.chiave))
    .map((r): VoceDocumento => ({
      id: r.chiave,
      nome: r.nome!.trim(),
      ambito: ambitoValido(r.ambito) ?? "generale",
      obbligatoria: r.obbligatoria ?? true,
      conScadenza: r.con_scadenza ?? false,
      personale: true,
      tolta: r.tolta,
      cambiata: false,
    }));
  return [...diPartenza, ...personali];
}

/** Il nome di una voce nuova dell'azienda, pulito; null se non va bene. */
export function nomeVoceValido(nome: string): string | null {
  const pulito = nome.trim().replace(/\s+/g, " ");
  return pulito.length >= 1 && pulito.length <= 120 ? pulito : null;
}

export function nuovaChiavePersonale(caso: () => number = Math.random): string {
  const alfabeto = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += alfabeto[Math.floor(caso() * alfabeto.length) % alfabeto.length];
  return `${PREFISSO_PERSONALE}${s}`;
}

/** «Sul contratto» / «Sull'operazione», «Su ogni ordine di lavoro» / «Su ogni unità». */
export function etichettaAmbito(modello: ModelloGenerale, ambito: AmbitoVoce): string {
  if (ambito === "figlia") return `Su ogni ${DEFINIZIONI_MODELLI[modello].figlia.una}`;
  return modello === "appalto" ? "Sul contratto" : "Sull'operazione";
}

// ── Riconoscere un file dal nome ─────────────────────────────────────────────

/** Senza accenti, minuscolo, senza estensione, parole separate da uno spazio. */
export function normalizzaNomeFile(nome: string): string {
  return nome
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const PAROLE_VUOTE = new Set(["della", "delle", "degli", "dello", "dell", "alla", "alle", "agli", "allo", "nella", "nelle", "negli", "sulla", "sulle", "dalla", "dalle", "come", "anche", "ogni", "copia"]);

/** Il nome del file riconosce la voce? Le voci dell'azienda: tutte le parole del loro nome (da 4 lettere). */
export function riconosce(voce: Pick<VoceDocumento, "nome" | "riconosci" | "escludi" | "personale">, nomeFile: string): boolean {
  const nome = normalizzaNomeFile(nomeFile);
  if (!nome) return false;
  if (voce.escludi?.test(nome)) return false;
  if (voce.riconosci) return voce.riconosci.test(nome);
  if (!voce.personale) return false;
  const parole = normalizzaNomeFile(voce.nome).split(" ").filter((p) => p.length >= 4 && !PAROLE_VUOTE.has(p));
  if (parole.length === 0) return false;
  const nel = ` ${nome} `;
  return parole.every((p) => nel.includes(` ${p}`));
}

// ── Lo stato dei documenti di una generale ───────────────────────────────────

export type StatoVoce = "presente" | "mancante" | "in_scadenza" | "scaduto" | "non_serve";

/** Un file dell'archivio della generale o di una figlia (order_attachments). */
export interface AllegatoCommessa {
  id: string;
  order_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  created_at: string;
}

/** Una riga di commesse_generali_documenti. */
export interface SegnoDocumento {
  id: string;
  order_id: string;
  voce: string;
  tipo: "documento" | "escluso" | "non_serve";
  attachment_id: string | null;
  scadenza: string | null;
}

export interface DocumentoDellaVoce {
  allegato: AllegatoCommessa;
  /** La riga che lega il file alla voce; null = riconosciuto dal nome, non ancora confermato. */
  segnoId: string | null;
  scadenza: string | null;
  riconosciuto: boolean;
}

export interface CasellaDocumento {
  voce: VoceDocumento;
  orderId: string;
  stato: StatoVoce;
  /** Conta tra i mancanti se manca. */
  obbligatoria: boolean;
  documenti: DocumentoDellaVoce[];
  /** La scadenza più lontana tra i file della voce (il rinnovo più recente). */
  scadenza: string | null;
  /** Giorni alla scadenza: 0 = oggi, negativo = passata. */
  giorni: number | null;
  /** La voce scade ma nessun file dice quando. */
  senzaData: boolean;
  nonServe: { segnoId: string | null; motivo: "scelta" | "nessun_incasso" } | null;
}

export interface ConteggiDocumenti {
  /** Voci obbligatorie che valgono (non «non serve»), sulla generale e su ogni figlia. */
  richiesti: number;
  /** Di queste, quante ci sono (anche se in scadenza). */
  presenti: number;
  mancanti: number;
  inScadenza: number;
  scaduti: number;
  senzaData: number;
}

export interface ChecklistDocumenti {
  /** Le voci sulla generale, una casella ciascuna. */
  generale: CasellaDocumento[];
  /** Le voci su ogni figlia: una casella per figlia, nell'ordine delle figlie. */
  figlie: { voce: VoceDocumento; caselle: CasellaDocumento[] }[];
  conteggi: ConteggiDocumenti;
}

/** Quanti giorni prima della scadenza un documento è «in scadenza». */
export const PREAVVISO_GIORNI = 30;

const giornoUtc = (data: string) => {
  const [a, m, g] = data.slice(0, 10).split("-").map(Number);
  return Date.UTC(a, m - 1, g);
};
export const giorniTra = (da: string, a: string) => Math.round((giornoUtc(a) - giornoUtc(da)) / 86_400_000);

export function aggiungiGiorni(data: string, giorni: number): string {
  return new Date(giornoUtc(data) + giorni * 86_400_000).toISOString().slice(0, 10);
}

/** La data di oggi nel fuso di chi guarda (AAAA-MM-GG). */
export function oggiLocale(d: Date = new Date()): string {
  const due = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`;
}

/** La scadenza da proporre a chi carica oggi un documento di questa voce. */
export const scadenzaProposta = (voce: Pick<VoceDocumento, "conScadenza" | "validitaGiorni">, oggi: string): string | null =>
  voce.conScadenza && voce.validitaGiorni ? aggiungiGiorni(oggi, voce.validitaGiorni) : null;

export function calcolaChecklist(p: {
  voci: readonly VoceDocumento[];
  generaleId: string;
  /** Le figlie della generale; incassato null = chi guarda non vede gli importi. */
  figlie: readonly { id: string; incassato: number | null }[];
  allegati: readonly AllegatoCommessa[];
  segni: readonly SegnoDocumento[];
  oggi: string;
  preavvisoGiorni?: number;
}): ChecklistDocumenti {
  const preavviso = p.preavvisoGiorni ?? PREAVVISO_GIORNI;
  const attive = p.voci.filter((v) => !v.tolta);
  const allegatiPer = new Map<string, AllegatoCommessa[]>();
  for (const a of p.allegati) allegatiPer.set(a.order_id, [...(allegatiPer.get(a.order_id) ?? []), a]);
  const allegatoPerId = new Map(p.allegati.map((a) => [a.id, a]));
  const chiave = (orderId: string, voce: string) => `${orderId}|${voce}`;
  const segniPer = new Map<string, SegnoDocumento[]>();
  for (const s of p.segni) segniPer.set(chiave(s.order_id, s.voce), [...(segniPer.get(chiave(s.order_id, s.voce)) ?? []), s]);
  const segnati = new Set(p.segni.filter((s) => s.tipo === "documento" && s.attachment_id).map((s) => s.attachment_id!));

  // Un file non segnato va alla prima voce (della commessa giusta) che lo riconosce, se non è stato escluso.
  const riconosciuti = new Map<string, AllegatoCommessa[]>();
  const assegna = (orderId: string, ambito: AmbitoVoce) => {
    const voci = attive.filter((v) => v.ambito === ambito);
    for (const a of allegatiPer.get(orderId) ?? []) {
      if (segnati.has(a.id)) continue;
      const voce = voci.find((v) =>
        riconosce(v, a.file_name)
        && !(segniPer.get(chiave(orderId, v.id)) ?? []).some((s) => s.tipo === "escluso" && s.attachment_id === a.id));
      if (voce) riconosciuti.set(chiave(orderId, voce.id), [...(riconosciuti.get(chiave(orderId, voce.id)) ?? []), a]);
    }
  };
  assegna(p.generaleId, "generale");
  for (const f of p.figlie) assegna(f.id, "figlia");

  const casella = (voce: VoceDocumento, orderId: string, incassato?: number | null): CasellaDocumento => {
    const segni = segniPer.get(chiave(orderId, voce.id)) ?? [];
    const documenti: DocumentoDellaVoce[] = [
      ...segni
        .filter((s) => s.tipo === "documento" && s.attachment_id && allegatoPerId.get(s.attachment_id)?.order_id === orderId)
        .map((s): DocumentoDellaVoce => ({ allegato: allegatoPerId.get(s.attachment_id!)!, segnoId: s.id, scadenza: voce.conScadenza ? s.scadenza : null, riconosciuto: false })),
      ...(riconosciuti.get(chiave(orderId, voce.id)) ?? []).map((a): DocumentoDellaVoce => ({ allegato: a, segnoId: null, scadenza: null, riconosciuto: true })),
    ].sort((a, b) => b.allegato.created_at.localeCompare(a.allegato.created_at));

    const sceltaNonServe = segni.find((s) => s.tipo === "non_serve");
    const conIncassi = voce.ambito === "figlia" && voce.soloConIncassi;
    const nonServe = sceltaNonServe
      ? { segnoId: sceltaNonServe.id, motivo: "scelta" as const }
      : conIncassi && incassato === 0 && documenti.length === 0
        ? { segnoId: null as string | null, motivo: "nessun_incasso" as const }
        : null;
    // Senza vedere gli importi non si sa se l'unità ha incassato: la voce resta, ma non conta tra i mancanti.
    const obbligatoria = voce.obbligatoria && !(conIncassi && incassato == null);

    const date = documenti.map((d) => d.scadenza).filter((d): d is string => !!d).sort();
    const scadenza = voce.conScadenza ? date[date.length - 1] ?? null : null;
    const giorni = scadenza ? giorniTra(p.oggi, scadenza) : null;
    const stato: StatoVoce = nonServe
      ? "non_serve"
      : documenti.length === 0
        ? "mancante"
        : giorni === null
          ? "presente"
          : giorni < 0
            ? "scaduto"
            : giorni <= preavviso ? "in_scadenza" : "presente";
    return {
      voce, orderId, stato, obbligatoria, documenti, scadenza, giorni,
      senzaData: !nonServe && voce.conScadenza && documenti.length > 0 && scadenza === null,
      nonServe,
    };
  };

  const generale = attive.filter((v) => v.ambito === "generale").map((v) => casella(v, p.generaleId));
  const figlie = attive
    .filter((v) => v.ambito === "figlia")
    .map((v) => ({ voce: v, caselle: p.figlie.map((f) => casella(v, f.id, f.incassato)) }));
  const tutte = [...generale, ...figlie.flatMap((g) => g.caselle)];
  const richieste = tutte.filter((c) => c.obbligatoria && c.stato !== "non_serve");
  return {
    generale,
    figlie,
    conteggi: {
      richiesti: richieste.length,
      presenti: richieste.filter((c) => c.stato === "presente" || c.stato === "in_scadenza").length,
      mancanti: richieste.filter((c) => c.stato === "mancante").length,
      inScadenza: tutte.filter((c) => c.stato === "in_scadenza").length,
      scaduti: tutte.filter((c) => c.stato === "scaduto").length,
      senzaData: tutte.filter((c) => c.senzaData).length,
    },
  };
}

// ── Parole ───────────────────────────────────────────────────────────────────

/** «3 documenti mancanti, 1 in scadenza»; null se non c'è niente da fare. */
export function testoConteggi(c: Pick<ConteggiDocumenti, "mancanti" | "scaduti" | "inScadenza">): string | null {
  const parti: [number, string, string][] = [
    [c.mancanti, "mancante", "mancanti"],
    [c.scaduti, "scaduto", "scaduti"],
    [c.inScadenza, "in scadenza", "in scadenza"],
  ];
  const presenti = parti.filter(([n]) => n > 0);
  if (presenti.length === 0) return null;
  return presenti
    .map(([n, uno, tanti], i) => (i === 0 ? `${n} ${n === 1 ? "documento" : "documenti"} ${n === 1 ? uno : tanti}` : `${n} ${n === 1 ? uno : tanti}`))
    .join(", ");
}

export const formattaData = (data: string) => {
  const [a, m, g] = data.slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
};

/** Lo stato di una casella in poche parole, dal punto di vista di chi deve fare qualcosa. */
export function testoCasella(c: CasellaDocumento): string {
  switch (c.stato) {
    case "non_serve":
      return c.nonServe?.motivo === "nessun_incasso" ? "Non serve: nessun acconto incassato" : "Non serve";
    case "mancante":
      return c.obbligatoria ? "Manca" : "Non caricato";
    case "scaduto":
      return `Scaduto il ${formattaData(c.scadenza!)}`;
    case "in_scadenza":
      return c.giorni === 0 ? "Scade oggi" : c.giorni === 1 ? "Scade domani" : `Scade tra ${c.giorni} giorni`;
    case "presente":
      if (c.senzaData) return "Manca la data di scadenza";
      return c.scadenza ? `Scade il ${formattaData(c.scadenza)}` : "Presente";
  }
}

/** Le caselle di una voce sulle figlie che chiedono di fare qualcosa (per il «3 di 6»). */
export function riepilogoVoceFiglie(caselle: readonly CasellaDocumento[]): { valgono: number; presenti: number; daFare: number } {
  const valgono = caselle.filter((c) => c.stato !== "non_serve");
  return {
    valgono: valgono.length,
    presenti: valgono.filter((c) => c.stato === "presente" || c.stato === "in_scadenza").length,
    daFare: valgono.filter((c) => (c.stato === "mancante" && c.obbligatoria) || c.stato === "scaduto" || c.stato === "in_scadenza").length,
  };
}
