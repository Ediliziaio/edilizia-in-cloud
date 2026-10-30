// src/lib/orders/generali/contratto.ts
// Modulo «Contratto e SAL» della commessa generale: parole e conti, senza React né database.
//
// I numeri del SAL di contratto (voci, lordo, ritenuta, recupero dell'anticipazione, netto) li
// calcola il database (generale_sal_anteprima e generale_sal_crea, migrazione 20281031100000):
// qui si leggono e si mostrano, così l'anteprima e il documento non possono dire due cose diverse.
// Si calcola qui solo ciò che serve mentre si scrive: valore aggiornato, prezzi netti, scadenze.

export type TipoAtto = "atto_aggiuntivo" | "variante" | "proroga";
export type TipoGaranzia = "cauzione_definitiva" | "garanzia_anticipazione" | "car" | "rata_saldo" | "altra";
export type TipoVoceSal = "avanzamento" | "misure" | "sicurezza";

export const TIPI_ATTO: Record<TipoAtto, string> = {
  atto_aggiuntivo: "Atto aggiuntivo",
  variante: "Variante",
  proroga: "Proroga",
};

export const TIPI_GARANZIA: Record<TipoGaranzia, string> = {
  cauzione_definitiva: "Cauzione definitiva",
  garanzia_anticipazione: "Garanzia dell'anticipazione",
  car: "Polizza CAR",
  rata_saldo: "Garanzia della rata di saldo",
  altra: "Altra garanzia",
};

export const STATI_SAL: Record<string, string> = {
  bozza: "Bozza",
  emesso: "Emesso",
  approvato: "Approvato",
  firmato: "Firmato dal committente",
};
const STATI_EMESSI = new Set(["emesso", "approvato", "firmato"]);
export const salEmesso = (s: { stato: string }) => STATI_EMESSI.has(s.stato);

export interface ContrattoGenerale {
  riferimento: string | null;
  /** Lavori a base del contratto, soggetti a ribasso. Senza, il contratto non dà ancora il valore. */
  importoBase: number | null;
  ribassoPct: number;
  oneriSicurezza: number;
  dataFirma: string | null;
  dataConsegnaLavori: string | null;
  dataFinePrevista: string | null;
  dataUltimazione: string | null;
  penaleGiornaliera: number | null;
  penaleMassimaPct: number;
  anticipazionePct: number;
  anticipazioneImporto: number | null;
  anticipazioneData: string | null;
  ritenutaPct: number;
  cig: string | null;
  cup: string | null;
  splitPayment: boolean;
  reverseCharge: boolean;
  note: string | null;
}

export interface Allegato { id: string; nome: string; percorso: string }

export interface AttoAggiuntivo {
  id: string;
  tipo: TipoAtto;
  numero: string | null;
  data: string;
  descrizione: string;
  /** Con il segno: + aumenta il contratto, − lo riduce. Zero per le proroghe. */
  importo: number;
  giorniProroga: number;
  allegato: Allegato | null;
}

export interface Garanzia {
  id: string;
  tipo: TipoGaranzia;
  garante: string | null;
  numero: string | null;
  importo: number | null;
  dataEmissione: string | null;
  scadenza: string | null;
  svincolataIl: string | null;
  note: string | null;
  allegato: Allegato | null;
}

export interface VoceSal {
  id: string;
  descrizione: string;
  importoContrattuale: number;
  percentuale: number;
  importo: number;
  tipo: TipoVoceSal | null;
  /** L'ordine di lavoro da cui arriva la voce (null: oneri della sicurezza o SAL fatto a mano). */
  figliaId: string | null;
  voceId: string | null;
  quantita: number | null;
  prezzo: number | null;
  unita: string | null;
}

export interface SalContratto {
  id: string;
  numero: number;
  stato: string;
  data: string | null;
  note: string | null;
  /** Totale cumulativo delle voci: lavori eseguiti dall'inizio. */
  cumulativo: number;
  dal: string | null;
  al: string | null;
  precedente: number;
  /** Quota di questo SAL: cumulativo − ultimo SAL emesso. */
  lordo: number;
  ritenutaPct: number;
  ritenuta: number;
  recuperoPct: number;
  recupero: number;
  netto: number;
  /** false = SAL scritto sulla generale fuori da questo modulo (senza periodo né netto). */
  diContratto: boolean;
  registro: { id: string; stato: string; svincolataIl: string | null } | null;
  firma: { da: string | null; il: string | null } | null;
  voci: VoceSal[];
}

export interface FatturaContratto {
  id: string;
  numero: string | null;
  data: string | null;
  scadenza: string | null;
  stato: string | null;
  totale: number;
  incassato: number;
}

export interface DatiContratto {
  permessi: { importi: boolean; modifica: boolean };
  contratto: ContrattoGenerale | null;
  atti: AttoAggiuntivo[];
  garanzie: Garanzia[];
  sal: SalContratto[];
  fatture: FatturaContratto[];
  elencoVoci: number;
}

// ── Lettura della risposta di generale_contratto_leggi ──────────────────────
const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const zero = (v: unknown): number => numero(v) ?? 0;
const testo = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const lista = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : [];
const allegato = (r: Record<string, unknown>): Allegato | null =>
  typeof r.allegato_id === "string" && typeof r.allegato_percorso === "string"
    ? { id: r.allegato_id, nome: testo(r.allegato_nome) ?? "Documento", percorso: r.allegato_percorso }
    : null;
const tipoAtto = (v: unknown): TipoAtto => (v === "variante" || v === "proroga" ? v : "atto_aggiuntivo");
const tipoGaranzia = (v: unknown): TipoGaranzia =>
  typeof v === "string" && v in TIPI_GARANZIA ? (v as TipoGaranzia) : "altra";
const tipoVoce = (v: unknown): TipoVoceSal | null =>
  v === "avanzamento" || v === "misure" || v === "sicurezza" ? v : null;

export function leggiContratto(c: unknown): ContrattoGenerale | null {
  if (!c || typeof c !== "object") return null;
  const r = c as Record<string, unknown>;
  return {
    riferimento: testo(r.riferimento),
    importoBase: numero(r.importo_base),
    ribassoPct: zero(r.ribasso_pct),
    oneriSicurezza: zero(r.oneri_sicurezza),
    dataFirma: testo(r.data_firma),
    dataConsegnaLavori: testo(r.data_consegna_lavori),
    dataFinePrevista: testo(r.data_fine_prevista),
    dataUltimazione: testo(r.data_ultimazione),
    penaleGiornaliera: numero(r.penale_giornaliera),
    penaleMassimaPct: numero(r.penale_massima_pct) ?? 10,
    anticipazionePct: zero(r.anticipazione_pct),
    anticipazioneImporto: numero(r.anticipazione_importo),
    anticipazioneData: testo(r.anticipazione_data),
    ritenutaPct: numero(r.ritenuta_pct) ?? 0.5,
    cig: testo(r.cig),
    cup: testo(r.cup),
    splitPayment: r.split_payment === true,
    reverseCharge: r.reverse_charge === true,
    note: testo(r.note),
  };
}

export function leggiDatiContratto(data: unknown): DatiContratto {
  const d = (data ?? {}) as Record<string, unknown>;
  const p = (d.permessi ?? {}) as Record<string, unknown>;
  return {
    permessi: { importi: p.importi === true, modifica: p.modifica === true },
    contratto: leggiContratto(d.contratto),
    atti: lista(d.atti).filter((a) => typeof a.id === "string").map((a) => ({
      id: a.id as string,
      tipo: tipoAtto(a.tipo),
      numero: testo(a.numero),
      data: testo(a.data) ?? "",
      descrizione: testo(a.descrizione) ?? "Atto senza descrizione",
      importo: zero(a.importo),
      giorniProroga: Math.max(0, Math.round(zero(a.giorni_proroga))),
      allegato: allegato(a),
    })),
    garanzie: lista(d.garanzie).filter((g) => typeof g.id === "string").map((g) => ({
      id: g.id as string,
      tipo: tipoGaranzia(g.tipo),
      garante: testo(g.garante),
      numero: testo(g.numero),
      importo: numero(g.importo),
      dataEmissione: testo(g.data_emissione),
      scadenza: testo(g.scadenza),
      svincolataIl: testo(g.svincolata_il),
      note: testo(g.note),
      allegato: allegato(g),
    })),
    sal: lista(d.sal).filter((s) => typeof s.id === "string").map((s) => {
      const reg = s.registro && typeof s.registro === "object" ? (s.registro as Record<string, unknown>) : null;
      const firma = s.firma && typeof s.firma === "object" ? (s.firma as Record<string, unknown>) : null;
      return {
        id: s.id as string,
        numero: Math.round(zero(s.numero)),
        stato: testo(s.stato) ?? "bozza",
        data: testo(s.data),
        note: testo(s.note),
        cumulativo: zero(s.cumulativo),
        dal: testo(s.dal),
        al: testo(s.al),
        precedente: zero(s.precedente),
        lordo: zero(s.lordo),
        ritenutaPct: zero(s.ritenuta_pct),
        ritenuta: zero(s.ritenuta),
        recuperoPct: zero(s.recupero_pct),
        recupero: zero(s.recupero),
        netto: zero(s.netto),
        diContratto: s.di_contratto === true,
        registro: reg && typeof reg.id === "string"
          ? { id: reg.id, stato: testo(reg.stato) ?? "trattenuta", svincolataIl: testo(reg.svincolata_il) }
          : null,
        firma: firma ? { da: testo(firma.da), il: testo(firma.il) } : null,
        voci: lista(s.voci).filter((v) => typeof v.id === "string").map((v) => ({
          id: v.id as string,
          descrizione: testo(v.descrizione) ?? "",
          importoContrattuale: zero(v.importo_contrattuale),
          percentuale: zero(v.percentuale),
          importo: zero(v.importo),
          tipo: tipoVoce(v.tipo),
          figliaId: testo(v.figlia_id),
          voceId: testo(v.voce_id),
          quantita: numero(v.quantita),
          prezzo: numero(v.prezzo),
          unita: testo(v.unita),
        })),
      };
    }),
    fatture: lista(d.fatture).filter((f) => typeof f.id === "string").map((f) => ({
      id: f.id as string,
      numero: testo(f.numero),
      data: testo(f.data),
      scadenza: testo(f.scadenza),
      stato: testo(f.stato),
      totale: zero(f.totale),
      incassato: zero(f.incassato),
    })),
    elencoVoci: Math.round(zero(d.elenco_voci)),
  };
}

/** Cosa uscirebbe dal prossimo SAL: la risposta di generale_sal_anteprima. */
export interface AnteprimaSal {
  numero: number;
  voci: (Omit<VoceSal, "id"> & { ordine: number })[];
  cumulativo: number;
  precedente: number;
  lordo: number;
  ritenutaPct: number;
  ritenuta: number;
  recuperoPct: number;
  recupero: number;
  anticipazioneResidua: number;
  netto: number;
  ultimoAl: string | null;
  misureNuove: number;
}

export function leggiAnteprimaSal(data: unknown): AnteprimaSal {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    numero: Math.max(1, Math.round(zero(d.numero))),
    voci: lista(d.voci).map((v, i) => ({
      ordine: Math.round(numero(v.ordine) ?? i + 1),
      descrizione: testo(v.descrizione) ?? "",
      importoContrattuale: zero(v.importo_contrattuale),
      percentuale: zero(v.percentuale),
      importo: zero(v.importo),
      tipo: tipoVoce(v.tipo),
      figliaId: testo(v.figlia_id),
      voceId: testo(v.voce_id),
      quantita: numero(v.quantita),
      prezzo: numero(v.prezzo),
      unita: testo(v.unita),
    })),
    cumulativo: zero(d.cumulativo),
    precedente: zero(d.precedente),
    lordo: zero(d.lordo),
    ritenutaPct: zero(d.ritenuta_pct),
    ritenuta: zero(d.ritenuta),
    recuperoPct: zero(d.recupero_pct),
    recupero: zero(d.recupero),
    anticipazioneResidua: zero(d.anticipazione_residua),
    netto: zero(d.netto),
    ultimoAl: testo(d.ultimo_al),
    misureNuove: Math.round(zero(d.misure_nuove)),
  };
}

// ── Conti ───────────────────────────────────────────────────────────────────
/** Al centesimo, come round(…, 2) del database per gli importi positivi. */
export const arrotonda = (n: number) => Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-6) / 100;

export interface ValoreContratto {
  base: number;
  /** Quanto toglie il ribasso (positivo). */
  ribasso: number;
  lavoriNetti: number;
  sicurezza: number;
  /** Somma degli atti aggiuntivi e delle varianti, con il segno. */
  atti: number;
  /** Il valore della generale: lavori ribassati + sicurezza + atti. */
  aggiornato: number;
}

/** Il valore contrattuale aggiornato, scomposto. null finché manca l'importo base. Stessa formula di generale_contratto_valore. */
export function valoreContratto(c: ContrattoGenerale | null, atti: readonly Pick<AttoAggiuntivo, "importo">[]): ValoreContratto | null {
  if (!c || c.importoBase === null) return null;
  const lavoriNetti = arrotonda(c.importoBase * (1 - c.ribassoPct / 100));
  const sommaAtti = arrotonda(atti.reduce((t, a) => t + a.importo, 0));
  return {
    base: c.importoBase,
    ribasso: arrotonda(c.importoBase - lavoriNetti),
    lavoriNetti,
    sicurezza: c.oneriSicurezza,
    atti: sommaAtti,
    aggiornato: arrotonda(lavoriNetti + c.oneriSicurezza + sommaAtti),
  };
}

export interface VoceElenco {
  id: string;
  codice: string | null;
  descrizione: string;
  unitaMisura: string;
  prezzo: number;
  soggettoRibasso: boolean;
  quantitaContratto: number | null;
  posizione: number;
}

/** Il prezzo dopo il ribasso del contratto (se la voce è soggetta). */
export function prezzoNetto(voce: Pick<VoceElenco, "prezzo" | "soggettoRibasso">, ribassoPct: number): number {
  return voce.soggettoRibasso ? voce.prezzo * (1 - ribassoPct / 100) : voce.prezzo;
}

/** Quantità × prezzo netto, al centesimo: la stessa riga del database (SAL a misure e ordini prezzati). */
export function importoVoce(quantita: number, voce: Pick<VoceElenco, "prezzo" | "soggettoRibasso">, ribassoPct: number): number {
  return arrotonda(quantita * prezzoNetto(voce, ribassoPct));
}

export interface RigaComputo { voceId: string; quantita: number }

/** L'importo di un ordine di lavoro prezzato dall'elenco: Σ quantità × prezzo netto (generale_figlia_prezza). */
export function importoDaElenco(righe: readonly RigaComputo[], elenco: ReadonlyMap<string, VoceElenco>, ribassoPct: number): number {
  return arrotonda(righe.reduce((t, r) => {
    const v = elenco.get(r.voceId);
    return v ? t + importoVoce(r.quantita, v, ribassoPct) : t;
  }, 0));
}

export interface MisuraFiglia {
  id: string;
  figliaId: string;
  voceId: string;
  data: string;
  quantita: number;
  descrizione: string | null;
  salId: string | null;
}

/** Per ogni voce di un ordine: quantità prevista (computo), eseguita (misure) e a finire. */
export function avanzamentoMisure(
  computo: readonly RigaComputo[],
  misure: readonly Pick<MisuraFiglia, "voceId" | "quantita" | "salId">[],
): Map<string, { prevista: number; eseguita: number; inSal: number; aFinire: number }> {
  const mappa = new Map<string, { prevista: number; eseguita: number; inSal: number; aFinire: number }>();
  const di = (id: string) => {
    if (!mappa.has(id)) mappa.set(id, { prevista: 0, eseguita: 0, inSal: 0, aFinire: 0 });
    return mappa.get(id)!;
  };
  for (const r of computo) di(r.voceId).prevista += r.quantita;
  for (const m of misure) {
    const x = di(m.voceId);
    x.eseguita += m.quantita;
    if (m.salId) x.inSal += m.quantita;
  }
  for (const x of mappa.values()) {
    x.prevista = Math.round(x.prevista * 1000) / 1000;
    x.eseguita = Math.round(x.eseguita * 1000) / 1000;
    x.inSal = Math.round(x.inSal * 1000) / 1000;
    x.aFinire = Math.round((x.prevista - x.eseguita) * 1000) / 1000;
  }
  return mappa;
}

// ── Date, penale, anticipazione, ritenute ───────────────────────────────────
const giorno = (iso: string) => {
  const [a, m, g] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(a, (m || 1) - 1, g || 1);
};
const GIORNO_MS = 86_400_000;
export const giorniTra = (da: string, a: string) => Math.round((giorno(a) - giorno(da)) / GIORNO_MS);
export const aggiungiGiorni = (iso: string, giorni: number) => new Date(giorno(iso) + giorni * GIORNO_MS).toISOString().slice(0, 10);
/** La data di oggi (giorno locale) in formato ISO. */
export const oggiIso = (adesso = new Date()) =>
  `${adesso.getFullYear()}-${String(adesso.getMonth() + 1).padStart(2, "0")}-${String(adesso.getDate()).padStart(2, "0")}`;

/** Fine dei lavori con le proroghe: la data del contratto più i giorni di ogni atto. */
export function fineAggiornata(c: ContrattoGenerale | null, atti: readonly Pick<AttoAggiuntivo, "giorniProroga">[]): { data: string | null; giorni: number } {
  const giorni = atti.reduce((t, a) => t + a.giorniProroga, 0);
  if (!c?.dataFinePrevista) return { data: null, giorni };
  return { data: aggiungiGiorni(c.dataFinePrevista, giorni), giorni };
}

/** La penale maturata: giorni oltre la fine aggiornata × penale al giorno, con il tetto in % del valore. */
export function penaleMaturata(
  c: ContrattoGenerale | null,
  atti: readonly AttoAggiuntivo[],
  oggi: string,
): { giorni: number; importo: number; tetto: number | null; alTetto: boolean } | null {
  const fine = fineAggiornata(c, atti).data;
  if (!c || !fine || !c.penaleGiornaliera) return null;
  const giorni = giorniTra(fine, c.dataUltimazione ?? oggi);
  if (giorni <= 0) return null;
  const valore = valoreContratto(c, atti)?.aggiornato ?? null;
  const tetto = valore !== null ? arrotonda((valore * c.penaleMassimaPct) / 100) : null;
  const lorda = arrotonda(giorni * c.penaleGiornaliera);
  return { giorni, importo: tetto !== null ? Math.min(lorda, tetto) : lorda, tetto, alTetto: tetto !== null && lorda >= tetto };
}

export function anticipazione(c: ContrattoGenerale | null, sal: readonly SalContratto[]) {
  const importo = c?.anticipazioneImporto ?? 0;
  const recuperato = arrotonda(sal.filter((s) => s.diContratto && salEmesso(s)).reduce((t, s) => t + s.recupero, 0));
  return { importo, recuperato, daRecuperare: arrotonda(Math.max(0, importo - recuperato)) };
}

export function ritenute(sal: readonly SalContratto[]) {
  const emessi = sal.filter((s) => s.diContratto && salEmesso(s) && s.ritenuta > 0);
  const trattenute = arrotonda(emessi.reduce((t, s) => t + s.ritenuta, 0));
  const svincolate = arrotonda(emessi.filter((s) => s.registro?.stato === "svincolata").reduce((t, s) => t + s.ritenuta, 0));
  return {
    trattenute,
    svincolate,
    daSvincolare: arrotonda(trattenute - svincolate),
    /** SAL emessi con una ritenuta che non è ancora nel registro delle ritenute. */
    daRegistrare: emessi.filter((s) => !s.registro).length,
  };
}

/** I numeri dei SAL di contratto: quanto è stato messo a SAL (ultimo cumulativo emesso) e il netto. */
export function totaliSal(sal: readonly SalContratto[]) {
  const emessi = sal.filter((s) => s.diContratto && salEmesso(s));
  const ultimo = emessi.reduce<SalContratto | null>((u, s) => (!u || s.numero > u.numero ? s : u), null);
  return {
    emessi: emessi.length,
    aSal: ultimo?.cumulativo ?? 0,
    netto: arrotonda(emessi.reduce((t, s) => t + s.netto, 0)),
    bozza: sal.find((s) => s.stato === "bozza") ?? null,
    ultimoAl: emessi.reduce<string | null>((u, s) => (s.al && (!u || s.al > u) ? s.al : u), null),
  };
}

// ── «Cosa richiede attenzione» del contratto ────────────────────────────────
export interface ScadenzaContratto { id: string; testo: string; data: string | null; tono: "attenzione" | "info" }

const dataIt = (iso: string) => {
  const [a, m, g] = iso.slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
};

/** Le scadenze vicine (entro `giorni`) e le cose da fare, la più urgente prima. */
export function scadenzeContratto(d: DatiContratto, oggi: string, giorni = 60): ScadenzaContratto[] {
  const out: ScadenzaContratto[] = [];
  for (const g of d.garanzie) {
    if (g.svincolataIl || !g.scadenza) continue;
    const mancano = giorniTra(oggi, g.scadenza);
    if (mancano > giorni) continue;
    const nome = TIPI_GARANZIA[g.tipo];
    out.push({
      id: `garanzia-${g.id}`,
      data: g.scadenza,
      tono: mancano <= 30 ? "attenzione" : "info",
      testo: mancano < 0
        ? `${nome} scaduta il ${dataIt(g.scadenza)}: chiedi il rinnovo o lo svincolo.`
        : mancano === 0 ? `${nome} scade oggi.` : `${nome} scade il ${dataIt(g.scadenza)} (tra ${mancano} giorni).`,
    });
  }
  const c = d.contratto;
  const fine = fineAggiornata(c, d.atti).data;
  if (c && fine && !c.dataUltimazione) {
    const mancano = giorniTra(oggi, fine);
    if (mancano < 0) {
      const penale = penaleMaturata(c, d.atti, oggi);
      out.push({
        id: "fine-lavori",
        data: fine,
        tono: "attenzione",
        testo: `Lavori oltre la fine prevista (${dataIt(fine)}) di ${-mancano} giorni`
          + (penale ? `: penale maturata ${formattaEuroContratto(penale.importo)}${penale.alTetto ? " (al tetto)" : ""}.` : "."),
      });
    } else if (mancano <= Math.min(giorni, 30)) {
      out.push({ id: "fine-lavori", data: fine, tono: "info", testo: `Fine lavori prevista il ${dataIt(fine)} (tra ${mancano} giorni).` });
    }
  }
  const bozza = d.sal.find((s) => s.stato === "bozza");
  if (bozza) out.push({ id: "sal-bozza", data: bozza.al, tono: "info", testo: `Il SAL n. ${bozza.numero} è in bozza: controllalo ed emettilo.` });
  const daRegistrare = ritenute(d.sal).daRegistrare;
  if (daRegistrare > 0) {
    out.push({
      id: "ritenute-registro",
      data: null,
      tono: "info",
      testo: daRegistrare === 1
        ? "La ritenuta di un SAL non è ancora nel registro delle ritenute."
        : `Le ritenute di ${daRegistrare} SAL non sono ancora nel registro delle ritenute.`,
    });
  }
  return out.sort((a, b) => (a.tono === b.tono ? (a.data ?? "9999").localeCompare(b.data ?? "9999") : a.tono === "attenzione" ? -1 : 1));
}

// ── Il modulo del contratto ─────────────────────────────────────────────────
/** Il contratto come si salva (colonne di generale_contratti). */
export function contrattoPerDb(c: ContrattoGenerale) {
  return {
    riferimento: c.riferimento,
    importo_base: c.importoBase,
    ribasso_pct: c.ribassoPct,
    oneri_sicurezza: c.oneriSicurezza,
    data_firma: c.dataFirma,
    data_consegna_lavori: c.dataConsegnaLavori,
    data_fine_prevista: c.dataFinePrevista,
    data_ultimazione: c.dataUltimazione,
    penale_giornaliera: c.penaleGiornaliera,
    penale_massima_pct: c.penaleMassimaPct,
    anticipazione_pct: c.anticipazionePct,
    anticipazione_importo: c.anticipazioneImporto,
    anticipazione_data: c.anticipazioneData,
    ritenuta_pct: c.ritenutaPct,
    cig: c.cig,
    cup: c.cup,
    split_payment: c.splitPayment,
    reverse_charge: c.reverseCharge,
    note: c.note,
  };
}

export const CONTRATTO_VUOTO: ContrattoGenerale = {
  riferimento: null, importoBase: null, ribassoPct: 0, oneriSicurezza: 0,
  dataFirma: null, dataConsegnaLavori: null, dataFinePrevista: null, dataUltimazione: null,
  penaleGiornaliera: null, penaleMassimaPct: 10,
  anticipazionePct: 0, anticipazioneImporto: null, anticipazioneData: null,
  ritenutaPct: 0.5, cig: null, cup: null, splitPayment: false, reverseCharge: false, note: null,
};

/** Cosa non va nel contratto prima di salvarlo: un messaggio per campo, nelle parole di chi lo compila. */
export function erroriContratto(c: ContrattoGenerale): Partial<Record<keyof ContrattoGenerale, string>> {
  const e: Partial<Record<keyof ContrattoGenerale, string>> = {};
  if (c.importoBase !== null && c.importoBase < 0) e.importoBase = "L'importo non può essere negativo.";
  if (c.ribassoPct < 0 || c.ribassoPct >= 100) e.ribassoPct = "Il ribasso va da 0 a meno di 100%.";
  if (c.oneriSicurezza < 0) e.oneriSicurezza = "Gli oneri non possono essere negativi.";
  if (c.ritenutaPct < 0 || c.ritenutaPct > 100) e.ritenutaPct = "Una percentuale tra 0 e 100.";
  if (c.anticipazionePct < 0 || c.anticipazionePct > 100) e.anticipazionePct = "Una percentuale tra 0 e 100.";
  if (c.penaleMassimaPct < 0 || c.penaleMassimaPct > 100) e.penaleMassimaPct = "Una percentuale tra 0 e 100.";
  if (c.penaleGiornaliera !== null && c.penaleGiornaliera < 0) e.penaleGiornaliera = "La penale non può essere negativa.";
  if (c.anticipazioneImporto !== null && c.anticipazioneImporto < 0) e.anticipazioneImporto = "L'importo non può essere negativo.";
  if (c.dataConsegnaLavori && c.dataFinePrevista && c.dataFinePrevista < c.dataConsegnaLavori) {
    e.dataFinePrevista = "La fine viene prima della consegna dei lavori.";
  }
  if (c.splitPayment && c.reverseCharge) e.reverseCharge = "Scissione dei pagamenti e inversione contabile non vanno insieme.";
  return e;
}

/** L'anticipazione proposta: la percentuale sul valore aggiornato (il contratto la può fissare diversa). */
export function anticipazioneProposta(c: ContrattoGenerale, atti: readonly Pick<AttoAggiuntivo, "importo">[]): number | null {
  const v = valoreContratto(c, atti);
  return v && c.anticipazionePct > 0 ? arrotonda((v.aggiornato * c.anticipazionePct) / 100) : null;
}

/** Il messaggio del database se è scritto per chi usa l'app; altrimenti uno generico. */
export function messaggioContratto(e: unknown, cosa: string): string {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === "23505") return "C'è già una voce con questo codice nell'elenco prezzi.";
  if (err?.code === "23503") return "Questa voce ha delle misure: toglile prima di togliere la voce.";
  if (err?.code === "42501") return err.message?.startsWith("Non hai") ? err.message : "Non hai il permesso di farlo.";
  if (err?.code === "23514" && err.message && !/violates check constraint/i.test(err.message)) return err.message;
  if (err?.code === "22023" || err?.code === "P0002") return err.message ?? `Non è stato possibile salvare ${cosa}.`;
  return `Non è stato possibile salvare ${cosa}. Riprova tra poco.`;
}

const EURO = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Importi del contratto con i centesimi: ritenute e netti si leggono al centesimo. */
export const formattaEuroContratto = (n: number) => EURO.format(n);
